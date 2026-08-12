"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function generateCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

type Props = {
  eventId: string;
  isFull: boolean;
  className: string;
};

export default function RsvpEventButton({ eventId, isFull, className }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [status, setStatus] = useState<"none" | "going" | "waitlisted" | "pending_payment">("none");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoggedIn(false); setLoading(false); return; }
      setLoggedIn(true);
      const { data } = await supabase
        .from("community_event_attendees")
        .select("status")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setStatus(data.status as any);
      setLoading(false);
    })();
  }, [eventId]);

  const rsvp = async () => {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const { error } = await supabase.from("community_event_attendees").insert({
      event_id: eventId, user_id: user.id, confirmation_code: generateCode(),
    });
    setBusy(false);
    if (!error) {
      setStatus(isFull ? "waitlisted" : "going");
      router.refresh();
    }
  };

  if (loading) return <button disabled className={className}>Loading…</button>;

  if (!loggedIn) {
    return (
      <Link href={`/login?redirect=/community/event/${eventId}`} className={className}>
        Sign in to RSVP
      </Link>
    );
  }

  if (status === "going") return <button disabled className={className}>✓ You&apos;re going</button>;
  if (status === "waitlisted") return <button disabled className={className}>You&apos;re on the waitlist</button>;
  if (status === "pending_payment") return <button disabled className={className}>Payment pending</button>;

  return (
    <button onClick={rsvp} disabled={busy} className={className}>
      {busy ? "Booking…" : isFull ? "Join Waitlist" : "RSVP — Free"}
    </button>
  );
}
