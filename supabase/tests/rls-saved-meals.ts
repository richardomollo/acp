/**
 * RLS integration check for Nutrition N6 (saved_meals / saved_meal_items) and
 * the additive food_log_entries occurrence columns.
 *
 * Creates two disposable test users, asserts:
 *   - a user can CRUD their own saved meals + items
 *   - user B cannot select / update / insert-into / delete user A's saved
 *     meals or their child items (child ownership flows through the parent)
 *   - user B cannot read user A's food_log_entries (owner-only, unchanged)
 *   - deleting a saved meal SET NULLs saved_meal_id on the owner's historical
 *     food_log_entries but LEAVES THE ROWS (evidence survives — N6 §28)
 * Cleans up both users and every row they created.
 *
 * Run against a local / disposable Supabase project — never production:
 *
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx supabase/tests/rls-saved-meals.ts
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
  if (condition) console.log(`  ok  - ${label}`);
  else { console.error(`FAIL - ${label}`); failures++; }
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
  const emailA = `rls-sm-a-${Date.now()}@example.com`;
  const emailB = `rls-sm-b-${Date.now()}@example.com`;

  const userAId = await createTestUser(emailA);
  const userBId = await createTestUser(emailB);
  let mealAId: string | null = null;

  try {
    const clientA = await signIn(emailA);
    const clientB = await signIn(emailB);

    const { data: food } = await admin.from('foods').select('id').eq('is_active', true).limit(1).single();
    if (!food) throw new Error('No seeded foods in this DB — run `supabase db reset --local` first.');

    console.log('\n--- saved_meals: owner CRUD ---');
    const { data: created, error: createErr } = await clientA
      .from('saved_meals').insert({ user_id: userAId, name: 'My Breakfast' }).select('id').single();
    check('user A can create their own saved meal', !createErr && !!created);
    mealAId = created?.id ?? null;

    const { error: itemErr } = await clientA.from('saved_meal_items').insert({
      saved_meal_id: mealAId, food_id: food.id, quantity: 250, unit: 'g', sort_order: 0,
    });
    check('user A can add an item to their own saved meal', !itemErr);

    const { data: ownRead } = await clientA
      .from('saved_meals').select('id, saved_meal_items(id)').eq('id', mealAId).maybeSingle<{ id: string; saved_meal_items: { id: string }[] }>();
    check('user A can read their own saved meal + items', !!ownRead && ownRead.saved_meal_items.length === 1);

    console.log('\n--- saved_meals: cross-user denial ---');
    const { data: bReadMeal } = await clientB.from('saved_meals').select('*').eq('id', mealAId);
    check("user B cannot select user A's saved meal", (bReadMeal?.length ?? 0) === 0);

    const { data: bReadItems } = await clientB.from('saved_meal_items').select('*').eq('saved_meal_id', mealAId);
    check("user B cannot select user A's saved meal items", (bReadItems?.length ?? 0) === 0);

    const { count: bUpdCount } = await clientB
      .from('saved_meals').update({ name: 'tampered' }, { count: 'exact' }).eq('id', mealAId);
    check("user B cannot update user A's saved meal", (bUpdCount ?? 0) === 0);

    const { error: bInsErr } = await clientB.from('saved_meal_items').insert({
      saved_meal_id: mealAId, food_id: food.id, quantity: 1, unit: 'g', sort_order: 9,
    });
    check("user B cannot insert an item into user A's saved meal (WITH CHECK)", !!bInsErr);

    const { count: bDelCount } = await clientB
      .from('saved_meals').delete({ count: 'exact' }).eq('id', mealAId);
    check("user B cannot delete user A's saved meal", (bDelCount ?? 0) === 0);

    const { count: bDelItemCount } = await clientB
      .from('saved_meal_items').delete({ count: 'exact' }).eq('saved_meal_id', mealAId);
    check("user B cannot delete user A's saved meal items", (bDelItemCount ?? 0) === 0);

    console.log('\n--- food_log_entries: occurrence columns + evidence survives meal deletion (§28) ---');
    const { data: logRow, error: logErr } = await clientA.from('food_log_entries').insert({
      user_id: userAId, local_date: '2026-09-02', display_name: 'Greek yoghurt',
      quantity: 250, unit: 'g', quantity_grams: 250, capture_method: 'saved_meal',
      log_group_id: '11111111-1111-1111-1111-111111111111', saved_meal_id: mealAId, energy_kcal: 147,
    }).select('id').single();
    check('user A can write a food_log_entry tagged with a saved meal + log group', !logErr && !!logRow);

    const { data: bReadLog } = await clientB.from('food_log_entries').select('*').eq('user_id', userAId);
    check("user B cannot read user A's food log", (bReadLog?.length ?? 0) === 0);

    const { count: aDelCount } = await clientA
      .from('saved_meals').delete({ count: 'exact' }).eq('id', mealAId);
    check('user A can delete their own saved meal', (aDelCount ?? 0) === 1);
    mealAId = null;

    const { data: survivor } = await admin
      .from('food_log_entries').select('id, saved_meal_id, log_group_id').eq('id', logRow!.id).single();
    check('the historical food_log_entry SURVIVES the meal deletion', !!survivor);
    check('its saved_meal_id was SET NULL, log_group_id kept', survivor!.saved_meal_id === null && survivor!.log_group_id != null);
  } finally {
    console.log('\nCleaning up...');
    await admin.from('food_log_entries').delete().in('user_id', [userAId, userBId]);
    if (mealAId) await admin.from('saved_meals').delete().eq('id', mealAId);
    await admin.from('saved_meals').delete().in('user_id', [userAId, userBId]);
    await admin.auth.admin.deleteUser(userAId);
    await admin.auth.admin.deleteUser(userBId);
  }

  console.log(failures === 0 ? '\nAll RLS checks passed.' : `\n${failures} RLS check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('RLS test script crashed:', e); process.exit(1); });
