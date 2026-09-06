"use client";

import { useState } from "react";
import { StepHeading, PrimaryButton, fieldClass } from "./OnboardingShell";
import {
  canAdvance,
  setProfessions,
  setClientGoals,
  setServiceModel,
  setWorkingModel,
  setProfessionalField,
  deriveOnboardingCompletion,
  type OnboardingState,
  type FieldErrors,
} from "@/lib/lana-pro-onboarding/onboarding-machine";
import {
  PROFESSION_OPTIONS,
  goalsForProfessions,
  professionLabel,
  goalLabel,
  SERVICE_MODEL_OPTIONS,
  WORKING_MODEL_OPTIONS,
  workingModelLabel,
} from "@/lib/lana-pro-onboarding/professional-taxonomy";
import { addServiceArea, removeServiceArea } from "@/lib/lana-pro-onboarding/service-area";

type SetState = (updater: (s: OnboardingState) => OnboardingState) => void;

export function ProfessionalSteps({
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
  const p = state.professional;
  const gate = canAdvance(state);

  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  // ── §P1 profession ────────────────────────────────────────────────────
  if (state.stepId === "profession") {
    return (
      <StepBody
        eyebrow="Your work"
        title="What do you do?"
        subtitle="Choose everything that describes your work."
        onNext={onNext}
        nextDisabled={!gate.ok}
        rightPanel={
          <Panel title="Why we ask">
            This is how clients find you on Lana, and it shapes the “who do you help?” options next.
          </Panel>
        }
      >
        <ChipGrid
          options={PROFESSION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          selected={p.professions}
          onToggle={(v) => {
            const professions = toggle(p.professions, v);
            const stillValid = goalsForProfessions(professions).map((g) => g.value);
            setState((s) => setProfessions(s, professions, stillValid));
          }}
        />
      </StepBody>
    );
  }

  // ── §P2 client goals ─────────────────────────────────────────────────
  if (state.stepId === "client_goals") {
    const goalOpts = goalsForProfessions(p.professions);
    return (
      <StepBody
        eyebrow="Your clients"
        title="Who do you help?"
        subtitle="This helps Lana connect you with clients who could benefit from your expertise."
        onNext={onNext}
        nextDisabled={!gate.ok}
        rightPanel={
          <Panel title="Tailored to your work">
            {p.professions.length > 0
              ? `Options shown for: ${p.professions.map(professionLabel).join(", ")}.`
              : "Pick a profession first to see tailored goals."}
          </Panel>
        }
      >
        <ChipGrid
          options={goalOpts.map((g) => ({ value: g.value, label: g.label }))}
          selected={p.clientGoals.map((label) => goalOpts.find((g) => g.label === label)?.value ?? label)}
          onToggle={(v) => {
            const label = goalLabel(v);
            const next = p.clientGoals.includes(label)
              ? p.clientGoals.filter((x) => x !== label)
              : [...p.clientGoals, label];
            setState((s) => setClientGoals(s, next));
          }}
        />
      </StepBody>
    );
  }

  // ── §P3 service model ────────────────────────────────────────────────
  if (state.stepId === "service_model") {
    return (
      <StepBody
        eyebrow="Your services"
        title="How do you work with clients?"
        subtitle="Select everything you currently offer."
        onNext={onNext}
        nextDisabled={!gate.ok}
        rightPanel={
          <Panel title="Set up later">
            You’ll create your actual services (times, prices) after onboarding — this just tells us what to prepare.
          </Panel>
        }
      >
        <div className="space-y-3 max-w-lg">
          {SERVICE_MODEL_OPTIONS.map((o) => (
            <CheckRow
              key={o.value}
              checked={p.serviceModel.includes(o.value)}
              onToggle={() => setState((s) => setServiceModel(s, toggle(p.serviceModel, o.value)))}
              title={o.label}
              sub={o.sub}
            />
          ))}
        </div>
      </StepBody>
    );
  }

  // ── §P5 working model ────────────────────────────────────────────────
  if (state.stepId === "working_model") {
    return (
      <StepBody
        eyebrow="Where you work"
        title="Where do you work with clients?"
        subtitle="Select everything that applies."
        onNext={onNext}
        nextDisabled={!gate.ok}
        rightPanel={
          <Panel title="Online-only?">
            If you only work online, we won’t ask you for a physical location.
          </Panel>
        }
      >
        <ChipGrid
          options={WORKING_MODEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          selected={p.workingModel}
          onToggle={(v) => setState((s) => setWorkingModel(s, toggle(p.workingModel, v)))}
        />
      </StepBody>
    );
  }

  // ── §P5 location detail (only reached when a spatial mode is selected) ─
  if (state.stepId === "location_detail") {
    return (
      <StepBody
        eyebrow="Where you work"
        title="A few location details"
        subtitle="We only ask for what your selections need."
        onNext={onNext}
        nextDisabled={!gate.ok}
        rightPanel={
          <Panel title="Not your listing">
            You can refine addresses and areas anytime in your profile — this gets you started.
          </Panel>
        }
      >
        <div className="space-y-6 max-w-lg">
          {p.workingModel.includes("gym_studio") && (
            <TextField
              label="Which gym or studio?"
              value={p.gymName}
              onChange={(v) => setState((s) => setProfessionalField(s, "gymName", v))}
              placeholder="e.g. Iron Haven, Westlands"
              error={fieldErrors.gymName}
            />
          )}
          {p.workingModel.includes("own_location") && (
            <TextField
              label="Where are you based?"
              value={p.ownLocation}
              onChange={(v) => setState((s) => setProfessionalField(s, "ownLocation", v))}
              placeholder="e.g. Studio 5, Kilimani"
              error={fieldErrors.ownLocation}
            />
          )}
          {(p.workingModel.includes("travel") || p.workingModel.includes("own_location")) && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">
                {p.workingModel.includes("travel") ? "Areas you travel to" : "Areas you cover"}
              </label>
              <AreaTagInput
                areas={p.serviceAreas}
                onAdd={(raw) =>
                  setState((s) => ({
                    ...s,
                    professional: {
                      ...s.professional,
                      serviceAreas: addServiceArea(s.professional.serviceAreas, raw),
                    },
                  }))
                }
                onRemove={(a) =>
                  setState((s) => ({
                    ...s,
                    professional: {
                      ...s.professional,
                      serviceAreas: removeServiceArea(s.professional.serviceAreas, a),
                    },
                  }))
                }
              />
              {fieldErrors.serviceAreas && (
                <p className="text-xs text-red-500 mt-1.5">{fieldErrors.serviceAreas}</p>
              )}
            </div>
          )}
        </div>
      </StepBody>
    );
  }

  // ── §P6 experience ──────────────────────────────────────────────────
  if (state.stepId === "experience") {
    return (
      <StepBody
        eyebrow="Your experience"
        title="Tell clients about your experience"
        subtitle="Optional — but it helps build trust with new clients."
        onNext={onNext}
        nextDisabled={false}
        nextLabel="Continue"
        rightPanel={
          <Panel title="Certifications ≠ approval">
            Adding certifications doesn’t change your review status. Our team verifies certificates separately, after you’re set up.
          </Panel>
        }
      >
        <div className="grid sm:grid-cols-2 gap-4 max-w-lg">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Years of experience</label>
            <input
              type="number"
              min={0}
              max={60}
              value={p.yearsExperience}
              onChange={(e) => setState((s) => setProfessionalField(s, "yearsExperience", e.target.value))}
              placeholder="e.g. 8"
              className={fieldClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Certifications / qualifications</label>
            <input
              type="text"
              value={p.certifications}
              onChange={(e) => setState((s) => setProfessionalField(s, "certifications", e.target.value))}
              placeholder="e.g. NASM CPT, REPS Kenya"
              className={fieldClass}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Separate multiple certifications with a comma.</p>
      </StepBody>
    );
  }

  // ── §P10 review ─────────────────────────────────────────────────────
  if (state.stepId === "professional_review") {
    const name = `${state.account.firstName} ${state.account.lastName}`.trim();
    const rows: [string, string, string][] = [
      ["Profession", p.professions.map(professionLabel).join(" · ") || "—", "profession"],
      ["Who you help", p.clientGoals.join(" · ") || "—", "client_goals"],
      ["Services", p.serviceModel.map((v) => SERVICE_MODEL_OPTIONS.find((o) => o.value === v)?.label ?? v).join(" · ") || "—", "service_model"],
      ["Where you work", p.workingModel.map(workingModelLabel).join(" · ") || "—", "working_model"],
      [
        "Location",
        [p.gymName, p.ownLocation, p.serviceAreas.join(", ")].filter(Boolean).join(" · ") || "—",
        "location_detail",
      ],
      ["Experience", p.yearsExperience ? `${p.yearsExperience} years` : "—", "experience"],
      ["Certifications", p.certifications || "—", "experience"],
    ];
    return (
      <div>
        <StepHeading eyebrow="Review" title="Everything look right?" subtitle="Edit any section, then create your profile." />
        <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-200 max-w-2xl">
          <div className="px-5 py-4">
            <p className="text-lg font-bold text-gray-900">{name || "Your name"}</p>
            <p className="text-sm text-gray-500">Professional · pending review</p>
          </div>
          {rows.map(([label, value, step]) => (
            <div key={label} className="px-5 py-3.5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
                <p className="text-sm text-gray-800 mt-0.5 break-words">{value}</p>
              </div>
              <button
                type="button"
                onClick={() => setState((s) => ({ ...s, stepId: step as OnboardingState["stepId"] }))}
                className="text-xs font-semibold text-blue-600 hover:underline flex-shrink-0 mt-0.5"
              >
                Edit
              </button>
            </div>
          ))}
        </div>

        {submitError && (
          <div className="rounded-xl bg-red-50 text-red-600 text-sm px-4 py-3 mt-6 max-w-2xl">{submitError}</div>
        )}

        <div className="mt-8">
          <PrimaryButton onClick={onSubmit} disabled={busy}>
            {busy ? "Creating your profile…" : "Create my Lana profile"}
          </PrimaryButton>
        </div>
        <p className="text-xs text-gray-400 mt-3 max-w-md">
          Your workspace opens right away. Your public marketplace profile is reviewed by our team, usually within 24–48 hours.
        </p>
      </div>
    );
  }

  // ── §7 completion ──────────────────────────────────────────────────
  const completion = deriveOnboardingCompletion(state);
  const first = state.account.firstName.trim().split(" ")[0];
  return (
    <div className="max-w-lg">
      <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-6">
        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-[1.15] tracking-tight">
        You&apos;re ready{first ? `, ${first}` : ""}
      </h1>
      <p className="text-gray-500 mt-3 text-[15px] leading-relaxed">
        Welcome to Lana Pro. Your workspace is ready. Now let&apos;s get you ready for your first client.
      </p>

      <dl className="mt-7 space-y-2.5 text-sm max-w-md">
        <StatusRow label="Workspace" value="Ready to use now" tone="good" />
        <StatusRow
          label="Public marketplace profile"
          value={
            completion.marketplaceVerification === "marketplace_verification_pending"
              ? "Pending review (24–48h)"
              : "Not submitted"
          }
          tone="muted"
        />
        {completion.certification && completion.certification !== "certification_not_required" && (
          <StatusRow label="Certificate verification" value="Pending — separate from your review" tone="muted" />
        )}
      </dl>

      <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.16em] mt-9 mb-3">Next steps</p>
      <ul className="space-y-2 text-sm text-gray-600">
        {["Set your availability", "Create your first service", "Complete your public profile", "Set up payouts"].map(
          (t) => (
            <li key={t} className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0" />
              {t}
            </li>
          ),
        )}
      </ul>

      {/* §11 — profile creation is a valid onboarding terminal. Primary action
          is "Go to Lana Pro"; bringing clients is the highlighted secondary
          that routes into the (re-homed) Phase-3 invitation flow. */}
      <div className="mt-9 flex flex-col sm:flex-row gap-3 sm:items-center">
        <PrimaryButton onClick={onGoToDashboard}>Go to Lana Pro</PrimaryButton>
        <button
          type="button"
          onClick={onNext}
          className="rounded-xl border-2 border-[#050040] text-[#050040] text-sm font-semibold px-5 py-3 hover:bg-[#050040]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
        >
          Bring your clients
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-3 max-w-md">
        Bringing your existing clients keeps you both on the same plan between sessions.
        You can always do it later from your workspace — it never blocks anything.
      </p>
    </div>
  );
}

// ── shared bits ─────────────────────────────────────────────────────────

function StepBody({
  eyebrow,
  title,
  subtitle,
  children,
  onNext,
  nextDisabled,
  nextLabel = "Continue",
  // `rightPanel` is accepted so each step can co-locate its context copy, but
  // it is rendered by the shell's right column on desktop (page.tsx reads it
  // via professionalContextPanel) — here it only shows on small screens.
  rightPanel,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onNext: () => void;
  nextDisabled: boolean;
  nextLabel?: string;
  rightPanel?: React.ReactNode;
}) {
  return (
    <div>
      <StepHeading eyebrow={eyebrow} title={title} subtitle={subtitle} />
      <div className="mb-9">{children}</div>
      <PrimaryButton onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
      </PrimaryButton>
      {rightPanel && <div className="lg:hidden mt-8 rounded-2xl bg-gray-50 border border-gray-100 p-6">{rightPanel}</div>}
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

/** Desktop right-column context copy per professional step (page.tsx passes
 *  the return of this into <OnboardingShell right=...>). Returns null for
 *  full-width steps (review / completion). */
export function professionalContextPanel(state: OnboardingState): React.ReactNode {
  const p = state.professional;
  switch (state.stepId) {
    case "profession":
      return <Panel title="Why we ask">This is how clients find you on Lana, and it shapes the “who do you help?” options next.</Panel>;
    case "client_goals":
      return (
        <Panel title="Tailored to your work">
          {p.professions.length > 0
            ? `Options shown for: ${p.professions.map(professionLabel).join(", ")}.`
            : "Pick a profession first to see tailored goals."}
        </Panel>
      );
    case "service_model":
      return <Panel title="Set up later">You’ll create your actual services (times, prices) after onboarding — this just tells us what to prepare.</Panel>;
    case "working_model":
      return <Panel title="Online-only?">If you only work online, we won’t ask you for a physical location.</Panel>;
    case "location_detail":
      return <Panel title="Not your listing">You can refine addresses and areas anytime in your profile — this gets you started.</Panel>;
    case "experience":
      return <Panel title="Certifications ≠ approval">Adding certifications doesn’t change your review status. Our team verifies certificates separately, after you’re set up.</Panel>;
    default:
      return null;
  }
}

function ChipGrid({
  options,
  selected,
  onToggle,
  small,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  small?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2 max-w-2xl">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.value)}
            className={`rounded-full border-2 font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040] ${
              small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
            } ${on ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
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

/** Country/city-agnostic free-text area capture — replaces the Nairobi-only
 *  NEIGHBOURHOOD_LABELS chip list. Type an area, press Enter (or comma) to add
 *  it as a chip. Values flow to personal_trainers.service_areas (free text). */
function AreaTagInput({
  areas,
  onAdd,
  onRemove,
}: {
  areas: string[];
  onAdd: (raw: string) => void;
  onRemove: (area: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    if (draft.trim().length === 0) return;
    onAdd(draft);
    setDraft("");
  };
  return (
    <div>
      {areas.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5">
          {areas.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#050040] text-white text-xs font-semibold pl-3 pr-2 py-1.5"
            >
              {a}
              <button
                type="button"
                aria-label={`Remove ${a}`}
                onClick={() => onRemove(a)}
                className="rounded-full hover:bg-white/20 w-4 h-4 flex items-center justify-center"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2 max-w-md">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder="Type an area and press Enter"
          className={fieldClass}
        />
        <button
          type="button"
          onClick={commit}
          className="flex-shrink-0 rounded-xl border-2 border-gray-200 px-4 text-sm font-semibold text-gray-600 hover:border-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
        >
          Add
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-1.5">
        Add as many as you need — a town, a neighbourhood, or a whole city.
      </p>
    </div>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "good" | "muted" }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className={tone === "good" ? "font-semibold text-green-700" : "text-gray-400"}>{value}</dd>
    </div>
  );
}
