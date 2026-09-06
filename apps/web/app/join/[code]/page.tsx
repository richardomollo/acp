// LANA PRO — Phase 3: consumer invitation landing page.
//
// Reached by someone a professional invited who does NOT have a Lana account
// yet (so they can't be `authenticated`). Server component. Calls the
// read-only `preview_pt_invite` RPC — which returns ONLY the professional's
// name and the invited first name, never goals/measurements/plans/progress.
//
// The invite code is shown for manual entry: token survival across
// web → App Store → account creation → in-app entry is via the human-readable
// code + the existing `redeem_pt_invite_code` RPC. (No deferred deep link is
// built — see the Phase 3 report's deep-link audit.)

import Link from "next/link";
import type { Metadata } from "next";
import AppStoreBadge from "@/app/components/AppStoreBadge";
import { createClient } from "@/app/lib/supabase/server";
import { isPlausibleInviteCode } from "@/lib/lana-pro-onboarding/client-invite";

const CUSTOMER_APP_STORE_URL =
  "https://apps.apple.com/nl/app/active-urban-pass/id6767222212?l=en-GB";

export const metadata: Metadata = {
  title: "You've been invited to Lana",
  robots: { index: false, follow: false },
};

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = (rawCode || "").trim().toUpperCase();

  let professionalName: string | null = null;
  let invitedName: string | null = null;
  let looksValid = isPlausibleInviteCode(code);

  if (looksValid) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.rpc("preview_pt_invite", { p_code: code });
      const row = Array.isArray(data) ? data[0] : null;
      if (row) {
        professionalName = row.professional_name ?? null;
        invitedName = row.invited_name ?? null;
      } else {
        looksValid = false;
      }
    } catch {
      // Treat an RPC failure as "can't preview" — still show the code + stores.
    }
  }

  const pro = professionalName?.trim() || "Your professional";
  const firstName = invitedName?.trim().split(/\s+/)[0] || null;

  return (
    <main className="min-h-screen bg-white flex flex-col items-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.18em] mb-6">Lana</p>

        {looksValid ? (
          <>
            <h1 className="text-3xl font-bold text-gray-900 leading-tight tracking-tight">
              {firstName ? `${firstName}, ` : ""}
              {professionalName ? `${pro} has invited you to Lana` : "You've been invited to Lana"}
            </h1>
            <p className="text-gray-500 mt-4 text-[15px] leading-relaxed">
              Lana is where you follow your fitness plan, track your progress and stay
              connected with {professionalName ? pro : "your professional"} between sessions.
            </p>

            <div className="mt-8 rounded-2xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your invite code</p>
              <p className="text-2xl font-bold tracking-[0.22em] text-[#050040] mt-1">{code}</p>
              <p className="text-xs text-gray-400 mt-2">
                Install Lana, create your account, then enter this code to connect with {pro}.
                You choose what you share — nothing is shared until you accept.
              </p>
            </div>

            <div className="mt-8 space-y-3">
              <AppStoreBadge href={CUSTOMER_APP_STORE_URL} variant="dark" className="w-full justify-center" />
              <p className="text-xs text-gray-400 text-center">
                Android is coming soon. Already have Lana? Open the app and enter the code above
                under <span className="font-semibold">Connect with a professional</span>.
              </p>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-gray-900 leading-tight tracking-tight">
              This invite link isn&apos;t valid
            </h1>
            <p className="text-gray-500 mt-4 text-[15px] leading-relaxed">
              It may have already been used, been cancelled, or the link is incomplete. Ask
              your professional to send you a fresh invitation.
            </p>
            <div className="mt-8">
              <AppStoreBadge href={CUSTOMER_APP_STORE_URL} variant="dark" className="w-full justify-center" />
            </div>
          </>
        )}

        <p className="text-xs text-gray-400 mt-12">
          <Link href="/" className="hover:underline">
            About Lana
          </Link>
        </p>
      </div>
    </main>
  );
}
