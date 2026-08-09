import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { submitOrder } from "@/app/lib/pesapal";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://activecitypass.com";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = body?.type as string | undefined;
    const metadata = body?.metadata ?? {};

    // ── PT bookings: handled here directly (booking already pre-created) ──────
    if (type === "pt") {
      const ipnId = process.env.PESAPAL_IPN_ID;
      if (!ipnId) return NextResponse.json({ error: "PESAPAL_IPN_ID not configured" }, { status: 500 });

      const amount = Number(body.amount);
      const email = String(body.email ?? "").trim();
      if (!amount || !email) return NextResponse.json({ error: "amount and email required" }, { status: 400 });

      const merchantRef = `ACP-PT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );

      await supabase.from("pesapal_orders").insert({
        merchant_reference: merchantRef,
        type: "pt",
        amount,
        currency: "KES",
        email,
        status: "pending",
        metadata,
      });

      const result = await submitOrder({
        id: merchantRef,
        currency: "KES",
        amount,
        description: String(body.description ?? `PT session`),
        callback_url: `${BASE_URL}/pesapal/callback`,
        notification_id: ipnId,
        billing_address: {
          email_address: email,
          phone_number: String(body.phone ?? "").trim() || undefined,
          first_name: String(body.firstName ?? "").trim() || undefined,
          last_name: String(body.lastName ?? "").trim() || undefined,
          country_code: "KE",
        },
      });

      await supabase
        .from("pesapal_orders")
        .update({ order_tracking_id: result.order_tracking_id })
        .eq("merchant_reference", merchantRef);

      return NextResponse.json({ redirect_url: result.redirect_url });
    }

    // ── Sessions / experiences: forward to checkout-booking edge function ─────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const authHeader = req.headers.get("authorization") ?? `Bearer ${anonKey}`;

    const res = await fetch(`${supabaseUrl}/functions/v1/checkout-booking`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        apikey: anonKey!,
      },
      body: JSON.stringify({
        ...body,
        paymentMethod: "pesapal",
        itemId: metadata?.itemId ?? body?.sessionId ?? body?.experienceId ?? body?.itemId,
        name: metadata?.guestName ?? body?.name ?? body?.firstName,
        email: body?.email ?? metadata?.guestEmail,
        phone: body?.phone ?? metadata?.guestPhone,
        userId: body?.userId ?? metadata?.userId,
      }),
    });

    const rawText = await res.text();
    console.error("checkout-booking raw response:", res.status, rawText);
    let data: any;
    try { data = JSON.parse(rawText); } catch { data = { error: rawText }; }
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    const msg = err?.message || err?.toString() || "Payment initiation failed";
    console.error("pesapal submit-order error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
