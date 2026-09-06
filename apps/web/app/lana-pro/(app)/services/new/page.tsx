"use client";

// LANA PRO — Phase 4.2: Add / edit a service.
//
// Capability-driven, lightweight. Writes to the correct EXISTING table via the
// pure resolvers (service-create.ts / class-scheduling.ts). Programmes are not
// an option and cannot be created here.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import { loadWorkspaceContext, type WorkspaceContext } from "@/app/lana-pro/_shared/workspace-context";
import { PrimaryButton } from "@/app/lana-pro/onboarding/OnboardingShell";
import type { ServiceTypeOption } from "@/lib/lana-pro-services/service-taxonomy";
import {
  resolvePersistPlan,
  validateServiceDetails,
  serviceDetailsValid,
  buildOfferingInsert,
  buildGymServiceInsert,
  buildGymAccessInsert,
  slugify,
  type PersistPlan,
  type ServiceDetailsInput,
  type DeliveryChoice,
} from "@/lib/lana-pro-services/service-create";
import {
  generateOccurrenceDates,
  buildSessionInserts,
  validateClassSchedule,
  type RepeatMode,
} from "@/lib/lana-pro-services/class-scheduling";
import { formatPrice } from "@/lib/lana-pro-services/service-model";

type Step = "type" | "details" | "where" | "when" | "schedule" | "review";

const DELIVERY_LABELS: Record<DeliveryChoice, string> = {
  venue: "At my venue",
  online: "Online",
  client_location: "At the client's location",
  outdoor: "Outdoor",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function AddServiceInner() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("edit"); // e.g. "off:<uuid>" | "gsv:<uuid>" | "acc:<uuid>"

  const [ctx, setCtx] = useState<WorkspaceContext | null | undefined>(undefined);
  const [step, setStep] = useState<Step>("type");
  const [option, setOption] = useState<ServiceTypeOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const [details, setDetails] = useState<ServiceDetailsInput>({
    name: "",
    description: "",
    durationMinutes: 60,
    priceKes: null,
    capacity: null,
    venueId: null,
    delivery: "venue",
    status: "active",
  });
  const [availabilityChoice, setAvailabilityChoice] = useState<"general" | "service">("general");

  // class-schedule sub-form (studio group class)
  const [sched, setSched] = useState({
    time: "18:00",
    startDate: "",
    mode: "none" as RepeatMode,
    endDate: "",
    weekdays: [] as number[],
    instructorId: null as string | null,
  });

  useEffect(() => {
    (async () => {
      const context = await loadWorkspaceContext();
      setCtx(context);
      if (!context) return;
      // default venue
      const firstVenue = context.gyms[0]?.id ?? null;
      setDetails((d) => ({ ...d, venueId: firstVenue }));

      if (editId) {
        await hydrateForEdit(editId, context, setOption, setDetails, setStep, setError);
      }
    })();
  }, [editId]);

  const plan: PersistPlan | null = useMemo(
    () => (option ? resolvePersistPlan(option.id) : null),
    [option],
  );

  const detailErrors = plan ? validateServiceDetails(plan, details) : {};
  const venue = ctx?.gyms.find((g) => g.id === details.venueId) ?? ctx?.gyms[0] ?? null;

  const goNextFromDetails = () => {
    if (!plan) return;
    if (!serviceDetailsValid(plan, details)) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    if (plan.isScheduledClass) return setStep("schedule");
    if (plan.needsDeliveryStep && !ctx?.capability.singleVenueImplicit) return setStep("where");
    return setStep("when");
  };

  const publish = useCallback(async () => {
    if (!ctx || !plan || !option) return;
    setSaving(true);
    setError(null);
    try {
      if (editId) {
        await applyEdit(editId, plan, details);
      } else if (plan.target === "pt_offering") {
        if (!ctx.pt) throw new Error("This account has no professional profile.");
        const row = buildOfferingInsert({ ptId: ctx.pt.id, plan, details, slug: slugify(details.name) });
        const { error: e } = await supabase.from("pt_offerings").insert(row);
        if (e) throw e;
      } else if (plan.target === "gym_service") {
        if (!venue) throw new Error("Choose a venue.");
        const { error: e } = await supabase.from("gym_services").insert(buildGymServiceInsert({ gymId: venue.id, details }));
        if (e) throw e;
      } else if (plan.target === "gym_access_pass") {
        if (!venue) throw new Error("Choose a venue.");
        const { error: e } = await supabase
          .from("gym_access_passes")
          .insert(buildGymAccessInsert({ gymId: venue.id, details }));
        if (e) throw e;
      } else if (plan.target === "session") {
        if (!venue) throw new Error("Choose a venue.");
        const dates = generateOccurrenceDates({
          mode: sched.mode,
          startDate: sched.startDate,
          endDate: sched.endDate,
          weekdays: sched.weekdays,
        });
        const rows = buildSessionInserts(
          {
            gymId: venue.id,
            name: details.name,
            description: details.description,
            durationMinutes: details.durationMinutes,
            capacity: details.capacity ?? 8,
            priceKes: details.priceKes,
            category: (option.id === "group_class" ? "group" : "group"),
            instructorId: sched.instructorId,
            time: sched.time,
          },
          dates,
        );
        const { error: e } = await supabase.from("sessions").insert(rows);
        if (e) throw e;
      }
      router.push("/lana-pro/services");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong saving this service.");
      setSaving(false);
    }
  }, [ctx, plan, option, details, sched, venue, editId, router]);

  if (ctx === undefined) {
    return <div className="p-6 md:p-10 max-w-3xl mx-auto text-sm text-gray-400">Loading…</div>;
  }
  if (!ctx) {
    return <div className="p-6 md:p-10 max-w-3xl mx-auto text-sm text-gray-500">Please sign in again.</div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <Link
        href="/lana-pro/services"
        className="text-sm font-semibold text-gray-400 hover:text-gray-700 inline-flex items-center gap-1 mb-6"
      >
        ← Services
      </Link>

      {error && <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 px-4 py-3 text-sm mb-5">{error}</div>}

      {/* STEP 1 — type */}
      {step === "type" && !editId && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">What do you offer?</h1>
          <p className="text-sm text-gray-500 mt-1 mb-6">Choose a service type.</p>
          {ctx.capability.options.length === 0 ? (
            <p className="text-sm text-gray-500">
              Your account doesn&apos;t support creating services directly yet.
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {ctx.capability.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setOption(o);
                    setDetails((d) => ({
                      ...d,
                      name: "",
                      durationMinutes: resolvePersistPlan(o.id).category === "access" ? 0 : 60,
                    }));
                    setStep("details");
                  }}
                  className="text-left rounded-2xl border-2 border-gray-200 hover:border-[#050040] p-4 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
                >
                  <p className="font-semibold text-gray-900 text-[15px]">{o.label}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{o.hint}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 2 — details */}
      {step === "details" && plan && option && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{editId ? "Edit service" : option.label}</h1>
          <p className="text-sm text-gray-500 mt-1 mb-6">Service details.</p>
          <div className="space-y-4 max-w-lg">
            <Field label="Name" error={showErrors ? detailErrors.name : undefined}>
              <input
                className={inputCls}
                value={details.name}
                onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))}
                placeholder={option.label}
              />
            </Field>
            <Field label="Description (optional)">
              <textarea
                className={`${inputCls} min-h-[72px]`}
                value={details.description}
                onChange={(e) => setDetails((d) => ({ ...d, description: e.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              {plan.category !== "access" ? (
                <Field label="Duration (minutes)" error={showErrors ? detailErrors.duration : undefined}>
                  <input
                    type="number"
                    min={5}
                    step={5}
                    className={inputCls}
                    value={details.durationMinutes || ""}
                    onChange={(e) => setDetails((d) => ({ ...d, durationMinutes: Number(e.target.value) }))}
                  />
                </Field>
              ) : (
                <Field label="Access length (minutes, optional)">
                  <input
                    type="number"
                    min={0}
                    step={15}
                    className={inputCls}
                    value={details.durationMinutes || ""}
                    onChange={(e) => setDetails((d) => ({ ...d, durationMinutes: Number(e.target.value) }))}
                    placeholder="All day"
                  />
                </Field>
              )}
              <Field label="Price (KES)" error={showErrors ? detailErrors.price : undefined}>
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  value={details.priceKes ?? ""}
                  onChange={(e) =>
                    setDetails((d) => ({ ...d, priceKes: e.target.value === "" ? null : Number(e.target.value) }))
                  }
                  placeholder="Free"
                />
              </Field>
            </div>
            {plan.needsCapacity && (
              <Field label="Capacity" error={showErrors ? detailErrors.capacity : undefined}>
                <input
                  type="number"
                  min={1}
                  className={`${inputCls} max-w-[140px]`}
                  value={details.capacity ?? ""}
                  onChange={(e) =>
                    setDetails((d) => ({ ...d, capacity: e.target.value === "" ? null : Number(e.target.value) }))
                  }
                />
              </Field>
            )}
            {plan.teamDelivered && (
              <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                Delivered by your team. You&apos;ll link eligible team members from the service later — no
                automatic assignment.
              </p>
            )}
          </div>
          <div className="mt-8 flex gap-3">
            <PrimaryButton onClick={editId ? () => setStep("review") : goNextFromDetails}>Continue</PrimaryButton>
          </div>
        </div>
      )}

      {/* STEP 3 — where */}
      {step === "where" && plan && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Where?</h1>
          <p className="text-sm text-gray-500 mt-1 mb-6">How is this delivered?</p>
          <div className="space-y-2 max-w-md">
            {(["venue", "online", "client_location", "outdoor"] as DeliveryChoice[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDetails((d) => ({ ...d, delivery: c }))}
                aria-pressed={details.delivery === c}
                className={`w-full text-left rounded-xl border-2 px-4 py-3 text-sm font-semibold transition ${
                  details.delivery === c
                    ? "border-[#050040] bg-gray-50 text-gray-900"
                    : "border-gray-200 text-gray-600 hover:border-gray-400"
                }`}
              >
                {DELIVERY_LABELS[c]}
              </button>
            ))}
            {details.delivery === "venue" && ctx.gyms.length > 1 && (
              <select
                className={inputCls}
                value={details.venueId ?? ""}
                onChange={(e) => setDetails((d) => ({ ...d, venueId: e.target.value || null }))}
              >
                {ctx.gyms.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name ?? "Venue"}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="mt-8">
            <PrimaryButton onClick={() => setStep("when")}>Continue</PrimaryButton>
          </div>
        </div>
      )}

      {/* STEP 4 — when (appointments) */}
      {step === "when" && plan && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">When can clients book this?</h1>
          <p className="text-sm text-gray-500 mt-1 mb-6">You can change this any time from Schedule.</p>
          <div className="space-y-2 max-w-md">
            {(
              [
                ["general", "Use my general availability", "The weekly hours you set once, for everything."],
                ["service", "Set availability for this service", "Different hours just for this one."],
              ] as const
            ).map(([val, title, sub]) => (
              <button
                key={val}
                type="button"
                onClick={() => setAvailabilityChoice(val)}
                aria-pressed={availabilityChoice === val}
                className={`w-full text-left rounded-xl border-2 px-4 py-3 transition ${
                  availabilityChoice === val ? "border-[#050040] bg-gray-50" : "border-gray-200 hover:border-gray-400"
                }`}
              >
                <p className="text-sm font-semibold text-gray-900">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
              </button>
            ))}
          </div>
          <div className="mt-8">
            <PrimaryButton onClick={() => setStep("review")}>Continue</PrimaryButton>
          </div>
        </div>
      )}

      {/* STEP 4b — schedule (classes) */}
      {step === "schedule" && plan?.isScheduledClass && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Schedule the first class</h1>
          <p className="text-sm text-gray-500 mt-1 mb-6">Add more times later from Schedule.</p>
          <div className="space-y-4 max-w-lg">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First date">
                <input
                  type="date"
                  className={inputCls}
                  value={sched.startDate}
                  onChange={(e) => setSched((s) => ({ ...s, startDate: e.target.value }))}
                />
              </Field>
              <Field label="Start time">
                <input
                  type="time"
                  className={inputCls}
                  value={sched.time}
                  onChange={(e) => setSched((s) => ({ ...s, time: e.target.value }))}
                />
              </Field>
            </div>
            {ctx.teamTrainers.length > 0 && (
              <Field label="Instructor (optional)">
                <select
                  className={inputCls}
                  value={sched.instructorId ?? ""}
                  onChange={(e) => setSched((s) => ({ ...s, instructorId: e.target.value || null }))}
                >
                  <option value="">Unassigned</option>
                  {ctx.teamTrainers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name ?? "Trainer"}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Repeat">
              <div className="flex gap-2">
                {(["none", "weekly"] as RepeatMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSched((s) => ({ ...s, mode: m }))}
                    className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold ${
                      sched.mode === m ? "border-[#050040] bg-gray-50" : "border-gray-200 text-gray-600"
                    }`}
                  >
                    {m === "none" ? "Doesn't repeat" : "Weekly"}
                  </button>
                ))}
              </div>
            </Field>
            {sched.mode === "weekly" && (
              <>
                <Field label="On these days">
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setSched((s) => ({
                            ...s,
                            weekdays: s.weekdays.includes(i)
                              ? s.weekdays.filter((x) => x !== i)
                              : [...s.weekdays, i],
                          }))
                        }
                        className={`rounded-lg border-2 px-2.5 py-1 text-xs font-semibold ${
                          sched.weekdays.includes(i) ? "border-[#050040] bg-[#050040] text-white" : "border-gray-200 text-gray-600"
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Repeat until">
                  <input
                    type="date"
                    className={inputCls}
                    value={sched.endDate}
                    onChange={(e) => setSched((s) => ({ ...s, endDate: e.target.value }))}
                  />
                </Field>
              </>
            )}
          </div>
          <div className="mt-8">
            <PrimaryButton
              onClick={() => {
                const errs = validateClassSchedule({
                  name: details.name,
                  time: sched.time,
                  startDate: sched.startDate,
                  capacity: details.capacity,
                  mode: sched.mode,
                  endDate: sched.endDate,
                  weekdays: sched.weekdays,
                });
                if (Object.keys(errs).length > 0) {
                  setError(Object.values(errs)[0] ?? "Check the schedule.");
                  return;
                }
                setError(null);
                setStep("review");
              }}
            >
              Continue
            </PrimaryButton>
          </div>
        </div>
      )}

      {/* STEP 5 — review */}
      {step === "review" && plan && option && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Review</h1>
          <div className="rounded-2xl border border-gray-100 bg-gray-50 divide-y divide-gray-200 max-w-lg mt-5">
            <Row k="Service" v={details.name || option.label} />
            {plan.category !== "access" && <Row k="Duration" v={`${details.durationMinutes} minutes`} />}
            <Row k="Price" v={formatPrice(details.priceKes)} />
            {plan.needsCapacity && <Row k="Capacity" v={String(details.capacity ?? "—")} />}
            {plan.category === "appointment" && plan.needsDeliveryStep && (
              <Row k="Where" v={DELIVERY_LABELS[details.delivery]} />
            )}
            {venue && (plan.target === "session" || plan.target === "gym_service" || plan.target === "gym_access_pass") && (
              <Row k="Venue" v={venue.name ?? "Your venue"} />
            )}
            {plan.isScheduledClass ? (
              <Row
                k="Schedule"
                v={
                  sched.mode === "weekly"
                    ? `Weekly from ${sched.startDate} at ${sched.time}`
                    : `${sched.startDate || "—"} at ${sched.time}`
                }
              />
            ) : (
              plan.category === "appointment" && (
                <Row
                  k="Bookable"
                  v={availabilityChoice === "general" ? "Uses your general availability" : "Has its own availability"}
                />
              )
            )}
            <Row k="Status" v={details.status === "draft" ? "Save as draft (not bookable)" : "Active — bookable"} />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600 mt-4">
            <input
              type="checkbox"
              checked={details.status === "draft"}
              onChange={(e) => setDetails((d) => ({ ...d, status: e.target.checked ? "draft" : "active" }))}
            />
            Save as a draft for now
          </label>

          <div className="mt-8 flex gap-3">
            <PrimaryButton onClick={publish} disabled={saving}>
              {saving ? "Saving…" : details.status === "draft" ? "Save draft" : "Publish service"}
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ── edit hydration ────────────────────────────────────────────────────────

async function hydrateForEdit(
  editId: string,
  ctx: WorkspaceContext,
  setOption: (o: ServiceTypeOption) => void,
  setDetails: React.Dispatch<React.SetStateAction<ServiceDetailsInput>>,
  setStep: (s: Step) => void,
  setError: (e: string | null) => void,
) {
  const [prefix, rawId] = editId.split(":");
  try {
    if (prefix === "off") {
      const { data } = await supabase
        .from("pt_offerings")
        .select("title, description, duration_minutes, price_kes, max_participants, type, gym_id, is_active, is_draft")
        .eq("id", rawId)
        .maybeSingle();
      if (!data) throw new Error("Service not found.");
      const isClass = data.type === "group";
      setOption({
        id: isClass ? "pro_group_class" : "personal_training",
        label: data.title,
        category: isClass ? "class" : "appointment",
        hint: "",
      });
      setDetails((d) => ({
        ...d,
        name: data.title ?? "",
        description: data.description ?? "",
        durationMinutes: data.duration_minutes ?? 60,
        priceKes: data.price_kes != null ? Number(data.price_kes) : null,
        capacity: isClass ? (data.max_participants ?? null) : null,
        venueId: data.gym_id ?? ctx.gyms[0]?.id ?? null,
        delivery:
          data.type === "online"
            ? "online"
            : data.type === "home-visit"
              ? "client_location"
              : data.type === "outdoor"
                ? "outdoor"
                : "venue",
        status: data.is_draft ? "draft" : data.is_active ? "active" : "inactive",
      }));
      setStep("details");
    } else if (prefix === "gsv" || prefix === "acc") {
      const table = prefix === "gsv" ? "gym_services" : "gym_access_passes";
      const { data } = await supabase
        .from(table)
        .select("name, description, duration_minutes, price_kes, capacity, status")
        .eq("id", rawId)
        .maybeSingle();
      if (!data) throw new Error("Service not found.");
      setOption({
        id: prefix === "gsv" ? "team_personal_training" : "gym_access",
        label: data.name,
        category: prefix === "gsv" ? "appointment" : "access",
        hint: "",
      });
      setDetails((d) => ({
        ...d,
        name: data.name ?? "",
        description: data.description ?? "",
        durationMinutes: data.duration_minutes ?? (prefix === "gsv" ? 60 : 0),
        priceKes: data.price_kes != null ? Number(data.price_kes) : null,
        capacity: data.capacity ?? null,
        status: (["draft", "active", "inactive"].includes(data.status) ? data.status : "active") as ServiceDetailsInput["status"],
      }));
      setStep("details");
    } else {
      throw new Error("This service can't be edited here — use Schedule.");
    }
  } catch (e) {
    setError(e instanceof Error ? e.message : "Couldn't load this service.");
  }
}

async function applyEdit(editId: string, plan: PersistPlan, details: ServiceDetailsInput) {
  const [prefix, rawId] = editId.split(":");
  if (prefix === "off") {
    const { error } = await supabase
      .from("pt_offerings")
      .update({
        title: details.name.trim(),
        description: details.description.trim() || null,
        duration_minutes: details.durationMinutes,
        price_kes: details.priceKes,
        max_participants: plan.needsCapacity ? (details.capacity ?? 1) : 1,
        is_draft: details.status === "draft",
        is_active: details.status !== "inactive",
      })
      .eq("id", rawId);
    if (error) throw error;
  } else if (prefix === "gsv" || prefix === "acc") {
    const table = prefix === "gsv" ? "gym_services" : "gym_access_passes";
    const { error } = await supabase
      .from(table)
      .update({
        name: details.name.trim(),
        description: details.description.trim() || null,
        duration_minutes: details.durationMinutes || (prefix === "gsv" ? 60 : null),
        price_kes: details.priceKes,
        capacity: details.capacity,
        status: details.status,
      })
      .eq("id", rawId);
    if (error) throw error;
  }
}

// ── small ui ──────────────────────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#050040]/25 focus:border-[#050040] bg-white";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{k}</span>
      <span className="text-sm text-gray-800 text-right">{v}</span>
    </div>
  );
}

export default function AddServicePage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-gray-400">Loading…</div>}>
      <AddServiceInner />
    </Suspense>
  );
}
