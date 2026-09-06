"use client";

// LANA PRO — Phase 4.1: standalone "bring your clients" flow (post-onboarding).
//
// Same UI as the onboarding step (re-homed into _shared/client-invite-ui), but
// reached from Clients → Invite clients rather than the onboarding machine.
// Staged clients live only in local state; nothing is sent until confirm.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import { PrimaryButton } from "@/app/lana-pro/onboarding/OnboardingShell";
import { AddClients, ReviewInvites } from "@/app/lana-pro/_shared/client-invite-ui";
import type { StagedClient } from "@/lib/lana-pro-onboarding/client-invite";

type Step = "add" | "review" | "done";

export default function LanaProInviteClientsPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("add");
  const [staged, setStaged] = useState<StagedClient[]>([]);
  const [sentCount, setSentCount] = useState(0);
  const [firstName, setFirstName] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("personal_trainers")
        .select("full_name, professional_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const name = (data?.professional_name || data?.full_name || "").trim();
      setFirstName(name.split(/\s+/)[0] ?? "");
    })();
  }, []);

  const backToClients = () => router.push("/lana-pro/clients");

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <Link
        href="/lana-pro/clients"
        className="text-sm font-semibold text-gray-400 hover:text-gray-700 inline-flex items-center gap-1 mb-6"
      >
        ← Clients
      </Link>

      {step === "add" && (
        <AddClients
          staged={staged}
          setStaged={setStaged}
          onContinue={() => setStep("review")}
          onSkip={backToClients}
          skipLabel="Cancel"
        />
      )}

      {step === "review" && (
        <ReviewInvites
          staged={staged}
          professionalFirstName={firstName}
          onBackToEditing={() => setStep("add")}
          onSent={(count) => {
            setSentCount(count);
            setStep("done");
          }}
        />
      )}

      {step === "done" && (
        <div className="max-w-lg">
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-6">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            {sentCount > 0
              ? `${sentCount} ${sentCount === 1 ? "invitation" : "invitations"} on the way`
              : "Nothing sent"}
          </h1>
          <p className="text-gray-500 mt-3 text-[15px] leading-relaxed">
            We&apos;ll let you know as your clients accept. Until they do, nothing is shared. Track everyone under
            Clients.
          </p>
          <div className="mt-8">
            <PrimaryButton onClick={backToClients}>Back to clients</PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
