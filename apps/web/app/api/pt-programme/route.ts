import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── POST: link intro booking to enrollment OR create Stage 2 commitment ───────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action, // "link_intro" | "commit"
      programme_id,
      pt_id,
      // link_intro fields
      intro_booking_id,
      guest_name, guest_email, guest_phone,
      // commit (Stage 2) fields
      enrollment_id,
      programme_start_date,
      total_price_kes,
      deposit_pct,
      deposit_paid_kes,
      payment_method,
      payment_status,
      mpesa_reference,
    } = body;

    // Resolve authenticated user
    let userId: string | null = null;
    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) userId = user.id;
    } catch { /* guest */ }

    if (action === "link_intro") {
      // Create enrollment record after intro session is booked
      if (!programme_id || !pt_id || !intro_booking_id) {
        return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
      }
      const payload: Record<string, any> = {
        programme_id, pt_id, intro_booking_id, status: "intro_booked",
      };
      if (userId) {
        payload.user_id = userId;
      } else {
        payload.guest_name = guest_name ?? null;
        payload.guest_email = guest_email ?? null;
        payload.guest_phone = guest_phone ?? null;
      }
      const { data, error } = await admin
        .from("pt_programme_enrollments")
        .insert(payload)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ enrollment: data }, { status: 201 });
    }

    if (action === "commit") {
      // Stage 2: record programme commitment + deposit payment
      if (!enrollment_id) {
        return NextResponse.json({ error: "Missing enrollment_id." }, { status: 400 });
      }
      const { data, error } = await admin
        .from("pt_programme_enrollments")
        .update({
          programme_start_date,
          total_price_kes,
          deposit_pct,
          deposit_paid_kes,
          payment_method,
          payment_status,
          mpesa_reference: mpesa_reference ?? null,
          status: payment_status === "paid" ? "programme_active" : "intro_complete",
        })
        .eq("id", enrollment_id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ enrollment: data });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Server error" }, { status: 500 });
  }
}

// ── PATCH: trainer marks intro complete, or admin status updates ──────────────
export async function PATCH(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing enrollment id." }, { status: 400 });

    const { data, error } = await admin
      .from("pt_programme_enrollments")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ enrollment: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Server error" }, { status: 500 });
  }
}
