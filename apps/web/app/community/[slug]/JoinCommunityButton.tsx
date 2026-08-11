"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Props = {
  communityId: string;
  communityType: "open" | "approval_required";
  className: string;
};

export default function JoinCommunityButton({ communityId, communityType, className }: Props) {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [status, setStatus] = useState<"none" | "pending" | "active">("none");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoggedIn(false); setLoading(false); return; }
      setLoggedIn(true);
      const { data } = await supabase
        .from("community_members")
        .select("status")
        .eq("community_id", communityId)
        .eq("user_id", user.id)
        .maybeSingle();
      setStatus(data ? (data.status === "active" ? "active" : "pending") : "none");
      setLoading(false);
    })();
  }, [communityId]);

  const join = async () => {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const isOpen = communityType === "open";
    const { error } = await supabase.from("community_members").insert({
      community_id: communityId, user_id: user.id, status: isOpen ? "active" : "pending",
    });
    setBusy(false);
    if (!error) setStatus(isOpen ? "active" : "pending");
  };

  if (loading) {
    return <button disabled className={className}>Loading…</button>;
  }

  if (!loggedIn) {
    return (
      <Link href={`/login?redirect=/community/${communityId}`} className={className}>
        Sign in to join
      </Link>
    );
  }

  if (status === "active") {
    return <button disabled className={className}>✓ You&apos;re a member</button>;
  }
  if (status === "pending") {
    return <button disabled className={className}>Request sent</button>;
  }

  return (
    <button onClick={join} disabled={busy} className={className}>
      {busy ? "Joining…" : communityType === "open" ? "Join Community" : "Request to Join"}
    </button>
  );
}
