import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CheckoutClient from "./CheckoutClient";

export const metadata: Metadata = { title: "Checkout | Active CityPass" };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; id?: string; ptId?: string; offeringId?: string; date?: string; time?: string; location?: string; address?: string; programmeId?: string }>;
}) {
  const { type, id, ptId, offeringId, date, time, location, address, programmeId } = await searchParams;

  if (type === "session" && id) {
    const { data: session } = await supabase
      .from("sessions")
      .select("*, gyms!gym_id(id, name, area, deposit_pct)")
      .eq("id", id)
      .single();

    if (!session) notFound();

    const gym = Array.isArray(session.gyms) ? session.gyms[0] : session.gyms;
    const price = Number(session.drop_in_price) || 0;
    const depositPct = gym?.deposit_pct ?? 30;
    const depositAmount = Math.round((price * depositPct) / 100);

    return (
      <CheckoutClient
        type="session"
        itemId={session.id}
        gymId={session.gym_id}
        title={session.name}
        subtitle={`${session.date} · ${session.time?.slice(0, 5) ?? ""}`}
        detail={session.duration_minutes ? `${session.duration_minutes} min` : undefined}
        venueName={gym?.name ?? ""}
        spotsLeft={session.spots_left ?? 0}
        price={price}
        depositPct={depositPct}
        depositAmount={depositAmount}
        remainderAmount={price - depositAmount}
        backUrl={`/sessions/${session.id}`}
        backLabel="Back to session"
      />
    );
  }

  if (type === "experience" && id) {
    const { data: exp } = await supabase
      .from("experiences")
      .select("*, gyms(id, name, area, deposit_pct)")
      .eq("id", id)
      .single();

    if (!exp) notFound();

    const gym = Array.isArray(exp.gyms) ? exp.gyms[0] : exp.gyms;
    const price = Number(exp.price_kes);

    const isNonRefundable = exp.cancellation_cutoff_hours === 0;
    const expDepositPct: number | null = exp.deposit_pct ?? null;

    // Non-refundable + no deposit → charge full price upfront
    const fullPayment = isNonRefundable && !expDepositPct;
    const depositPct = fullPayment ? 100 : (expDepositPct ?? gym?.deposit_pct ?? 30);
    const depositAmount = fullPayment ? price : Math.round((price * depositPct) / 100);

    // Platform-funded discount: the venue is still paid out based on the
    // full price/deposit above; only the amount charged to the customer
    // here is reduced (matches the booking edge functions' behaviour).
    const discountKes = Math.min(Number(exp.discount_kes) || 0, depositAmount);
    const customerDepositAmount = depositAmount - discountKes;

    return (
      <CheckoutClient
        type="experience"
        itemId={exp.id}
        gymId={exp.gym_id}
        title={exp.name}
        subtitle={`${exp.date} · ${exp.start_time?.slice(0, 5) ?? ""}`}
        venueName={gym?.name ?? ""}
        spotsLeft={exp.spots_left ?? 0}
        price={price}
        discountKes={discountKes}
        depositPct={depositPct}
        depositAmount={customerDepositAmount}
        remainderAmount={price - depositAmount}
        fullPayment={fullPayment}
        backUrl={`/experiences/${exp.id}`}
        backLabel="Back to experience"
      />
    );
  }

  if (type === "community_event" && id) {
    const { data: event } = await supabase
      .from("community_events")
      .select("*, communities(id, slug, name)")
      .eq("id", id)
      .single();

    if (!event) notFound();
    if (event.event_type !== "paid") notFound();

    const community = Array.isArray(event.communities) ? event.communities[0] : event.communities;
    const price = Number(event.price_kes);

    let spotsLeft = 9999;
    if (event.capacity != null) {
      const { count: goingCount } = await supabase
        .from("community_event_attendees")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .eq("status", "going");
      spotsLeft = Math.max(0, event.capacity - (goingCount ?? 0));
    }

    return (
      <CheckoutClient
        type="community_event"
        itemId={event.id}
        title={event.title}
        subtitle={`${event.date} · ${event.start_time?.slice(0, 5) ?? ""}`}
        venueName={community?.name ?? ""}
        spotsLeft={spotsLeft}
        price={price}
        depositPct={100}
        depositAmount={price}
        remainderAmount={0}
        fullPayment
        backUrl={`/community/${community?.slug ?? community?.id}/event/${event.slug ?? event.id}`}
        backLabel="Back to event"
      />
    );
  }

  if (type === "pt" && ptId && offeringId) {
    if (!date || !time) notFound();

    const [{ data: pt }, { data: offering }] = await Promise.all([
      supabase
        .from("personal_trainers")
        .select("id, full_name, professional_name")
        .eq("id", ptId)
        .eq("status", "approved")
        .single(),
      supabase
        .from("pt_offerings")
        .select("id, title, type, duration_minutes, price_kes")
        .eq("id", offeringId)
        .eq("pt_id", ptId)
        .eq("is_active", true)
        .single(),
    ]);

    if (!pt || !offering) notFound();

    return (
      <CheckoutClient
        type="pt"
        itemId={offering.id}
        ptId={pt.id}
        ptName={pt.professional_name ?? pt.full_name}
        title={offering.title}
        offeringType={offering.type ?? "1-on-1"}
        durationMinutes={offering.duration_minutes ?? 60}
        priceKes={offering.price_kes ? Number(offering.price_kes) : null}
        scheduledDate={date}
        scheduledTime={time}
        locationPref={location ?? null}
        clientAddress={address ?? null}
        programmeId={programmeId ?? null}
        backUrl={`/trainers/${pt.id}`}
        backLabel={`Back to ${pt.professional_name ?? pt.full_name}`}
      />
    );
  }

  notFound();
}
