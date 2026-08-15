import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Deposit = sequence 0 (marked paid immediately, since commit only runs
// after the deposit STK succeeds); remaining instalments split evenly across
// programme_weeks / instalment_frequency_weeks, any remainder absorbed into
// the last instalment. Same formula PtProgrammeEnrollClient computes
// client-side for display — computed here server-side too so the generated
// rows are authoritative, not trusted from the client.
function buildInstalmentSchedule(
  totalPriceKes: number,
  depositPct: number,
  programmeWeeks: number,
  instalmentFrequencyWeeks: number,
  startDate: string
) {
  const deposit = Math.round((totalPriceKes * depositPct) / 100);
  const remaining = totalPriceKes - deposit;
  const numInstalments = Math.max(1, Math.floor(programmeWeeks / instalmentFrequencyWeeks));
  const base = Math.floor(remaining / numInstalments);
  const rows: { sequence: number; amount_kes: number; due_date: string | null; status: string }[] = [
    { sequence: 0, amount_kes: deposit, due_date: null, status: "paid" },
  ];
  const start = new Date(`${startDate}T00:00:00`);
  for (let i = 1; i <= numInstalments; i++) {
    const amount = i === numInstalments ? remaining - base * (numInstalments - 1) : base;
    const due = new Date(start);
    due.setDate(due.getDate() + i * instalmentFrequencyWeeks * 7);
    rows.push({ sequence: i, amount_kes: amount, due_date: due.toISOString().slice(0, 10), status: "pending" });
  }
  return rows;
}

// ── POST: create Stage 2 commitment OR record an instalment payment ───────────
// Note: unlike PT programmes (client-side "link_intro" call after booking),
// the intro-booking -> enrollment link here is created by a DB trigger
// (gym_programme_link_intro_trigger, 20260828000004) that fires on every
// bookings insert — the intro session is booked through the generic session
// BookButton, which for paid sessions redirects to /checkout and never
// returns to a page that could make a client-side linking call.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      action, // "commit" | "pay_instalment"
      // commit (Stage 2) fields
      enrollment_id,
      programme_start_date,
      payment_method,
      payment_status,
      mpesa_reference,
      // pay_instalment fields
      instalment_id,
    } = body;

    if (action === "commit") {
      if (!enrollment_id || !programme_start_date) {
        return NextResponse.json({ error: "Missing enrollment_id or programme_start_date." }, { status: 400 });
      }

      const { data: enrollment, error: enrollErr } = await admin
        .from("gym_programme_enrollments")
        .select("id, programme_id")
        .eq("id", enrollment_id)
        .single();
      if (enrollErr || !enrollment) return NextResponse.json({ error: "Enrollment not found." }, { status: 404 });

      const { data: programme, error: progErr } = await admin
        .from("gym_programmes")
        .select("programme_price_kes, deposit_pct, programme_weeks, instalment_frequency_weeks")
        .eq("id", enrollment.programme_id)
        .single();
      if (progErr || !programme) return NextResponse.json({ error: "Programme not found." }, { status: 404 });

      const { data: updated, error: updateErr } = await admin
        .from("gym_programme_enrollments")
        .update({
          programme_start_date,
          total_price_kes: programme.programme_price_kes,
          deposit_pct: programme.deposit_pct,
          status: payment_status === "paid" ? "programme_active" : "intro_complete",
        })
        .eq("id", enrollment_id)
        .select()
        .single();
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

      if (payment_status === "paid") {
        const schedule = buildInstalmentSchedule(
          Number(programme.programme_price_kes),
          programme.deposit_pct,
          programme.programme_weeks,
          programme.instalment_frequency_weeks,
          programme_start_date
        );
        const rows = schedule.map((r) => ({
          enrollment_id,
          sequence: r.sequence,
          amount_kes: r.amount_kes,
          due_date: r.due_date,
          status: r.status,
          ...(r.sequence === 0 ? { paid_at: new Date().toISOString(), payment_method, mpesa_reference: mpesa_reference ?? null } : {}),
        }));
        const { error: instErr } = await admin
          .from("gym_programme_instalments")
          .upsert(rows, { onConflict: "enrollment_id,sequence" });
        if (instErr) return NextResponse.json({ error: instErr.message }, { status: 500 });
      }

      return NextResponse.json({ enrollment: updated });
    }

    if (action === "pay_instalment") {
      if (!instalment_id) return NextResponse.json({ error: "Missing instalment_id." }, { status: 400 });
      const { data, error } = await admin
        .from("gym_programme_instalments")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          payment_method,
          mpesa_reference: mpesa_reference ?? null,
        })
        .eq("id", instalment_id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ instalment: data });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Server error" }, { status: 500 });
  }
}

// ── PATCH: partner/trainer marks intro complete, or admin status updates ──────
export async function PATCH(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing enrollment id." }, { status: 400 });

    const { data, error } = await admin
      .from("gym_programme_enrollments")
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
