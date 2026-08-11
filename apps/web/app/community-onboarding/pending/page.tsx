"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type ReviewStatus = "pending" | "approved" | "rejected" | null;

const STATUS_CONFIG: Record<string, { color: string; bg: string; title: string; message: string }> = {
  pending: {
    color: "text-amber-600", bg: "bg-amber-50",
    title: "Community Under Review",
    message: "Our team is reviewing your community. This usually takes 24–48 hours. We'll notify you once it's approved.",
  },
  approved: {
    color: "text-green-600", bg: "bg-green-50",
    title: "You're Approved!",
    message: "Your community is now live. Go to your dashboard to create events and invite members.",
  },
  rejected: {
    color: "text-red-600", bg: "bg-red-50",
    title: "Not Approved",
    message: "Your community wasn't approved at this time. See the reason below and feel free to update and reapply.",
  },
};

export default function CommunityOnboardingPendingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<ReviewStatus>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState("");
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/partner-login"); return; }
    const { data: membership } = await supabase
      .from("community_members")
      .select("communities(name, review_status, rejection_reason)")
      .eq("user_id", user.id).in("role", ["owner", "admin"]).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const community = membership?.communities as any;
    if (community) {
      setStatus(community.review_status);
      setRejectionReason(community.rejection_reason ?? null);
      setCommunityName(community.name ?? "");
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  if (loading) {
    return <div className="max-w-md mx-auto px-6 py-24 text-center text-sm text-gray-400">Loading…</div>;
  }

  const cfg = status ? STATUS_CONFIG[status] : STATUS_CONFIG.pending;

  return (
    <div className="max-w-md mx-auto px-6 py-16 text-center">
      <div className={`rounded-2xl p-8 mb-6 ${cfg.bg}`}>
        {communityName && <p className="text-sm font-semibold text-gray-500 mb-2">{communityName}</p>}
        <h1 className={`text-xl font-bold mb-2 ${cfg.color}`}>{cfg.title}</h1>
        <p className="text-sm text-gray-600 leading-relaxed">{cfg.message}</p>
        {status === "rejected" && rejectionReason && (
          <div className="mt-4 bg-white rounded-xl p-4 text-left">
            <p className="text-xs font-bold text-red-600 mb-1">Reason:</p>
            <p className="text-sm text-gray-600">{rejectionReason}</p>
          </div>
        )}
      </div>

      {status === "approved" && (
        <a href="/community-dashboard" className="inline-block px-6 py-3 rounded-xl bg-black text-white text-sm font-semibold hover:bg-gray-800 transition mb-4">
          Go to Dashboard →
        </a>
      )}

      <button
        onClick={checkStatus}
        className="block w-full py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
      >
        Refresh status
      </button>
    </div>
  );
}
