// PesaPal calls this URL (GET) when a payment status changes.
// It must respond with the exact JSON below — PesaPal uses this to confirm receipt.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTransactionStatus } from "@/app/lib/pesapal";
import { completeOrderOnce } from "@/app/lib/pesapal-fulfillment";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderTrackingId = searchParams.get("orderTrackingId") ?? "";
  const orderMerchantReference = searchParams.get("orderMerchantReference") ?? "";

  // PesaPal requires this exact response structure regardless of outcome
  const ack = { orderNotificationType: "IPNCHANGE", orderTrackingId, orderMerchantReference, status: 200 };

  if (!orderTrackingId || !orderMerchantReference) return NextResponse.json(ack);

  try {
    const txn = await getTransactionStatus(orderTrackingId);
    const completed = txn.payment_status_description === "Completed";

    if (completed) {
      await completeOrderOnce(supabase, {
        orderTrackingId,
        merchantReference: orderMerchantReference,
        paymentMethod: txn.payment_method,
        confirmationCode: txn.confirmation_code,
      });
    } else {
      await supabase
        .from("pesapal_orders")
        .update({
          status: "failed",
          order_tracking_id: orderTrackingId,
          payment_method: txn.payment_method,
          confirmation_code: txn.confirmation_code,
          updated_at: new Date().toISOString(),
        })
        .eq("merchant_reference", orderMerchantReference)
        .neq("status", "completed");
    }
  } catch (err) {
    console.error("PesaPal IPN error:", err);
  }

  return NextResponse.json(ack);
}
