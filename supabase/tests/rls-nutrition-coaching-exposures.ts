/**
 * RLS integration check for Nutrition N8 (nutrition_coaching_exposures).
 *
 * Two disposable users, asserts:
 *   - a user can create + read their own coaching-exposure rows
 *   - user B cannot select / insert-for-A / update user A's rows
 *   - the same-day (user_id, opportunity_key, shown_local_date) uniqueness
 *     makes a repeat render a no-op, not a second row (§39)
 * Cleans up both users and every row.
 *
 * Run against a local / disposable Supabase project — never production:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx supabase/tests/rls-nutrition-coaching-exposures.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const PASSWORD = 'RlsTest123!';
let failures = 0;
const check = (label: string, cond: boolean) => {
  if (cond) console.log(`  ok  - ${label}`);
  else { console.error(`FAIL - ${label}`); failures++; }
};
async function createTestUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`Failed to create ${email}: ${error?.message}`);
  return data.user.id;
}
async function signIn(email: string) {
  const c = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Failed to sign in ${email}: ${error.message}`);
  return c;
}

function row(userId: string, over: Record<string, unknown> = {}) {
  return {
    user_id: userId,
    opportunity_key: 'nutrition:proteinG:below_range',
    episode_key: 'nutrition:proteinG:below_range:2026-09-02',
    nutrient: 'proteinG',
    comparison: 'below_range',
    shown_local_date: '2026-09-02',
    before_logged_days: 6,
    before_window_days: 7,
    before_coverage_band: 'high',
    before_readiness: 'high',
    reference_type: 'range',
    reference_low: 115,
    reference_high: 165,
    reference_unit: 'g',
    before_average: 108,
    ...over,
  };
}

async function main() {
  const emailA = `rls-n8-a-${Date.now()}@example.com`;
  const emailB = `rls-n8-b-${Date.now()}@example.com`;
  const userAId = await createTestUser(emailA);
  const userBId = await createTestUser(emailB);

  try {
    const clientA = await signIn(emailA);
    const clientB = await signIn(emailB);

    const { error: insErr } = await clientA.from('nutrition_coaching_exposures').insert(row(userAId));
    check('user A can create their own coaching exposure', !insErr);

    const { data: aRead } = await clientA.from('nutrition_coaching_exposures').select('*').eq('user_id', userAId);
    check('user A can read their own exposure', (aRead?.length ?? 0) === 1);

    const { data: bRead } = await clientB.from('nutrition_coaching_exposures').select('*').eq('user_id', userAId);
    check("user B cannot select user A's exposures", (bRead?.length ?? 0) === 0);

    const { error: bInsErr } = await clientB.from('nutrition_coaching_exposures').insert(row(userAId, { episode_key: 'x' }));
    check("user B cannot insert an exposure for user A (WITH CHECK)", !!bInsErr);

    const { count: bUpdCount } = await clientB
      .from('nutrition_coaching_exposures').update({ before_average: 999 }, { count: 'exact' }).eq('user_id', userAId);
    check("user B cannot update user A's exposure", (bUpdCount ?? 0) === 0);

    // same-day re-render idempotency
    const { error: dupErr } = await clientA
      .from('nutrition_coaching_exposures')
      .upsert(row(userAId), { onConflict: 'user_id,opportunity_key,shown_local_date', ignoreDuplicates: true });
    check('a same-day repeat upsert does not error', !dupErr);
    const { count: aCount } = await clientA
      .from('nutrition_coaching_exposures').select('*', { count: 'exact', head: true }).eq('user_id', userAId);
    check('still exactly one row after the repeat (§39)', (aCount ?? 0) === 1);
  } finally {
    await admin.from('nutrition_coaching_exposures').delete().in('user_id', [userAId, userBId]);
    await admin.auth.admin.deleteUser(userAId);
    await admin.auth.admin.deleteUser(userBId);
  }
  console.log(failures === 0 ? '\nAll RLS checks passed.' : `\n${failures} RLS check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error('RLS test script crashed:', e); process.exit(1); });
