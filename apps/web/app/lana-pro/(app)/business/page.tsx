import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { resolveWorkspaceIdentity } from "../../_shared/identity";
import { SectionStub } from "../_SectionStub";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  gym: "Gym",
  studio: "Fitness studio",
  yoga: "Yoga studio",
  pilates: "Pilates or yoga studio",
  spa: "Spa or wellness centre",
};

export default async function LanaProBusinessPage() {
  const identity = await resolveWorkspaceIdentity();
  const isBusiness = identity?.capabilities.homeVariant === "business";

  // Professional accounts keep the (still-stub) payouts view.
  if (!isBusiness || !identity) {
    return (
      <SectionStub
        title="Payouts & billing"
        description="Where your earnings are paid out, and your billing details."
        classic={
          identity?.capabilities.marketplaceGated
            ? null
            : { label: "Open classic revenue", href: "/pt-dashboard/revenue" }
        }
      />
    );
  }

  // Resolve the active business context's venue (else the first owned one).
  const ctx = identity.activeContext;
  const gymId = ctx?.kind === "business" && ctx.gymId ? ctx.gymId : identity.gyms[0]?.id ?? null;

  const supabase = await createClient();
  const { data: gym } = gymId
    ? await supabase
        .from("gyms")
        .select("name, type, address, location, area, contact_email, contact_phone, is_active, rejection_reason")
        .eq("id", gymId)
        .maybeSingle()
    : { data: null };

  const name = gym?.name ?? identity.displayName ?? "Your business";
  const typeLabel = gym?.type ? TYPE_LABEL[gym.type] ?? cap(gym.type) : "—";
  const place = [gym?.address, gym?.location, gym?.area]
    .map((s) => (s ?? "").trim())
    .filter((s, i, arr) => s.length > 0 && arr.indexOf(s) === i)
    .join(", ");

  const marketplace = gym?.is_active
    ? { label: "Live on the marketplace", tone: "good" as const }
    : gym?.rejection_reason
      ? { label: `Needs changes — ${gym.rejection_reason}`, tone: "warn" as const }
      : { label: "Pending review", tone: "muted" as const };

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Business</h1>
      <p className="text-gray-500 text-[15px] mt-2 max-w-xl">
        Your business identity in Lana Pro. Your workspace is fully usable while your
        marketplace listing is reviewed.
      </p>

      <dl className="mt-8 rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
        <Row label="Business name" value={name} />
        <Row label="Type" value={typeLabel} />
        <Row label="Location" value={place || "—"} />
        <Row label="Contact email" value={gym?.contact_email || identity.email || "—"} />
        <Row label="Contact phone" value={gym?.contact_phone || "—"} />
        <div className="flex items-center justify-between px-5 py-4">
          <dt className="text-sm text-gray-500">Marketplace listing</dt>
          <dd
            className={`text-sm font-semibold ${
              marketplace.tone === "good"
                ? "text-green-600"
                : marketplace.tone === "warn"
                  ? "text-amber-600"
                  : "text-gray-500"
            }`}
          >
            {marketplace.label}
          </dd>
        </div>
      </dl>

      <div className="mt-6">
        <Link
          href="/partner-dashboard?classic=1"
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold px-4 py-2 hover:border-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
        >
          Advanced business settings
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </Link>
        <p className="text-xs text-gray-400 mt-2">
          Opening hours, photos, pricing and payouts are still edited in the classic venue
          settings for now.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 gap-4">
      <dt className="text-sm text-gray-500 flex-shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 text-right break-words">{value}</dd>
    </div>
  );
}

function cap(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}
