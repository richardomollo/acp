import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      pt_id, offering_id, scheduled_date, scheduled_time,
      location_type, client_address,
      payment_method, amount_kes, payment_status, status,
      // Guest fields
      guest_name, guest_email, guest_phone,
    } = body;

    if (!pt_id || !offering_id || !scheduled_date || !scheduled_time) {
      return NextResponse.json({ error: "Missing required booking fields." }, { status: 400 });
    }

    // Try to resolve logged-in user from session cookie
    let userId: string | null = null;
    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => req.cookies.getAll(),
            setAll: () => {},
          },
        }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) userId = user.id;
    } catch { /* guest booking */ }

    const payload: Record<string, any> = {
      pt_id, offering_id, scheduled_date, scheduled_time,
      location_type, client_address: client_address ?? null,
      payment_method, payment_status, status,
      amount_kes: amount_kes ?? null,
    };

    if (userId) {
      payload.user_id = userId;
    } else {
      payload.guest_name = guest_name ?? null;
      payload.guest_email = guest_email ?? null;
      payload.guest_phone = guest_phone ?? null;
    }

    const { data, error } = await admin
      .from("pt_bookings")
      .insert(payload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ booking: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

    const { error } = await admin.from("pt_bookings").update(updates).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Server error" }, { status: 500 });
  }
}
