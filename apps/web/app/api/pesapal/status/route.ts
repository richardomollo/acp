import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTransactionStatus } from "@/app/lib/pesapal";
import { completeOrderOnce } from "@/app/lib/pesapal-fulfillment";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function getBookingDetails(order: Row) {
  const meta: Row = order.metadata ?? {};
  const bookingId: string | null = meta.bookingId ?? null;
  if (!bookingId) return null;

  let confirmationCode: string | null = null;
  let remainderAmount: number | null = null;
  let itemName: string | null = null;

  if (order.type === "session") {
    const { data } = await supabase
      .from("bookings")
      .select("confirmation_code, remainder_amount, sessions(name)")
      .eq("id", bookingId)
      .maybeSingle();
    const row = data as Row | null;
    confirmationCode = row?.confirmation_code ?? null;
    remainderAmount = row?.remainder_amount ?? null;
    itemName = (row?.sessions as Row)?.name ?? null;
  } else if (order.type === "experience") {
    const { data } = await supabase
      .from("experience_bookings")
      .select("confirmation_code, remainder_amount, experiences(name)")
      .eq("id", bookingId)
      .maybeSingle();
    const row = data as Row | null;
    confirmationCode = row?.confirmation_code ?? null;
    remainderAmount = row?.remainder_amount ?? null;
    itemName = (row?.experiences as Row)?.name ?? null;
  } else if (order.type === "pt") {
    const { data } = await supabase
      .from("pt_bookings")
      .select("id, pt_offerings(title)")
      .eq("id", bookingId)
      .maybeSingle();
    const row = data as Row | null;
    itemName = (row?.pt_offerings as Row)?.title ?? meta.offeringTitle ?? null;
  }

  return { confirmationCode, remainderAmount, itemName, type: order.type };
}

export async function GET(req: NextRequest) {
  const orderTrackingId = req.nextUrl.searchParams.get("orderTrackingId");
  if (!orderTrackingId) {
    return NextResponse.json({ error: "Missing orderTrackingId" }, { status: 400 });
  }
  try {
    const status = await getTransactionStatus(orderTrackingId);

    if (status.payment_status_description === "Completed") {
      // PesaPal's IPN webhook is not guaranteed to reach us — if it hasn't
      // landed yet, fulfill right here so the booking isn't left stranded as
      // unpaid despite the payment having actually gone through. Idempotent:
      // a no-op if the IPN already completed it.
      await completeOrderOnce(supabase, {
        orderTrackingId,
        paymentMethod: status.payment_method,
        confirmationCode: status.confirmation_code,
      });

      const { data: order } = await supabase
        .from("pesapal_orders")
        .select("type, metadata, amount")
        .eq("order_tracking_id", orderTrackingId)
        .maybeSingle();

      if (order) {
        const bookingDetails = await getBookingDetails(order as Row);
        return NextResponse.json({ ...status, bookingDetails });
      }
    }

    return NextResponse.json(status);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
