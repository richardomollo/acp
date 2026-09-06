"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import {
  OnboardingShell,
  StepHeading,
  PrimaryButton,
  fieldClass,
  fieldErrorClass,
} from "./OnboardingShell";
import {
  initialOnboardingState,
  normalizeState,
  canAdvance,
  advance,
  back,
  prevStep,
  selectBranch,
  setAccountField,
  markAccountCreated,
  markProfessionalSubmitted,
  markBusinessSubmitted,
  seedBusinessContact,
  goToStep,
  progressFraction,
  validateAccount,
  type OnboardingState,
  type OnboardingBranch,
  type FieldErrors,
  type OnboardingStepId,
} from "@/lib/lana-pro-onboarding/onboarding-machine";
import {
  professionsToSpecialisations,
  goalsToStorage,
  serviceModelToSessionTypes,
  workingModelToTrainingLocations,
} from "@/lib/lana-pro-onboarding/professional-taxonomy";
import { businessTypeToGymType } from "@/lib/lana-pro-onboarding/business-taxonomy";
import { LANA_PRO_DEFAULT_COUNTRY } from "@/lib/lana-pro-onboarding/config";
import { ProfessionalSteps, professionalContextPanel } from "./ProfessionalSteps";
import { BusinessSteps, businessContextPanel } from "./BusinessSteps";
import { ProfessionalClientInvite } from "./ProfessionalClientInvite";
import {
  loadOnboardingDraft,
  saveOnboardingDraft,
  clearOnboardingDraft,
} from "@/lib/lana-pro-onboarding/draft-storage";

const PROFESSIONAL_STEP_IDS: readonly OnboardingStepId[] = [
  "profession", "client_goals", "service_model", "working_model",
  "location_detail", "experience", "professional_review", "professional_complete",
];

// Phase 3 — existing-client acquisition. Full-width, no context panel; staged
// client PII lives only in the step component, never in `state` / the draft.
const CLIENT_INVITE_STEP_IDS: readonly OnboardingStepId[] = [
  "bring_clients_intro", "add_clients", "review_invites", "invite_result",
];

// Phase 4.7 — business branch. `business_details` performs the DB write; the
// two full-width steps drop the context panel.
const BUSINESS_STEP_IDS: readonly OnboardingStepId[] = [
  "business_basics", "business_location", "business_offerings", "business_details", "business_complete",
];

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function LanaProOnboardingPage() {
  // ── State ──────────────────────────────────────────────────────────────
  // Draft is loaded once on mount (client-only) to keep SSR deterministic.
  const [state, setState] = useState<OnboardingState>(() => initialOnboardingState());
  const [password, setPassword] = useState(""); // transient — never persisted, never in `state`
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // ── Hydrate: resume the draft, then reconcile with the live auth session ─
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = loadOnboardingDraft() ?? normalizeState({});
      let next = draft;

      // If Supabase already has a session (created earlier, or the user is
      // signed in) treat the account step as done and skip past it.
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id ?? null;

        // §7 — a user who already has a professional profile OR owns a venue
        // must never be walked through onboarding again. Only short-circuit on
        // the early steps, so an in-progress flow (which writes its row at the
        // review step) is never interrupted.
        if (
          userId &&
          (next.stepId === "welcome" || next.stepId === "account" || next.stepId === "branch")
        ) {
          const [ptRes, partnerRes] = await Promise.all([
            supabase.from("personal_trainers").select("id").eq("user_id", userId).maybeSingle(),
            supabase.from("partners").select("id").eq("user_id", userId).maybeSingle(),
          ]);
          let ownsVenue = false;
          if (partnerRes.data?.id) {
            const { count } = await supabase
              .from("partner_gyms")
              .select("id", { count: "exact", head: true })
              .eq("partner_id", partnerRes.data.id);
            ownsVenue = (count ?? 0) > 0;
          }
          if (ptRes.data?.id || ownsVenue) {
            if (!cancelled) window.location.replace("/lana-pro/home");
            return;
          }
        }

        if (data.session && !next.accountCreated) {
          next = markAccountCreated(next, { existingAccountLinked: true });
        }
        if (next.accountCreated && (next.stepId === "welcome" || next.stepId === "account")) {
          next = { ...next, stepId: "branch" };
        }
      } catch {
        /* offline / misconfigured — fall back to the draft as-is */
      }

      if (!cancelled) {
        setState(next);
        setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Autosave (debounced) ───────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveOnboardingDraft(state), 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, hydrated]);

  // ── Derived ────────────────────────────────────────────────────────────
  const gate = useMemo(() => canAdvance(state, { password }), [state, password]);
  const canGoBack = prevStep(state) != null;

  // ── Actions ────────────────────────────────────────────────────────────
  const goBack = useCallback(() => {
    setAuthError(null);
    setFieldErrors({});
    setState((s) => back(s));
  }, []);

  const goNext = useCallback(() => {
    setAuthError(null);
    setState((s) => (canAdvance(s, { password }).ok ? advance(s, { password }) : s));
  }, [password]);

  const setField = useCallback((field: Parameters<typeof setAccountField>[1], value: string) => {
    setFieldErrors((e) => ({ ...e, [field]: undefined }));
    setState((s) => setAccountField(s, field, value));
  }, []);

  const chooseBranch = useCallback((branch: OnboardingBranch) => {
    setState((s) => {
      const next = selectBranch(s, branch);
      if (branch !== "business") return next;
      // Prefill the business contact block from the account, and the country
      // from config (editable — never silently assumed).
      return seedBusinessContact(next, {
        contactName: `${s.account.firstName} ${s.account.lastName}`.trim(),
        contactPhone: s.account.mobile.trim(),
        country: LANA_PRO_DEFAULT_COUNTRY,
      });
    });
  }, []);

  const handleSignOut = useCallback(async () => {
    setBusy(true);
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    clearOnboardingDraft();
    setPassword("");
    setFieldErrors({});
    setAuthError(null);
    setState(initialOnboardingState());
    setBusy(false);
  }, []);

  // Replicates the existing partner-signup auth contract exactly:
  //   signUp({ role: "partner" }) → on "already registered", fall back to
  //   signInWithPassword and link the existing account. No partner/gym/
  //   personal_trainers rows are written here — that is a later phase.
  const handleAccountContinue = useCallback(async () => {
    const errs = validateAccount({ ...state.account, password });
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setBusy(true);
    setAuthError(null);
    try {
      const email = state.account.email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: "partner",
            first_name: state.account.firstName.trim(),
            last_name: state.account.lastName.trim(),
            phone: state.account.mobile.trim(),
          },
        },
      });

      if (!error && data.user?.id) {
        setState((s) => advance(markAccountCreated(s, { existingAccountLinked: false }), { password }));
        return;
      }

      const msg = (error?.message ?? "").toLowerCase();
      if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("email")) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setFieldErrors({ password: "Incorrect password for this email address." });
          return;
        }
        setState((s) => advance(markAccountCreated(s, { existingAccountLinked: true }), { password }));
        return;
      }

      setAuthError(error?.message || "Something went wrong creating your account.");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }, [state.account, password]);

  // §P10 — the ONE professional-branch DB write. Mirrors partner-signup's PT
  // insert exactly (status:'pending', existing-profile guard, the two
  // fire-and-forget notification emails), extended with client_goals and the
  // onboarding-captured session/location fields. No offerings/services are
  // created here — capture intent only.
  const handleProfessionalSubmit = useCallback(async () => {
    if (state.professional.submitted) {
      setState((s) => goToStep(s, "professional_complete"));
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const userId = sessionRes.session?.user?.id;
      if (!userId) throw new Error("Your session expired — please go back and sign in again.");

      const { data: existing } = await supabase
        .from("personal_trainers").select("id").eq("user_id", userId).maybeSingle();
      if (existing) {
        // Already has a profile (e.g. from a prior signup) — don't duplicate;
        // treat onboarding as done and move on.
        setState((s) => goToStep(markProfessionalSubmitted(s), "professional_complete"));
        return;
      }

      const p = state.professional;
      const email = state.account.email.trim().toLowerCase();
      const fullName = `${state.account.firstName} ${state.account.lastName}`.trim();
      const certs = p.certifications.split(",").map((c) => c.trim()).filter(Boolean);

      const { error } = await supabase.from("personal_trainers").insert({
        user_id: userId,
        full_name: fullName,
        email,
        phone: state.account.mobile.trim(),
        specialisations: professionsToSpecialisations(p.professions),
        client_goals: goalsToStorage(p.clientGoals),
        session_types: serviceModelToSessionTypes(p.serviceModel),
        training_locations: workingModelToTrainingLocations(p.workingModel),
        service_areas: p.serviceAreas,
        // Phase-3 hardening: keep the "where I'm based" intent the onboarding
        // collected instead of discarding it. Free-text label only — NOT a
        // verified venue/partner link.
        base_location: [p.gymName.trim(), p.ownLocation.trim()].filter(Boolean).join(" · ") || null,
        years_of_experience: p.yearsExperience ? parseInt(p.yearsExperience, 10) : null,
        certifications: certs,
        status: "pending",
      });
      if (error) throw error;

      // Fire-and-forget: applicant confirmation + internal review alert. Same
      // templates the existing partner-signup flow triggers.
      const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`;
      const fnHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      };
      void Promise.allSettled([
        fetch(fnUrl, {
          method: "POST", headers: fnHeaders,
          body: JSON.stringify({
            type: "partner_application_received",
            data: { email, name: fullName, businessName: fullName, partnerType: "Professional" },
          }),
        }).catch(() => {}),
        fetch(fnUrl, {
          method: "POST", headers: fnHeaders,
          body: JSON.stringify({
            type: "partner_application_alert",
            data: {
              email: "info@activecitypass.com",
              applicantName: fullName, applicantEmail: email,
              applicantPhone: state.account.mobile.trim(),
              businessName: fullName, partnerType: "Professional",
            },
          }),
        }).catch(() => {}),
      ]);

      setState((s) => goToStep(markProfessionalSubmitted(s), "professional_complete"));
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Something went wrong creating your profile.");
    } finally {
      setBusy(false);
    }
  }, [state.professional, state.account]);

  // Phase 4.7 — the ONE business-branch DB write. Mirrors the legacy
  // partner-signup venue branch exactly: a `partners` row (reused if present),
  // a pending `gyms` row, and the `partner_gyms` owner link — plus the same two
  // fire-and-forget application emails. No sessions / services / team are
  // created here (§6). Idempotent: if the user already owns a venue we just
  // advance to the completion screen.
  const handleBusinessSubmit = useCallback(async () => {
    if (state.business.submitted) {
      setState((s) => goToStep(s, "business_complete"));
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const userId = sessionRes.session?.user?.id;
      if (!userId) throw new Error("Your session expired — please go back and sign in again.");

      const b = state.business;
      const email = state.account.email.trim().toLowerCase();
      const phone = b.contactPhone.trim() || state.account.mobile.trim();
      const name = b.businessName.trim();

      // Reuse an existing partner identity; only create one if missing.
      let partnerId: string | null = null;
      const { data: existingPartner } = await supabase
        .from("partners").select("id").eq("user_id", userId).maybeSingle();
      partnerId = existingPartner?.id ?? null;

      if (partnerId) {
        // Already a partner — if they already own a venue, don't create another.
        const { count } = await supabase
          .from("partner_gyms")
          .select("id", { count: "exact", head: true })
          .eq("partner_id", partnerId);
        if ((count ?? 0) > 0) {
          setState((s) => goToStep(markBusinessSubmitted(s), "business_complete"));
          return;
        }
      } else {
        const { data: newPartner, error: partnerErr } = await supabase
          .from("partners")
          .insert({
            user_id: userId,
            email,
            phone,
            business_name: name,
            verified: false,
            onboarding_completed: true,
          })
          .select("id")
          .single();
        if (partnerErr) throw partnerErr;
        partnerId = newPartner.id;
      }

      const city = b.city.trim();
      const { data: newGym, error: gymErr } = await supabase
        .from("gyms")
        .insert({
          name,
          type: businessTypeToGymType(b.businessType),
          location: city,
          area: city,
          address: b.address.trim() || null,
          contact_email: email,
          contact_phone: phone,
          is_active: false,
          partner_id: partnerId,
        })
        .select("id")
        .single();
      if (gymErr) throw gymErr;

      const { error: linkErr } = await supabase
        .from("partner_gyms")
        .insert({ partner_id: partnerId, gym_id: newGym.id, role: "owner" });
      if (linkErr) throw linkErr;

      const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`;
      const fnHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      };
      void Promise.allSettled([
        fetch(fnUrl, {
          method: "POST", headers: fnHeaders,
          body: JSON.stringify({
            type: "partner_application_received",
            data: { email, name: b.contactName.trim() || name, businessName: name, partnerType: "Business" },
          }),
        }).catch(() => {}),
        fetch(fnUrl, {
          method: "POST", headers: fnHeaders,
          body: JSON.stringify({
            type: "partner_application_alert",
            data: {
              email: "info@activecitypass.com",
              applicantName: b.contactName.trim() || name,
              applicantEmail: email, applicantPhone: phone,
              businessName: name, partnerType: "Business",
            },
          }),
        }).catch(() => {}),
      ]);

      setState((s) => goToStep(markBusinessSubmitted(s), "business_complete"));
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Something went wrong creating your business.");
    } finally {
      setBusy(false);
    }
  }, [state.business, state.account]);

  const handleGoToDashboard = useCallback(() => {
    clearOnboardingDraft();
    // Phase 4.1: the pending-usable Lana Pro workspace, not the legacy
    // /pt-dashboard (which hard-blocks status='pending').
    window.location.href = "/lana-pro/home";
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  const shellProps = {
    progress: progressFraction(state),
    onBack: goBack,
    canGoBack,
    onSignOut: state.accountCreated ? handleSignOut : undefined,
  };

  if (!hydrated) {
    return (
      <OnboardingShell {...shellProps} canGoBack={false} left={<div className="h-40" />} />
    );
  }

  if (state.stepId === "welcome") {
    return (
      <OnboardingShell
        {...shellProps}
        left={
          <div>
          <div className="max-w-xl">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.16em] mb-4">for fitness, nutritionists and wellness proffesionals</p>
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 leading-[1.1] tracking-tight">
              Grow your business.
              <br />
              Support your clients better.
            </h1>
            <p className="text-gray-500 mt-5 text-[15px] leading-relaxed">
              Lana understands what your clients are trying to achieve pwered by AI and Science, helps you deliver the right sessions and support and gives you everything you need to run and grow your business. All the tools in one place.
            </p>

            <ul className="mt-8 space-y-3 text-[15px] text-gray-700">
              {[
                ["✓", "Clients and Client insights"],
                ["✓", "Bookings and Schedules"],
                ["✓", "Services (classes, PT, nutrition, access)"],
                ["✦", "Team Management"],
                ["✦", "Secure Paymens and Payouts"],
              ].map(([mark, label]) => (
                <li key={label} className="flex items-center gap-3">
                  <span className="text-[#050040] font-bold w-4 text-center">{mark}</span>
                  {label}
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <PrimaryButton onClick={goNext}>Get started</PrimaryButton>
              <span className="text-sm text-gray-400">
                Already have an account?{" "}
                <Link href="/partner-login" className="text-blue-600 hover:underline">
                  Log in
                </Link>
              </span>
            </div>
          </div>

          {/* Image collage — same staggered style as /walkthrough */}
          <div className="mt-12 lg:mt-14">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 h-[300px] lg:h-[440px]">
              <div className="flex flex-col gap-3 lg:mt-12">
                <div className="flex-1 rounded-2xl overflow-hidden">
                  <img src="/images/ref.jpeg" alt="Fitness" className="w-full h-full object-cover" style={{ objectPosition: "15% center" }} />
                </div>
                <div className="flex-1 rounded-2xl overflow-hidden">
                  <img src="/images/yoga.jpg" alt="Yoga" className="w-full h-full object-cover" style={{ objectPosition: "center top" }} />
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex-1 rounded-2xl overflow-hidden">
                  <img src="/images/gym.jpg" alt="Gym" className="w-full h-full object-cover" style={{ objectPosition: "center" }} />
                </div>
                <div className="flex-1 rounded-2xl overflow-hidden">
                  <img src="/images/pt.jpeg" alt="personal trainer" className="w-full h-full object-cover" style={{ objectPosition: "center" }} />
                </div>
              </div>
              <div className="hidden lg:flex flex-col gap-3 mt-8">
                <div className="flex-1 rounded-2xl overflow-hidden">
                  <img src="/images/padel.webp" alt="Wellness" className="w-full h-full object-cover" style={{ objectPosition: "80% center" }} />
                </div>
                <div className="flex-1 rounded-2xl overflow-hidden">
                  <img src="/images/run.jpg" alt="Training" className="w-full h-full object-cover" style={{ objectPosition: "85% center" }} />
                </div>
              </div>
            </div>
          </div>
          </div>
        }
      />
    );
  }

  if (state.stepId === "account") {
    const errs = fieldErrors;
    return (
      <OnboardingShell
        {...shellProps}
        left={
          <div>
            <StepHeading
              eyebrow="Create your account"
              title="Let's set up your Lana Pro account"
              subtitle="This is your login. Two minutes now, then we get you ready for clients."
            />

            {state.accountCreated ? (
              <div className="rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-sm px-4 py-3 mb-6">
                You&apos;re signed in — continue to choose how you work.
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAccountContinue();
                }}
              >
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field
                    label="First name"
                    value={state.account.firstName}
                    onChange={(v) => setField("firstName", v)}
                    error={errs.firstName}
                    autoComplete="given-name"
                    autoFocus
                  />
                  <Field
                    label="Last name"
                    value={state.account.lastName}
                    onChange={(v) => setField("lastName", v)}
                    error={errs.lastName}
                    autoComplete="family-name"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field
                    label="Mobile number"
                    type="tel"
                    value={state.account.mobile}
                    onChange={(v) => setField("mobile", v)}
                    error={errs.mobile}
                    placeholder="+254 7XX XXX XXX"
                    autoComplete="tel"
                  />
                  <Field
                    label="Email"
                    type="email"
                    value={state.account.email}
                    onChange={(v) => setField("email", v)}
                    error={errs.email}
                    placeholder="you@email.com"
                    autoComplete="email"
                  />
                </div>
                <Field
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(v) => {
                    setFieldErrors((e) => ({ ...e, password: undefined }));
                    setPassword(v);
                  }}
                  error={errs.password}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />

                {authError && (
                  <div className="rounded-xl bg-red-50 text-red-600 text-sm px-4 py-3">{authError}</div>
                )}

                <div className="pt-2">
                  <PrimaryButton type="submit" disabled={busy}>
                    {busy ? "Creating account…" : "Get started"}
                  </PrimaryButton>
                </div>
              </form>
            )}

            {state.accountCreated && (
              <PrimaryButton onClick={goNext}>Continue</PrimaryButton>
            )}
          </div>
        }
        right={
          <div className="text-sm text-gray-600 leading-relaxed">
            <p className="font-semibold text-gray-900 mb-3">What happens next</p>
            <ol className="space-y-2.5">
              <li>1. Create your account (this step).</li>
              <li>2. Tell us how you work — as a professional, or a business.</li>
              <li>3. Set up what clients can book and complete your profile.</li>
            </ol>
            <p className="mt-5 text-gray-400">
              Your workspace is usable as soon as your account exists. A public marketplace listing
              is reviewed separately.
            </p>
          </div>
        }
      />
    );
  }

  if (state.stepId === "branch") {
    return (
      <OnboardingShell
        {...shellProps}
        left={
          <div>
            <StepHeading
              eyebrow="How you work"
              title="Tell us how you work"
              subtitle="Pick the one that fits best. You can add the other later."
            />

            <div className="space-y-3 max-w-lg">
              <BranchOption
                selected={state.branch === "professional"}
                onSelect={() => chooseBranch("professional")}
                title="I'm a professional"
                sub="Trainer, nutritionist, coach or wellness professional."
              />
              <BranchOption
                selected={state.branch === "business"}
                onSelect={() => chooseBranch("business")}
                title="I run a business or venue"
                sub="Gym, studio, spa or wellness facility."
              />
            </div>

            {fieldErrors.branch && (
              <p className="text-sm text-red-500 mt-3">{fieldErrors.branch}</p>
            )}

            <div className="mt-10">
              <PrimaryButton
                onClick={() => {
                  if (!gate.ok) {
                    setFieldErrors(gate.errors);
                    return;
                  }
                  goNext();
                }}
                disabled={busy}
              >
                Continue
              </PrimaryButton>
            </div>
          </div>
        }
        right={
          <div className="text-sm text-gray-600 leading-relaxed">
            <p className="font-semibold text-gray-900 mb-3">Why we ask</p>
            <p>
              A <strong>professional</strong> gets a personal profile, a client list and 1-to-1 tools.
            </p>
            <p className="mt-3">
              A <strong>business</strong> gets a venue profile, classes, appointments and facility
              access — and can invite a team.
            </p>
            <p className="mt-4 text-gray-400">
              Changing this later resets the setup questions for that branch — nothing else.
            </p>
          </div>
        }
      />
    );
  }

  // ── professional activation — existing-client acquisition (Phase 3) ──
  if (CLIENT_INVITE_STEP_IDS.includes(state.stepId)) {
    // Back is allowed only add_clients → (from review) which the component
    // handles itself; the shell back button is suppressed so a professional
    // can't reverse into the submitted review step.
    return (
      <OnboardingShell
        {...shellProps}
        onSignOut={undefined}
        canGoBack={false}
        left={
          <ProfessionalClientInvite
            state={state}
            setState={setState}
            onAdvance={goNext}
            onExitToDashboard={handleGoToDashboard}
          />
        }
      />
    );
  }

  // ── professional branch (Phase 2) ──
  if (PROFESSIONAL_STEP_IDS.includes(state.stepId)) {
    const fullWidth = state.stepId === "professional_review" || state.stepId === "professional_complete";
    return (
      <OnboardingShell
        {...shellProps}
        onSignOut={state.stepId === "professional_complete" ? undefined : shellProps.onSignOut}
        canGoBack={canGoBack && state.stepId !== "professional_complete"}
        right={fullWidth ? undefined : professionalContextPanel(state)}
        left={
          <ProfessionalSteps
            state={state}
            setState={setState}
            onNext={goNext}
            onSubmit={handleProfessionalSubmit}
            onGoToDashboard={handleGoToDashboard}
            busy={busy}
            submitError={submitError}
            fieldErrors={fieldErrors}
          />
        }
      />
    );
  }

  // ── business branch (Phase 4.7) ──
  if (BUSINESS_STEP_IDS.includes(state.stepId)) {
    const fullWidth = state.stepId === "business_details" || state.stepId === "business_complete";
    return (
      <OnboardingShell
        {...shellProps}
        onSignOut={state.stepId === "business_complete" ? undefined : shellProps.onSignOut}
        canGoBack={canGoBack && state.stepId !== "business_complete" && state.stepId !== "business_details"}
        right={fullWidth ? undefined : businessContextPanel(state)}
        left={
          <BusinessSteps
            state={state}
            setState={setState}
            onNext={goNext}
            onSubmit={handleBusinessSubmit}
            onGoToDashboard={handleGoToDashboard}
            busy={busy}
            submitError={submitError}
            fieldErrors={fieldErrors}
          />
        }
      />
    );
  }

  // Any unrecognised step (a corrupt/stale draft that slipped past
  // normalizeState) — send the user to the safe start rather than a blank page.
  return (
    <OnboardingShell
      {...shellProps}
      canGoBack={false}
      left={
        <div className="max-w-lg">
          <StepHeading title="Let's pick up where you left off" subtitle="Choose how you work to continue setting up Lana Pro." />
          <div className="mt-6">
            <PrimaryButton onClick={() => setState((s) => goToStep(s, "branch"))}>Continue</PrimaryButton>
          </div>
        </div>
      }
    />
  );
}

// ── Field ─────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
  autoComplete,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
        className={error ? fieldErrorClass : fieldClass}
      />
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}

function BranchOption({
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
      onClick={onSelect}
      aria-pressed={selected}
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

