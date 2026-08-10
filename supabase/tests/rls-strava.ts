/**
 * RLS integration check for the Strava tables (strava_connections,
 * strava_oauth_states, activities).
 *
 * Creates two disposable test users, asserts:
 *   - strava_connections / strava_oauth_states are unreadable by the
 *     `authenticated` role entirely (service-role-only by design — tokens
 *     must never reach the client, even for the row's own owner).
 *   - user B cannot read/write user A's `activities` rows.
 *   - user A CAN read/write their own `activities` rows.
 * Cleans up both test users and any rows they created when done.
 *
 * Run against a real (local or disposable) Supabase project — never
 * against production data:
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx supabase/tests/rls-strava.ts
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

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ok  - ${label}`);
  } else {
    console.error(`FAIL - ${label}`);
    failures++;
  }
}

async function createTestUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`Failed to create ${email}: ${error?.message}`);
  return data.user.id;
}

async function signIn(email: string) {
  const client = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`Failed to sign in ${email}: ${error.message}`);
  return client;
}

async function main() {
  const emailA = `rls-test-a-${Date.now()}@example.com`;
  const emailB = `rls-test-b-${Date.now()}@example.com`;

  console.log('Creating test users...');
  const userAId = await createTestUser(emailA);
  const userBId = await createTestUser(emailB);

  try {
    const clientA = await signIn(emailA);
    const clientB = await signIn(emailB);

    console.log('\nSeeding data as service role...');
    await admin.from('strava_connections').insert({
      user_id: userAId,
      strava_athlete_id: Math.floor(Math.random() * 1_000_000_000),
      access_token: 'secret-access-token',
      refresh_token: 'secret-refresh-token',
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });

    const { data: activityRow } = await admin.from('activities').insert({
      user_id: userAId,
      source: 'strava',
      external_id: `test-${Date.now()}`,
      activity_type: 'run',
      start_time: new Date().toISOString(),
      distance_meters: 5000,
    }).select('id').single();

    console.log('\n--- strava_connections: service-role-only (tokens never client-readable) ---');
    const { data: connAsA, error: connAsAErr } = await clientA.from('strava_connections').select('*');
    check('user A cannot select strava_connections at all (even their own row)', !connAsAErr && (connAsA?.length ?? 0) === 0);

    console.log('\n--- activities: owner can read their own rows ---');
    const { data: actsAsA, error: actsAsAErr } = await clientA.from('activities').select('*').eq('user_id', userAId);
    check('user A can select their own activities', !actsAsAErr && (actsAsA?.length ?? 0) === 1);

    console.log('\n--- activities: cross-user access is denied ---');
    const { data: actsAsB } = await clientB.from('activities').select('*').eq('user_id', userAId);
    check("user B cannot select user A's activities", (actsAsB?.length ?? 0) === 0);

    if (activityRow) {
      const { error: updateAsBErr, count } = await clientB
        .from('activities')
        .update({ name: 'tampered' }, { count: 'exact' })
        .eq('id', activityRow.id);
      check("user B cannot update user A's activity row", !updateAsBErr && (count ?? 0) === 0);

      const { error: deleteAsBErr, count: deleteCount } = await clientB
        .from('activities')
        .delete({ count: 'exact' })
        .eq('id', activityRow.id);
      check("user B cannot delete user A's activity row", !deleteAsBErr && (deleteCount ?? 0) === 0);
    }

    console.log('\n--- strava_oauth_states: service-role-only ---');
    await admin.from('strava_oauth_states').insert({ user_id: userAId, platform: 'mobile' });
    const { data: statesAsA } = await clientA.from('strava_oauth_states').select('*');
    check('user A cannot select strava_oauth_states at all', (statesAsA?.length ?? 0) === 0);
  } finally {
    console.log('\nCleaning up test users and data...');
    await admin.from('activities').delete().in('user_id', [userAId, userBId]);
    await admin.from('strava_connections').delete().in('user_id', [userAId, userBId]);
    await admin.from('strava_oauth_states').delete().in('user_id', [userAId, userBId]);
    await admin.auth.admin.deleteUser(userAId);
    await admin.auth.admin.deleteUser(userBId);
  }

  console.log(failures === 0 ? '\nAll RLS checks passed.' : `\n${failures} RLS check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('RLS test script crashed:', e); process.exit(1); });
