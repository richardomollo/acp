import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().split("T")[0];
  const debug = req.nextUrl.searchParams.get("debug") === "1";

  // Debug: return ALL bookings unfiltered so we can see what's there
  if (debug) {
    const { data: all } = await admin
      .from("bookings")
      .select("id, booking_date, status, user_id, guest_email, sessions!left(name)")
      .or(`user_id.eq.${user.id},guest_email.eq.${user.email ?? ""}`)
      .order("booking_date", { ascending: false })
      .limit(30);
    return NextResponse.json({ today, userId: user.id, email: user.email, all });
  }

  const BOOKING_SELECT = `
    *,
    sessions!left(id, name, instructor, category, description, duration_minutes, gym_id, date, time)
  `;
  const UPCOMING_STATUSES = ["confirmed", "deposit_paid", "pending_payment"];
  const PAST_CANCELLED_STATUSES = [
    "cancelled", "cancelled_by_customer", "cancelled_by_partner", "rescheduled", "no_show",
  ];

  // Run two queries per tab to avoid OR syntax issues with email/uuid
  const [byUserId, byEmail, pastByUserId, pastByEmail] = await Promise.all([
    admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("user_id", user.id)
      .in("status", UPCOMING_STATUSES)
      .gte("booking_date", today)
      .order("booking_date", { ascending: true }),
    user.email
      ? admin
          .from("bookings")
          .select(BOOKING_SELECT)
          .eq("guest_email", user.email)
          .is("user_id", null)
          .in("status", UPCOMING_STATUSES)
          .gte("booking_date", today)
          .order("booking_date", { ascending: true })
      : Promise.resolve({ data: [] }),
    admin
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("user_id", user.id)
      .or(`booking_date.lt.${today},status.in.(${PAST_CANCELLED_STATUSES.join(",")})`)
      .order("booking_date", { ascending: false })
      .limit(20),
    user.email
      ? admin
          .from("bookings")
          .select(BOOKING_SELECT)
          .eq("guest_email", user.email)
          .is("user_id", null)
          .or(`booking_date.lt.${today},status.in.(${PAST_CANCELLED_STATUSES.join(",")})`)
          .order("booking_date", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
  ]);

  const seen = new Set<string>();
  const dedup = (rows: any[]) => rows.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });

  const upcoming = dedup([...(byUserId.data ?? []), ...(byEmail.data ?? [])]);
  const past = dedup([...(pastByUserId.data ?? []), ...(pastByEmail.data ?? [])])
    .sort((a, b) => b.booking_date.localeCompare(a.booking_date))
    .slice(0, 20);

  const allBookings = [...upcoming, ...past];
  const gymIds = [...new Set(allBookings.map((b: any) => b.sessions?.gym_id).filter(Boolean))];
  const { data: gyms } = gymIds.length
    ? await admin.from("gyms").select("id, name, location").in("id", gymIds)
    : { data: [] };

  // Experience bookings — query by user_id and by email (for bookings created without auth)
  const EXP_SELECT = "id, status, confirmation_code, deposit_amount, remainder_amount, created_at, experience_id, experiences!experience_id(name, date, start_time, gyms!gym_id(id, name, location))";
  const EXP_STATUSES = ["deposit_paid", "confirmed", "checked_in"];
  const [expByUserId, expByEmail] = await Promise.all([
    admin.from("experience_bookings").select(EXP_SELECT).eq("user_id", user.id).in("status", EXP_STATUSES).order("created_at", { ascending: false }).limit(20),
    user.email
      ? admin.from("experience_bookings").select(EXP_SELECT).eq("email", user.email).is("user_id", null).in("status", EXP_STATUSES).order("created_at", { ascending: false }).limit(20)
      : Promise.resolve({ data: [] }),
  ]);

  const expSeen = new Set<string>();
  const experiences = [...(expByUserId.data ?? []), ...(expByEmail.data ?? [])]
    .filter(r => { if (expSeen.has(r.id)) return false; expSeen.add(r.id); return true; });

  return NextResponse.json({ upcoming, past, gyms: gyms ?? [], experiences });
}
