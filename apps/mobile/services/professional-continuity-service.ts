// LANA — Phase 4.5: professional → consumer continuity service.
//
// The ONLY place the consumer app touches the professional-session boundary.
//   • sessions come from get_client_session_feed() — never a direct
//     professional_session_records query (private_notes / session_exercises
//     are unreachable by contract).
//   • tasks come from client_tasks (the consumer's own rows).
//   • professional names are resolved from the feed rows themselves (the RPC
//     already returns professional_name).
// Fails soft: any error → an empty continuity model, Home unaffected.

import { supabase } from '@/lib/supabase';
import { localISODate } from '@/lib/fulfilment';
import {
  buildContinuityModel,
  EMPTY_CONTINUITY_MODEL,
  type ContinuityModel,
  type ContinuitySessionRow,
  type ContinuityTaskRow,
  taskPeriod,
  type Recurrence,
  type ProfessionalFlavour,
} from '@/lib/professional-continuity';

interface FeedRow {
  session_id: string;
  service_type: string | null;
  professional_flavour: string | null;
  focus: string | null;
  client_summary: string | null;
  follow_up_at: string | null;
  completed_at: string | null;
  professional_name: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  recurrence: string | null;
  weekdays: number[] | null;
  last_completed_date: string | null;
  session_record_id: string | null;
  pt_id: string | null;
}

const asFlavour = (v: string | null): ProfessionalFlavour | null =>
  v === 'training' || v === 'nutrition' || v === 'therapy' || v === 'general' ? v : null;
const asRecurrence = (v: string | null): Recurrence => (v === 'daily' || v === 'weekly' ? v : 'once');

export async function loadContinuityModel(todayLocalDate = localISODate(new Date())): Promise<ContinuityModel> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return EMPTY_CONTINUITY_MODEL;

    const [feedRes, taskRes] = await Promise.all([
      supabase.rpc('get_client_session_feed', { p_limit: 30 }),
      supabase
        .from('client_tasks')
        .select('id, title, status, due_date, recurrence, weekdays, last_completed_date, session_record_id, pt_id')
        .eq('client_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    // Fail soft — a failure of EITHER source degrades to what we have.
    const feed = (feedRes.error ? [] : (feedRes.data as FeedRow[] | null) ?? []);
    const tasks = (taskRes.error ? [] : (taskRes.data as TaskRow[] | null) ?? []);

    const sessions: ContinuitySessionRow[] = feed.map((r) => ({
      sessionId: r.session_id,
      serviceType: r.service_type,
      professionalFlavour: asFlavour(r.professional_flavour),
      focus: r.focus,
      clientSummary: r.client_summary,
      followUpAt: r.follow_up_at,
      completedAt: r.completed_at,
      professionalName: r.professional_name,
    }));

    // Map a task's session → that session's professional name (client-safe,
    // from the feed). Standalone tasks (no session_record_id, or an orphaned
    // one) fall back to null → "your coach" downstream.
    const nameBySession = new Map(sessions.map((s) => [s.sessionId, s.professionalName]));

    const continuityTasks: ContinuityTaskRow[] = tasks
      .filter((t) => !!t.pt_id) // only professional-authored tasks
      .map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status === 'done' ? 'done' : 'pending',
        dueDate: t.due_date,
        recurrence: asRecurrence(t.recurrence),
        weekdays: Array.isArray(t.weekdays) ? t.weekdays : [],
        lastCompletedDate: t.last_completed_date,
        sessionRecordId: t.session_record_id,
        professionalName: t.session_record_id ? nameBySession.get(t.session_record_id) ?? null : null,
      }));

    return buildContinuityModel({ sessions, tasks: continuityTasks, todayLocalDate });
  } catch {
    return EMPTY_CONTINUITY_MODEL;
  }
}

/** Complete / re-open one professional task. Only status / last_completed_date
 *  ever change (the DB trigger enforces this too). */
export async function setTaskDone(task: ContinuityTaskRow, done: boolean, todayLocalDate = localISODate(new Date())): Promise<{ error: string | null }> {
  try {
    if (task.recurrence === 'once') {
      const { error } = await supabase.from('client_tasks').update({ status: done ? 'done' : 'pending' }).eq('id', task.id);
      return { error: error?.message ?? null };
    }
    const period = done ? taskPeriod(task, todayLocalDate) : null;
    const { error } = await supabase.from('client_tasks').update({ last_completed_date: period }).eq('id', task.id);
    return { error: error?.message ?? null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Update failed' };
  }
}

