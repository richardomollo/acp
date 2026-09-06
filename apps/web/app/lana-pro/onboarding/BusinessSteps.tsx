"use client";

import { StepHeading, PrimaryButton, fieldClass } from "./OnboardingShell";
import {
  canAdvance,
  setBusinessField,
  setBusinessType,
  setOperatingModels,
  deriveOnboardingCompletion,
  type OnboardingState,
  type FieldErrors,
} from "@/lib/lana-pro-onboarding/onboarding-machine";
import {
  BUSINESS_TYPE_OPTIONS,
  OPERATING_MODEL_OPTIONS,
  businessTypeLabel,
} from "@/lib/lana-pro-onboarding/business-taxonomy";

type SetState = (updater: (s: OnboardingState) => OnboardingState) => void;

/**
 * LANA PRO — business-branch onboarding steps (Phase 4.7).
 *
 * Mirrors ProfessionalSteps: one component that switches on `state.stepId` and
 * renders the LEFT column for each of the five business steps. `onNext` drives
 * the input steps; `onSubmit` is called from `business_details` (the component
 * that owns the partners/gyms/partner_gyms write), and `business_complete` calls
 * `onGoToDashboard`.
 */
export function BusinessSteps({
  state,
  setState,
  onNext,
  onSubmit,
  onGoToDashboard,
  busy,
  submitError,
  fieldErrors,
}: {
  state: OnboardingState;
  setState: SetState;
  onNext: () => void;
  onSubmit: () => void;
  onGoToDashboard: () => void;
  busy: boolean;
  submitError: string | null;
  fieldErrors: FieldErrors;
}) {
  const b = state.business;
  const gate = canAdvance(state);
  const errs = fieldErrors;

  const toggleModel = (v: string) =>
    setState((s) =>
      setOperatingModels(s, b.operatingModels.includes(v) ? b.operatingModels.filter((x) => x !== v) : [...b.operatingModels, v]),
    );

  // ── §STEP1 — business name + type ─────────────────────────────────────
  if (state.stepId === "business_basics") {
    return (
      <div>
        <StepHeading eyebrow="Your business" title="Tell us about your business" subtitle="This is how you'll appear in Lana Pro, and — once reviewed — to clients." />
        <div className="space-y-6 max-w-lg">
          <TextField
            label="Business name"
            value={b.businessName}
            onChange={(v) => setState((s) => setBusinessField(s, "businessName", v))}
            placeholder="e.g. Iron Haven Gym"
            error={errs.businessName}
          />
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">What kind of business is it?</label>
            <div className="space-y-2.5">
              {BUSINESS_TYPE_OPTIONS.map((o) => (
                <RadioCard
                  key={o.value}
                  selected={b.businessType === o.value}
                  onSelect={() => setState((s) => setBusinessType(s, o.value))}
                  title={o.label}
                  sub={o.sub}
                />
              ))}
            </div>
            {errs.businessType && <p className="text-xs text-red-500 mt-1.5">{errs.businessType}</p>}
          </div>
        </div>
        <ContinueBar disabled={!gate.ok || busy} onClick={onNext} />
      </div>
    );
  }

  // ── §STEP2 — location ────────────────────────────────────────────────
  if (state.stepId === "business_location") {
    return (
      <div>
        <StepHeading eyebrow="Location" title="Where are you based?" subtitle="Where clients find you. You can refine this later in your business profile." />
        <div className="space-y-4 max-w-lg">
          <TextField
            label="Street address (optional)"
            value={b.address}
            onChange={(v) => setState((s) => setBusinessField(s, "address", v))}
            placeholder="Street and building"
          />
          <div className="grid sm:grid-cols-2 gap-4">
            <TextField
              label="City or town"
              value={b.city}
              onChange={(v) => setState((s) => setBusinessField(s, "city", v))}
              placeholder="e.g. Nairobi"
              error={errs.city}
            />
            <TextField
              label="Country"
              value={b.country}
              onChange={(v) => setState((s) => setBusinessField(s, "country", v))}
              placeholder="e.g. Kenya"
              error={errs.country}
            />
          </div>
        </div>
        <ContinueBar disabled={!gate.ok || busy} onClick={onNext} />
      </div>
    );
  }

  // ── §STEP3 — operational models ─────────────────────────────────────
  if (state.stepId === "business_offerings") {
    return (
      <div>
        <StepHeading eyebrow="What you offer" title="How do people train with you?" subtitle="Pick everything that applies — it sets up the right tools in your workspace." />
        <div className="space-y-2.5 max-w-lg">
          {OPERATING_MODEL_OPTIONS.map((o) => (
            <CheckRow
              key={o.value}
              checked={b.operatingModels.includes(o.value)}
              onToggle={() => toggleModel(o.value)}
              title={o.label}
              sub={o.sub}
            />
          ))}
        </div>
        {!gate.ok && b.operatingModels.length === 0 && (
          <p className="text-xs text-gray-400 mt-3">Pick at least one.</p>
        )}
        <ContinueBar disabled={!gate.ok || busy} onClick={onNext} />
      </div>
    );
  }

  // ── §STEP4 — your details (the DB write) ────────────────────────────
  if (state.stepId === "business_details") {
    return (
      <div>
        <StepHeading eyebrow="Your details" title="How can Lana reach you?" subtitle="You'll manage the business — we'll use this to contact you about your account." />
        <div className="space-y-4 max-w-lg">
          <TextField
            label="Your name"
            value={b.contactName}
            onChange={(v) => setState((s) => setBusinessField(s, "contactName", v))}
            placeholder="First and last name"
            error={errs.contactName}
          />
          <TextField
            label="Your role (optional)"
            value={b.contactRole}
            onChange={(v) => setState((s) => setBusinessField(s, "contactRole", v))}
            placeholder="e.g. Owner, Manager"
          />
          <TextField
            label="Contact phone"
            value={b.contactPhone}
            onChange={(v) => setState((s) => setBusinessField(s, "contactPhone", v))}
            placeholder="+254 7XX XXX XXX"
            error={errs.contactPhone}
          />
        </div>
        {submitError && (
          <div className="rounded-xl bg-red-50 text-red-600 text-sm px-4 py-3 mt-5 max-w-lg">{submitError}</div>
        )}
        <div className="mt-9">
          <PrimaryButton type="button" disabled={!gate.ok || busy} onClick={onSubmit}>
            {busy ? "Setting up your workspace…" : "Create my business"}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  // ── §STEP5 — ready ─────────────────────────────────────────────────
  const completion = deriveOnboardingCompletion(state);
  return (
    <div className="max-w-lg">
      <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-6">
        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-[1.15] tracking-tight">
        Your Lana Pro workspace is ready
      </h1>
      <p className="text-gray-500 mt-3 text-[15px] leading-relaxed">
        {b.businessName.trim() || "Your business"} is set up as a{" "}
        {businessTypeLabel(b.businessType).toLowerCase()}. Add your services, schedule and team from
        Home — nothing else is required to start.
      </p>

      <dl className="mt-8 grid grid-cols-1 gap-3 text-sm">
        <StatusRow label="Workspace" value={completion.workspace ? "Ready" : "—"} tone="good" />
        <StatusRow
          label="Marketplace listing"
          value={
            completion.marketplaceVerification === "marketplace_verification_approved"
              ? "Live"
              : "Pending review"
          }
          tone="muted"
        />
      </dl>

      <div className="mt-10">
        <PrimaryButton type="button" onClick={onGoToDashboard}>
          Open Lana Pro
        </PrimaryButton>
      </div>
    </div>
  );
}

/** Desktop right-column context copy per business step. Returns null for the
 *  full-width steps (details write / complete). */
export function businessContextPanel(state: OnboardingState): React.ReactNode {
  switch (state.stepId) {
    case "business_basics":
      return <Panel title="Why we ask">This sets your name and category in Lana Pro. You can change it later in your business profile.</Panel>;
    case "business_location":
      return <Panel title="Not your full listing">Photos, opening hours and pricing come later — this just places you on the map.</Panel>;
    case "business_offerings":
      return (
        <Panel title="Sets up your tools">
          Classes and appointments each get their own booking flow; facility access opens gym passes.
          You add the actual services after setup.
        </Panel>
      );
    default:
      return null;
  }
}

// ── local primitives (mirrors the ones private to ProfessionalSteps) ─────

function ContinueBar({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <div className="mt-9">
      <PrimaryButton type="button" disabled={disabled} onClick={onClick}>
        Continue
      </PrimaryButton>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="text-sm text-gray-600 leading-relaxed">
      <p className="font-semibold text-gray-900 mb-2">{title}</p>
      {children}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={fieldClass} />
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}

function RadioCard({
  selected,
  onSelect,
  title,
  sub,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`w-full text-left rounded-xl border-2 px-5 py-4 transition flex items-start gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040] ${
        selected ? "border-[#050040] bg-gray-50" : "border-gray-200 hover:border-gray-400"
      }`}
    >
      <span
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
          selected ? "border-[#050040]" : "border-gray-300"
        }`}
      >
        {selected && <span className="w-2.5 h-2.5 rounded-full bg-[#050040]" />}
      </span>
      <span>
        <span className="block font-semibold text-gray-900 text-[15px]">{title}</span>
        <span className="block text-sm text-gray-500 mt-0.5">{sub}</span>
      </span>
    </button>
  );
}

function CheckRow({
  checked,
  onToggle,
  title,
  sub,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onToggle}
      className={`w-full text-left rounded-xl border-2 px-5 py-4 transition flex items-start gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040] ${
        checked ? "border-[#050040] bg-gray-50" : "border-gray-200 hover:border-gray-400"
      }`}
    >
      <span
        className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${
          checked ? "bg-[#050040] border-[#050040]" : "border-gray-300"
        }`}
      >
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      <span>
        <span className="block font-semibold text-gray-900 text-[15px]">{title}</span>
        <span className="block text-sm text-gray-500 mt-0.5">{sub}</span>
      </span>
    </button>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "good" | "muted" }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-semibold ${tone === "good" ? "text-green-600" : "text-gray-500"}`}>{value}</dd>
    </div>
  );
}
