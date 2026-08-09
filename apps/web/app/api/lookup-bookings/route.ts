import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const BOOKING_SELECT = `
  id, booking_date, booking_time, confirmation_code, status,
  session_id, deposit_amount, session_price, gym_id,
  sessions!left(id, name, instructor, category, duration_minutes, date, time, gym_id)
`;

const EXP_SELECT = `
  id, status, confirmation_code, deposit_amount, remainder_amount, created_at, experience_id,
  experiences!experience_id(name, date, start_time, gyms!gym_id(id, name, location))
`;
const EXP_STATUSES = ["deposit_paid", "confirmed", "checked_in"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const contact = (body.contact as string | undefined)?.trim();

  if (!contact) {
    return NextResponse.json({ error: "Email or phone required" }, { status: 400 });
  }

  const isEmail = contact.includes("@");
  const allBookings: any[] = [];
  const allExperiences: any[] = [];
  const seen = new Set<string>();
  const expSeen = new Set<string>();

  const merge = (rows: any[] | null) => {
    for (const b of rows ?? []) {
      if (!seen.has(b.id)) { seen.add(b.id); allBookings.push(b); }
    }
  };
  const mergeExp = (rows: any[] | null) => {
    for (const e of rows ?? []) {
      if (!expSeen.has(e.id)) { expSeen.add(e.id); allExperiences.push(e); }
    }
  };

  if (isEmail) {
    const email = contact.toLowerCase();

    // 1. Guest bookings by guest_email
    const { data: guestB } = await admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("guest_email", email)
      .order("booking_date", { ascending: false })
      .limit(30);
    merge(guestB);

    // 1b. Guest experience bookings by email (never have a user_id set)
    const { data: guestExp } = await admin
      .from("experience_bookings")
      .select(EXP_SELECT)
      .eq("email", email)
      .in("status", EXP_STATUSES)
      .order("created_at", { ascending: false })
      .limit(30);
    mergeExp(guestExp);

    // 2. Registered user bookings via public users table
    const { data: publicUser } = await admin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (publicUser?.id) {
      const { data: userB } = await admin
        .from("bookings")
        .select(BOOKING_SELECT)
        .eq("user_id", publicUser.id)
        .order("booking_date", { ascending: false })
        .limit(30);
      merge(userB);

      const { data: userExp } = await admin
        .from("experience_bookings")
        .select(EXP_SELECT)
        .eq("user_id", publicUser.id)
        .in("status", EXP_STATUSES)
        .order("created_at", { ascending: false })
        .limit(30);
      mergeExp(userExp);
    } else {
      // No match in public users table — guest-only results
    }
  } else {
    // Phone lookup — query guest_phone if the column exists
    const { data: phoneB, error } = await admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("guest_phone", contact)
      .order("booking_date", { ascending: false })
      .limit(30);
    if (!error) merge(phoneB);

    const { data: phoneExp, error: phoneExpErr } = await admin
      .from("experience_bookings")
      .select(EXP_SELECT)
      .eq("guest_phone", contact)
      .in("status", EXP_STATUSES)
      .order("created_at", { ascending: false })
      .limit(30);
    if (!phoneExpErr) mergeExp(phoneExp);
  }

  // Sort combined results newest-first
  allBookings.sort(
    (a, b) => new Date(b.booking_date).getTime() - new Date(a.booking_date).getTime(),
  );
  allExperiences.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  // Enrich with gym names
  const gymIds = [
    ...new Set(
      allBookings
        .map((b) => b.gym_id ?? (b.sessions as any)?.gym_id)
        .filter(Boolean),
    ),
  ];
  let gymsMap: Record<string, any> = {};
  if (gymIds.length) {
    const { data: gymsData } = await admin
      .from("gyms")
      .select("id, name, location")
      .in("id", gymIds);
    gymsMap = Object.fromEntries((gymsData ?? []).map((g) => [g.id, g]));
  }

  return NextResponse.json({
    bookings: allBookings.map((b) => ({
      ...b,
      gym: gymsMap[b.gym_id ?? (b.sessions as any)?.gym_id] ?? null,
    })),
    experiences: allExperiences,
  });
}
