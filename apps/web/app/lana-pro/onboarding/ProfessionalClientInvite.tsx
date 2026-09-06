"use client";

// LANA PRO — Phase 3 client acquisition, as reached DURING onboarding.
//
// Phase 4.1 re-homed the actual step UI (AddClients / ReviewInvites) into
// app/lana-pro/_shared/client-invite-ui.tsx so the same flow is reachable
// post-onboarding from Clients → Invite clients. This file is now just the
// onboarding wrapper: it maps the onboarding machine's step ids onto that
// shared UI and records the outcome (clientsSkipped / invitedCount) on the
// draft. Invitation completion is NEVER required for onboarding completion —
// `professional_complete` is already a valid terminal.
//
// PRIVACY: staged client details live only in local state, never in the draft.

import { useCallback, useState } from "react";
import { StepHeading, PrimaryButton } from "./OnboardingShell";
import {
  skipClientInvites,
  markClientsInvited,
  type OnboardingState,
} from "@/lib/lana-pro-onboarding/onboarding-machine";
import type { StagedClient } from "@/lib/lana-pro-onboarding/client-invite";
import { AddClients, ReviewInvites } from "@/app/lana-pro/_shared/client-invite-ui";

type SetState = (updater: (s: OnboardingState) => OnboardingState) => void;

export function ProfessionalClientInvite({
  state,
  setState,
  onAdvance,
  onExitToDashboard,
}: {
  state: OnboardingState;
  setState: SetState;
  onAdvance: () => void;
  onExitToDashboard: () => void;
}) {
  const [staged, setStaged] = useState<StagedClient[]>([]);
  const firstName = state.account.firstName;

  const skipAndLeave = useCallback(() => {
    setState((s) => skipClientInvites(s));
    onExitToDashboard();
  }, [setState, onExitToDashboard]);

  if (state.stepId === "bring_clients_intro") {
    return (
      <div className="max-w-xl">
        <StepHeading
          eyebrow="Bring your clients"
          title="Bring your clients with you"
          subtitle="Lana doesn't replace how you work with your clients — it keeps you both on the same page between sessions."
        />
        <ul className="mt-2 mb-8 space-y-3 text-[15px] text-gray-700">
          {[
            "They follow the plan you set — no more lost WhatsApp threads",
            "You see progress and check-ins they choose to share",
            "You stay their professional. Lana just connects the two of you",
          ].map((t) => (
            <li key={t} className="flex gap-3">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#050040] flex-shrink-0" />
              {t}
            </li>
          ))}
        </ul>
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-600 mb-8 max-w-md">
          Every client you add is <strong>invited</strong>, not enrolled. They choose to accept — nothing is shared until
          they do.
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <PrimaryButton onClick={onAdvance}>Add my clients</PrimaryButton>
          <button
            type="button"
            onClick={skipAndLeave}
            className="text-sm font-semibold text-gray-500 hover:text-gray-800 text-left"
          >
            I&apos;ll do this later
          </button>
        </div>
      </div>
    );
  }

  if (state.stepId === "add_clients") {
    return <AddClients staged={staged} setStaged={setStaged} onContinue={onAdvance} onSkip={skipAndLeave} />;
  }

  if (state.stepId === "review_invites") {
    return (
      <ReviewInvites
        staged={staged}
        professionalFirstName={firstName}
        onBackToEditing={() => setState((s) => ({ ...s, stepId: "add_clients" }))}
        onSent={(count) => {
          setState((s) => markClientsInvited(s, count));
          onAdvance();
        }}
      />
    );
  }

  // invite_result
  const n = state.professional.invitedCount;
  return (
    <div className="max-w-lg">
      <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-6">
        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-[1.15] tracking-tight">
        {n > 0 ? `${n} ${n === 1 ? "invitation" : "invitations"} on the way` : "You're all set"}
      </h1>
      <p className="text-gray-500 mt-3 text-[15px] leading-relaxed">
        {n > 0
          ? "We'll let you know as your clients accept. Until they do, nothing is shared. You can track everyone under Clients in your workspace."
          : "You can invite your clients any time from the Clients tab in your workspace."}
      </p>
      <div className="mt-9">
        <PrimaryButton onClick={onExitToDashboard}>Go to Lana Pro</PrimaryButton>
      </div>
    </div>
  );
}
