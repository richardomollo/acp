"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import type { ProfessionalFlavour } from "@/lib/lana-pro-services/service-taxonomy";
import {
  sessionFieldConfig,
  normaliseSessionExercises,
  buildCompletionPlan,
  followUpDate,
  type SessionExercise,
  type SessionClientResponse,
  type SessionPlanIntent,
} from "@/lib/lana-pro-delivery/session-model";
import type { LanaClientBrief } from "@/lib/lana-pro-intelligence/client-brief";
import { primaryAction } from "@/lib/lana-pro-intelligence/client-brief";
import { clientResponseLabel, planIntentLabel } from "@/lib/lana-pro-intelligence/labels";

type ExistingRecord = {
  id: string;
  session_status: "in_progress" | "completed";
  focus: string | null;
  private_notes: string | null;
  client_summary: string | null;
  follow_up_at: string | null;
  session_exercises: unknown;
  completed_at: string | null;
  started_at: string;
  client_response: string | null;
  plan_intent: string | null;
};

export function SessionWorkspace(props: {
  bookingId: string;
  ptId: string;
  professionalKind?: "personal_trainer" | "gym_trainer";
  gymTrainerId?: string | null;
  bookingSource?: "pt_booking" | "gym_service_booking";
  bookingTable?: "pt_bookings" | "gym_service_bookings";
  backHref?: string;
  clientId: string | null;
  clientName: string;
  serviceName: string;
  flavour: ProfessionalFlavour;
  scheduledDate: string;
  scheduledTime: string | null;
  durationMinutes: number | null;
  bookingStatus: string;
  startable: boolean;
  startBlockedReason: string | null;
  clientBrief: LanaClientBrief | null;
  existingRecord: ExistingRecord | null;
}) {
  const professionalKind = props.professionalKind ?? "personal_trainer";
  const bookingSource = props.bookingSource ?? "pt_booking";
  const bookingTable = props.bookingTable ?? "pt_bookings";
  const backHref = props.backHref ?? `/lana-pro/bookings/appointment/${props.bookingId}`;
  const isGymTrainer = professionalKind === "gym_trainer";
  const router = useRouter();
  const cfg = sessionFieldConfig(props.flavour);
  const [record, setRecord] = useState<ExistingRecord | null>(props.existingRecord);
  const [phase, setPhase] = useState<"before" | "in_progress" | "completed">(
    props.existingRecord?.session_status === "completed"
      ? "completed"
      : props.existingRecord?.session_status === "in_progress"
        ? "in_progress"
        : "before",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // working state
  const [focus, setFocus] = useState(props.existingRecord?.focus ?? "");
  const [notes, setNotes] = useState(props.existingRecord?.private_notes ?? "");
  const [summary, setSummary] = useState(props.existingRecord?.client_summary ?? "");
  const [followUp, setFollowUp] = useState<"none" | "1_week" | "2_weeks" | "1_month">("none");
  const [exercises, setExercises] = useState<SessionExercise[]>(
    normaliseSessionExercises(props.existingRecord?.session_exercises),
  );
  const [actions, setActions] = useState<string[]>([]);
  const [clientResponse, setClientResponse] = useState<SessionClientResponse | null>(
    (props.existingRecord?.client_response as SessionClientResponse | null) ?? null,
  );
  const [planIntent, setPlanIntent] = useState<SessionPlanIntent | null>(
    (props.existingRecord?.plan_intent as SessionPlanIntent | null) ?? null,
  );
  const [showComplete, setShowComplete] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const timeLabel = props.scheduledTime?.slice(0, 5) ?? "";
  const endLabel = useMemo(() => {
    if (!props.scheduledTime || !props.durationMinutes) return "";
    const [h, m] = props.scheduledTime.slice(0, 5).split(":").map(Number);
    const t = h * 60 + m + props.durationMinutes;
    return `–${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  }, [props.scheduledTime, props.durationMinutes]);

  // ── start ────────────────────────────────────────────────────────────
  const startSession = async () => {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase
      .from("professional_session_records")
      .upsert(
        {
          booking_source: bookingSource,
          booking_id: props.bookingId,
          professional_kind: professionalKind,
          personal_trainer_id: isGymTrainer ? null : props.ptId,
          gym_trainer_id: isGymTrainer ? props.gymTrainerId ?? null : null,
          client_user_id: props.clientId,
          service_type: props.serviceName,
          professional_flavour: props.flavour,
          session_status: "in_progress",
        },
        { onConflict: "booking_source,booking_id" },
      )
      .select("*")
      .single();
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setRecord(data as ExistingRecord);
    setPhase("in_progress");
  };

  // ── autosave (focus + notes) ─────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistWorking = useCallback(async () => {
    if (!record) return;
    setSaveState("saving");
    const { error } = await supabase
      .from("professional_session_records")
      .update({ focus: focus.trim() || null, private_notes: notes.trim() || null, session_exercises: exercises.length ? exercises : null })
      .eq("id", record.id);
    setSaveState(error ? "error" : "saved");
  }, [record, focus, notes, exercises]);

  useEffect(() => {
    if (phase !== "in_progress" || !record) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persistWorking, 800);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [focus, notes, exercises, phase, record, persistWorking]);

  // ── complete ─────────────────────────────────────────────────────────
  const completeSession = async () => {
    if (!record) return;
    setBusy(true);
    setErr(null);
    try {
      const { data: existingSessionTasks } =
        !isGymTrainer && props.clientId
          ? await supabase.from("client_tasks").select("id, title, session_record_id").eq("session_record_id", record.id)
          : { data: [] as { id: string; title: string; session_record_id: string | null }[] };

      const plan = buildCompletionPlan({
        sessionRecordId: record.id,
        bookingId: props.bookingId,
        personalTrainerId: isGymTrainer ? null : props.ptId,
        clientUserId: props.clientId,
        focus,
        privateNotes: notes,
        clientSummary: summary,
        followUpAt: followUpDate(followUp, new Date().toISOString()),
        sessionExercises: exercises,
        proposedActions: isGymTrainer ? [] : actions.filter((a) => a.trim()).map((a) => ({ title: a })),
        existingSessionActions: (existingSessionTasks ?? []).map((t) => ({ id: t.id, title: t.title, sessionRecordId: t.session_record_id })),
        nowIso: new Date().toISOString(),
        clientResponse,
        planIntent,
      });

      const { error: rErr } = await supabase
        .from("professional_session_records")
        .update(plan.recordUpdate)
        .eq("id", record.id);
      if (rErr) throw rErr;

      if (!isGymTrainer && plan.taskInserts.length > 0) {
        const { error: tErr } = await supabase.from("client_tasks").insert(plan.taskInserts);
        if (tErr) throw tErr;
      }

      if (props.bookingStatus !== "completed") {
        await supabase.from(bookingTable).update({ status: "completed" }).eq("id", props.bookingId);
      }

      router.push(backHref);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't complete the session.");
      setBusy(false);
    }
  };

  // ── render ───────────────────────────────────────────────────────────
  return (
    <div className="p-6 md:p-10 max-w-2xl mx-auto">
      <Link
        href={backHref}
        className="text-sm font-semibold text-gray-400 hover:text-gray-700 inline-flex items-center gap-1 mb-5"
      >
        ← Booking
      </Link>

      <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.16em]">
        {phase === "in_progress" ? "Session in progress" : phase === "completed" ? "Session record" : "Prepare for session"}
      </p>
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">{props.clientName}</h1>
      <p className="text-sm text-gray-500 mt-1">
        {props.serviceName}
        {timeLabel ? ` · ${timeLabel}${endLabel}` : ""}
      </p>

      {err && <div className="rounded-xl bg-red-50 border border-red-100 text-red-600 px-4 py-3 text-sm mt-4">{err}</div>}

      {phase === "before" && (
        <BeforeSession
          brief={props.clientBrief}
          clientName={props.clientName}
          startable={props.startable}
          startBlockedReason={props.startBlockedReason}
          busy={busy}
          onStart={startSession}
        />
      )}

      {phase === "in_progress" && (
        <div className="mt-6 space-y-5">
          <SaveBadge state={saveState} />
          <Field label={cfg.focusLabel}>
            <input className={inp} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder={cfg.focusPlaceholder} />
          </Field>
          <Field label={cfg.notesLabel}>
            <textarea className={`${inp} min-h-[120px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          {cfg.showExercises && <ExerciseEditor exercises={exercises} setExercises={setExercises} />}
          {!isGymTrainer && <ActionEditor actions={actions} setActions={setActions} />}

          <button
            type="button"
            onClick={() => setShowComplete(true)}
            className="rounded-xl bg-[#050040] text-white text-sm font-semibold px-5 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
          >
            Complete session
          </button>
        </div>
      )}

      {phase === "completed" && record && (
        <ReadOnlyRecord record={record} exercises={exercises} showExercises={cfg.showExercises} />
      )}

      {showComplete && (
        <CompleteDialog
          cfg={cfg}
          focus={focus}
          setFocus={setFocus}
          notes={notes}
          setNotes={setNotes}
          summary={summary}
          setSummary={setSummary}
          followUp={followUp}
          setFollowUp={setFollowUp}
          actions={actions.filter((a) => a.trim())}
          clientResponse={clientResponse}
          setClientResponse={setClientResponse}
          planIntent={planIntent}
          setPlanIntent={setPlanIntent}
          busy={busy}
          onCancel={() => setShowComplete(false)}
          onConfirm={completeSession}
        />
      )}
    </div>
  );
}

// ── before-session brief (Phase 6 Step 5) ──────────────────────────────

function BeforeSession({
  brief,
  clientName,
  startable,
  startBlockedReason,
  busy,
  onStart,
}: {
  brief: LanaClientBrief | null;
  clientName: string;
  startable: boolean;
  startBlockedReason: string | null;
  busy: boolean;
  onStart: () => void;
}) {
  const first = clientName.split(/\s+/)[0] || "your client";

  const lastSessionLines = brief?.knownFacts.filter((f) => f.kind === "previous_session").map((f) => f.text) ?? [];
  const observations = brief?.observations.map((o) => o.text) ?? [];
  const talking = brief?.talkingPoints ?? [];
  const otherFacts =
    brief?.knownFacts
      .filter((f) => f.kind !== "previous_session" && f.kind !== "goal")
      .map((f) => f.text) ?? [];
  const primary = brief ? primaryAction(brief.suggestedActions) : null;

  return (
    <div className="mt-6">
      {brief && (brief.clientContext.goalLabel || brief.clientContext.relationshipWeeks != null) && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm mb-4">
          {brief.clientContext.goalLabel && (
            <div>
              <dt className="text-gray-400">Goal</dt>
              <dd className="font-medium text-gray-900">{brief.clientContext.goalLabel}</dd>
            </div>
          )}
          {brief.clientContext.relationshipWeeks != null && (
            <div>
              <dt className="text-gray-400">Working together</dt>
              <dd className="font-medium text-gray-900">
                {brief.clientContext.relationshipWeeks} {brief.clientContext.relationshipWeeks === 1 ? "week" : "weeks"}
              </dd>
            </div>
          )}
        </dl>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em]">Lana Intelligence</h2>

        {!brief ? (
          <p className="text-sm text-gray-500">No client is linked to this booking — run and record it as usual.</p>
        ) : brief.state === "no_shared_progress" ? (
          <>
            <p className="text-sm text-gray-500">
              {first} hasn&apos;t shared their Lana progress with you. You can still prepare from your own
              session history, bookings and agreed actions.
            </p>
            {(lastSessionLines.length > 0 || otherFacts.length > 0) && (
              <Block label="What you have" lines={[...lastSessionLines, ...otherFacts]} />
            )}
          </>
        ) : brief.state === "new_client" ? (
          <>
            <p className="text-sm text-gray-500">
              You haven&apos;t worked together yet — use this session to establish a baseline.
            </p>
            {otherFacts.length > 0 && <Block label="What Lana knows" lines={otherFacts} />}
            {talking.length > 0 && <Block label="Worth discussing" lines={talking} />}
          </>
        ) : (
          <>
            {lastSessionLines.length > 0 && <Block label="Last session" lines={lastSessionLines} />}
            {observations.length > 0 && <Block label="Recent pattern" lines={observations} />}
            {talking.length > 0 && <Block label="Worth discussing" lines={talking} />}
            {observations.length === 0 && lastSessionLines.length === 0 && talking.length === 0 && (
              <p className="text-sm text-gray-500">Nothing to flag before this session — run and record it as usual.</p>
            )}
            {brief.dataFreshness.stale && (
              <p className="text-xs text-gray-400">Based on older activity — check what&apos;s current with {first}.</p>
            )}
          </>
        )}
      </div>

      {!startable && (
        <p className="text-sm text-amber-700 mt-4">
          {startBlockedReason === "booking_completed"
            ? "This booking is already completed."
            : startBlockedReason === "booking_cancelled"
              ? "This booking was cancelled — you can't start a session for it."
              : "This booking can't start a session right now."}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          disabled={busy || !startable}
          className="rounded-xl bg-[#050040] text-white text-sm font-semibold px-5 py-3 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
        >
          {busy ? "Starting…" : "Start session"}
        </button>
        {primary && primary.id === "view_client" && (
          <Link href={primary.href} className="text-sm font-semibold text-[#050040] hover:underline">
            View client →
          </Link>
        )}
      </div>
    </div>
  );
}

function Block({ label, lines }: { label: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-1.5">{label}</p>
      <ul className="text-sm text-gray-700 space-y-1">
        {lines.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

// ── editors ────────────────────────────────────────────────────────────

function ExerciseEditor({
  exercises,
  setExercises,
}: {
  exercises: SessionExercise[];
  setExercises: (u: (x: SessionExercise[]) => SessionExercise[]) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-2">Exercises <span className="text-gray-400">(optional)</span></p>
      <ul className="space-y-2">
        {exercises.map((ex, i) => (
          <li key={i} className="grid grid-cols-[1fr_56px_56px_64px_auto] gap-2 items-center">
            <input className={inpSm} placeholder="Exercise" value={ex.exerciseName}
              onChange={(e) => setExercises((xs) => xs.map((x, j) => (j === i ? { ...x, exerciseName: e.target.value } : x)))} />
            <input className={inpSm} placeholder="sets" inputMode="numeric" value={ex.sets ?? ""}
              onChange={(e) => setExercises((xs) => xs.map((x, j) => (j === i ? { ...x, sets: e.target.value ? Number(e.target.value) : null } : x)))} />
            <input className={inpSm} placeholder="reps" inputMode="numeric" value={ex.reps ?? ""}
              onChange={(e) => setExercises((xs) => xs.map((x, j) => (j === i ? { ...x, reps: e.target.value ? Number(e.target.value) : null } : x)))} />
            <input className={inpSm} placeholder="kg" inputMode="decimal" value={ex.loadKg ?? ""}
              onChange={(e) => setExercises((xs) => xs.map((x, j) => (j === i ? { ...x, loadKg: e.target.value ? Number(e.target.value) : null } : x)))} />
            <button type="button" onClick={() => setExercises((xs) => xs.filter((_, j) => j !== i))} className="text-xs text-gray-400 hover:text-red-500">✕</button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setExercises((xs) => [...xs, { exerciseName: "" }])}
        className="mt-2 text-xs font-semibold text-[#050040] hover:underline"
      >
        + Add exercise
      </button>
    </div>
  );
}

function ActionEditor({ actions, setActions }: { actions: string[]; setActions: (u: (x: string[]) => string[]) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-2">Next actions</p>
      <ul className="space-y-2">
        {actions.map((a, i) => (
          <li key={i} className="flex gap-2 items-center">
            <input className={inpSm} placeholder="e.g. Complete Thursday workout" value={a}
              onChange={(e) => setActions((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))} />
            <button type="button" onClick={() => setActions((xs) => xs.filter((_, j) => j !== i))} className="text-xs text-gray-400 hover:text-red-500">✕</button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setActions((xs) => [...xs, ""])} className="mt-2 text-xs font-semibold text-[#050040] hover:underline">
        + Add action
      </button>
    </div>
  );
}

const RESPONSE_OPTS: { value: SessionClientResponse; label: string }[] = [
  { value: "great", label: "Great" },
  { value: "good", label: "Good" },
  { value: "difficult", label: "Difficult" },
];
const INTENT_OPTS: { value: SessionPlanIntent; label: string }[] = [
  { value: "progress", label: "Progress" },
  { value: "keep", label: "Keep similar" },
  { value: "adjust", label: "Adjust" },
];

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : o.value)}
            className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040] ${
              on ? "bg-[#050040] text-white border-[#050040]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function CompleteDialog(props: {
  cfg: ReturnType<typeof sessionFieldConfig>;
  focus: string;
  setFocus: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  summary: string;
  setSummary: (v: string) => void;
  followUp: "none" | "1_week" | "2_weeks" | "1_month";
  setFollowUp: (v: "none" | "1_week" | "2_weeks" | "1_month") => void;
  actions: string[];
  clientResponse: SessionClientResponse | null;
  setClientResponse: (v: SessionClientResponse | null) => void;
  planIntent: SessionPlanIntent | null;
  setPlanIntent: (v: SessionPlanIntent | null) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900">Complete session</h2>
        <div className="mt-4 space-y-5">
          {/* Phase 6 — two structured signals, seconds to set. */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">
              How did it go? <span className="text-gray-400 font-normal">Your read on the session</span>
            </p>
            <Segmented options={RESPONSE_OPTS} value={props.clientResponse} onChange={props.setClientResponse} />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">
              What next? <span className="text-gray-400 font-normal">Your call for the next session</span>
            </p>
            <Segmented options={INTENT_OPTS} value={props.planIntent} onChange={props.setPlanIntent} />
          </div>

          <Field label={props.cfg.focusLabel}>
            <input className={inp} value={props.focus} onChange={(e) => props.setFocus(e.target.value)} />
          </Field>
          <Field label="Private notes"><span className="text-xs text-gray-400">Only you can see these.</span>
            <textarea className={`${inp} min-h-[80px] mt-1`} value={props.notes} onChange={(e) => props.setNotes(e.target.value)} />
          </Field>
          <Field label={props.cfg.summaryLabel}><span className="text-xs text-gray-400">Your client will see this.</span>
            <textarea className={`${inp} min-h-[80px] mt-1`} value={props.summary} onChange={(e) => props.setSummary(e.target.value)} />
          </Field>
          {props.actions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Next actions</p>
              <ul className="text-sm text-gray-700 space-y-1">
                {props.actions.map((a, i) => (
                  <li key={i} className="flex gap-2"><span className="text-green-600">✓</span>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <Field label="Follow-up">
            <select className={inp} value={props.followUp} onChange={(e) => props.setFollowUp(e.target.value as never)}>
              <option value="none">No follow-up scheduled</option>
              <option value="1_week">In 1 week</option>
              <option value="2_weeks">In 2 weeks</option>
              <option value="1_month">In 1 month</option>
            </select>
          </Field>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.busy}
            className="rounded-xl bg-[#050040] text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-40"
          >
            {props.busy ? "Completing…" : "Complete session"}
          </button>
          <button type="button" onClick={props.onCancel} disabled={props.busy} className="text-sm font-semibold text-gray-500">
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyRecord({
  record,
  exercises,
  showExercises,
}: {
  record: ExistingRecord;
  exercises: SessionExercise[];
  showExercises: boolean;
}) {
  const resp = clientResponseLabel(record.client_response);
  const intent = planIntentLabel(record.plan_intent);
  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm text-gray-500">
        Completed {record.completed_at ? record.completed_at.slice(0, 10) : ""}. This record is read-only.
      </p>
      {(resp || intent) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {resp && <RO label="How it went" value={resp} />}
          {intent && <RO label="Plan for next time" value={intent} />}
        </div>
      )}
      <RO label="Focus" value={record.focus} />
      <RO label="Summary for your client" value={record.client_summary} />
      <RO label="Private notes (only you)" value={record.private_notes} />
      {record.follow_up_at && <RO label="Follow-up" value={record.follow_up_at} />}
      {showExercises && exercises.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Exercises</p>
          <ul className="text-sm text-gray-700 space-y-0.5">
            {exercises.map((e, i) => (
              <li key={i}>
                {e.exerciseName}
                {e.sets && e.reps ? ` · ${e.sets} × ${e.reps}` : ""}
                {e.loadKg ? ` · ${e.loadKg} kg` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── small ──────────────────────────────────────────────────────────────

const inp = "w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#050040]/25";
const inpSm = "w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#050040]/25";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
function RO({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
function SaveBadge({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  const map = { idle: "", saving: "Saving…", saved: "Saved", error: "Save failed — check your connection" };
  if (!map[state]) return null;
  return <p className={`text-xs ${state === "error" ? "text-red-500" : "text-gray-400"}`}>{map[state]}</p>;
}
