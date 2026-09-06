// LANA PRO — Phase 4.4: professional session delivery model (PURE).
//
// Lifecycle, the PRIVATE↔CLIENT-VISIBLE boundary, the completion write-plan,
// per-flavour field config. No React, no DOM, no Supabase. Unit-tested.

import type { ProfessionalFlavour } from '../lana-pro-services/service-taxonomy.ts';

export type SessionStatus = 'in_progress' | 'completed';

// ── the record (mirrors professional_session_records) ────────────────────

export interface SessionExercise {
  exerciseId?: string | null;
  exerciseName: string;
  sets?: number | null;
  reps?: number | null;
  loadKg?: number | null;
  durationSeconds?: number | null;
  notes?: string | null;
}

/** Phase 6 (Step 6) — the professional's own lightweight outcome signals.
 *  `clientResponse` = the professional's OBSERVATION of how the session went
 *  (not a diagnosis, sentiment score, pain class or readiness score).
 *  `planIntent`     = the direction the PROFESSIONAL chose for next time (Lana
 *  never decides it). Both optional; PRIVATE (professional-only). */
export type SessionClientResponse = 'great' | 'good' | 'difficult';
export type SessionPlanIntent = 'progress' | 'keep' | 'adjust';

export function isClientResponse(v: unknown): v is SessionClientResponse {
  return v === 'great' || v === 'good' || v === 'difficult';
}
export function isPlanIntent(v: unknown): v is SessionPlanIntent {
  return v === 'progress' || v === 'keep' || v === 'adjust';
}

export interface SessionRecord {
  id: string;
  bookingSource: 'pt_booking';
  bookingId: string;
  professionalKind: 'personal_trainer' | 'gym_trainer';
  personalTrainerId: string | null;
  clientUserId: string | null;
  serviceType: string | null;
  professionalFlavour: ProfessionalFlavour | null;
  sessionStatus: SessionStatus;
  startedAt: string;
  completedAt: string | null;
  focus: string | null;
  clientSummary: string | null;
  /** PRIVATE — never in a consumer projection. */
  privateNotes: string | null;
  /** PRIVATE (Phase 4.4) — never in a consumer projection. */
  sessionExercises: SessionExercise[] | null;
  followUpAt: string | null;
  /** PRIVATE (Phase 6, Step 6) — optional professional outcome signals. */
  clientResponse: SessionClientResponse | null;
  planIntent: SessionPlanIntent | null;
}

// ── the CLIENT-VISIBLE projection (matches get_client_session_feed) ──────

/** The ONLY session fields a consumer may ever see. Deliberately a distinct
 *  type with NO `privateNotes` / `sessionExercises` keys. */
export interface ClientVisibleSession {
  sessionId: string;
  serviceType: string | null;
  professionalFlavour: ProfessionalFlavour | null;
  focus: string | null;
  clientSummary: string | null;
  followUpAt: string | null;
  completedAt: string | null;
  professionalName: string | null;
}

/** Pure projector — the single source of truth for what a client may see.
 *  A test asserts the output can never carry a private key. */
export function toClientVisibleSession(
  r: SessionRecord,
  professionalName: string | null,
): ClientVisibleSession {
  return {
    sessionId: r.id,
    serviceType: r.serviceType,
    professionalFlavour: r.professionalFlavour,
    focus: r.focus,
    clientSummary: r.clientSummary,
    followUpAt: r.followUpAt,
    completedAt: r.completedAt,
    professionalName,
  };
}

/** Runtime guard for the consumer boundary (used in tests + defensively). */
export function isClientSafe(obj: Record<string, unknown>): boolean {
  return !('privateNotes' in obj) && !('private_notes' in obj) && !('sessionExercises' in obj) && !('session_exercises' in obj);
}

// ── per-flavour workspace field config (§11) ────────────────────────────

export interface SessionFieldConfig {
  focusLabel: string;
  focusPlaceholder: string;
  notesLabel: string;
  showExercises: boolean;
  showNutritionEvidence: boolean;
  summaryLabel: string;
}

export function sessionFieldConfig(flavour: ProfessionalFlavour | null): SessionFieldConfig {
  switch (flavour) {
    case 'nutrition':
      return {
        focusLabel: 'Consultation focus',
        focusPlaceholder: 'e.g. Meal consistency',
        notesLabel: 'Consultation notes',
        showExercises: false,
        showNutritionEvidence: true,
        summaryLabel: 'Summary for your client',
      };
    case 'therapy':
    case 'general':
      return {
        focusLabel: "Today's focus",
        focusPlaceholder: 'e.g. Mobility and recovery',
        notesLabel: 'Session notes',
        showExercises: false,
        showNutritionEvidence: false,
        summaryLabel: 'Summary for your client',
      };
    case 'training':
    default:
      return {
        focusLabel: "Today's focus",
        focusPlaceholder: 'e.g. Lower-body strength',
        notesLabel: 'Session notes',
        showExercises: true,
        showNutritionEvidence: false,
        summaryLabel: 'Summary for your client',
      };
  }
}

// ── session_exercises normalisation (jsonb evidence, not a plan) ─────────

export function normaliseSessionExercises(input: unknown): SessionExercise[] {
  if (!Array.isArray(input)) return [];
  const out: SessionExercise[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = typeof r.exerciseName === 'string' ? r.exerciseName.trim() : '';
    if (name.length === 0) continue;
    const numOrNull = (v: unknown): number | null => {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    out.push({
      exerciseId: typeof r.exerciseId === 'string' ? r.exerciseId : null,
      exerciseName: name.slice(0, 120),
      sets: numOrNull(r.sets),
      reps: numOrNull(r.reps),
      loadKg: numOrNull(r.loadKg),
      durationSeconds: numOrNull(r.durationSeconds),
      notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim().slice(0, 500) : null,
    });
    if (out.length >= 40) break;
  }
  return out;
}

// ── completion write-plan (§13) ────────────────────────────────────────

export interface ProposedAction {
  title: string;
  /** default: client-visible (client_tasks always are); the private-vs-visible
   *  boundary for notes lives in the record, not here. */
  dueDate?: string | null;
}

export interface ExistingActionRow {
  id: string;
  title: string;
  sessionRecordId: string | null;
}

export interface CompletionInput {
  sessionRecordId: string;
  bookingId: string;
  /** null for an employed professional (gym_trainer) — they produce no
   *  client_tasks in Phase 4.6, so `pt_id` is never read in that case. */
  personalTrainerId: string | null;
  clientUserId: string | null;
  focus: string;
  privateNotes: string;
  clientSummary: string;
  followUpAt: string | null;
  sessionExercises: SessionExercise[];
  proposedActions: ProposedAction[];
  /** client_tasks already linked to THIS session (for idempotent re-complete). */
  existingSessionActions: ExistingActionRow[];
  nowIso: string;
  /** Phase 6 (Step 6) — optional. Anything not one of the allowed values is
   *  dropped to null (the DB CHECK is the backstop). */
  clientResponse?: string | null;
  planIntent?: string | null;
}

export interface CompletionPlan {
  recordUpdate: {
    session_status: 'completed';
    completed_at: string;
    focus: string | null;
    private_notes: string | null;
    client_summary: string | null;
    follow_up_at: string | null;
    session_exercises: SessionExercise[] | null;
    client_response: SessionClientResponse | null;
    plan_intent: SessionPlanIntent | null;
  };
  /** client_tasks to INSERT (deduped against existingSessionActions by title). */
  taskInserts: {
    pt_id: string;
    client_user_id: string;
    title: string;
    due_date: string | null;
    status: 'pending';
    session_record_id: string;
  }[];
  bookingUpdate: { table: 'pt_bookings'; id: string; set: { status: 'completed' } };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Deterministic. Re-running with the same input produces the same plan and NO
 * duplicate task inserts (existing session actions with a matching title are
 * skipped) — so repeated "Complete session" is idempotent (§13).
 */
export function buildCompletionPlan(input: CompletionInput): CompletionPlan {
  const seen = new Set(input.existingSessionActions.map((a) => norm(a.title)));
  const taskInserts: CompletionPlan['taskInserts'] = [];
  if (input.clientUserId && input.personalTrainerId) {
    for (const a of input.proposedActions) {
      const title = a.title.trim();
      if (title.length === 0) continue;
      const key = norm(title);
      if (seen.has(key)) continue;
      seen.add(key);
      taskInserts.push({
        pt_id: input.personalTrainerId as string,
        client_user_id: input.clientUserId,
        title: title.slice(0, 200),
        due_date: a.dueDate ?? null,
        status: 'pending',
        session_record_id: input.sessionRecordId,
      });
    }
  }

  return {
    recordUpdate: {
      session_status: 'completed',
      completed_at: input.nowIso,
      focus: input.focus.trim() || null,
      private_notes: input.privateNotes.trim() || null,
      client_summary: input.clientSummary.trim() || null,
      follow_up_at: input.followUpAt || null,
      session_exercises: input.sessionExercises.length > 0 ? input.sessionExercises : null,
      client_response: isClientResponse(input.clientResponse) ? input.clientResponse : null,
      plan_intent: isPlanIntent(input.planIntent) ? input.planIntent : null,
    },
    taskInserts,
    bookingUpdate: { table: 'pt_bookings', id: input.bookingId, set: { status: 'completed' } },
  };
}

/** Can a session be started for this booking? (§19 failure states) */
export function canStartSession(booking: {
  status: string;
  scheduledDate?: string;
} | null): { ok: boolean; reason?: string } {
  if (!booking) return { ok: false, reason: 'booking_missing' };
  if (booking.status === 'cancelled' || booking.status === 'no_show') return { ok: false, reason: 'booking_cancelled' };
  if (booking.status === 'completed') return { ok: false, reason: 'booking_completed' };
  return { ok: true };
}

/** Follow-up date presets → an absolute date. */
export function followUpDate(preset: 'none' | '1_week' | '2_weeks' | '1_month', fromIso: string): string | null {
  if (preset === 'none') return null;
  const d = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const days = preset === '1_week' ? 7 : preset === '2_weeks' ? 14 : 30;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
