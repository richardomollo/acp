import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: new URL('./.env', import.meta.url).pathname });
config({ path: new URL('./.env.local', import.meta.url).pathname });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let user = null;
let page = 1;
while (!user) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  user = data.users.find(u => u.email?.toLowerCase() === 'mariah@gmail.com');
  if (user || data.users.length < 1000) break;
  page += 1;
}

if (!user) {
  console.log('No auth user found with email mariah@gmail.com');
  process.exit(0);
}

console.log('User found:', { id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at });

const { data: profile, error: profileErr } = await admin
  .from('fitness_profile')
  .select('*')
  .eq('user_id', user.id)
  .maybeSingle();
if (profileErr) console.log('fitness_profile query error:', profileErr);
console.log('fitness_profile:', JSON.stringify(profile, null, 2));

const { data: healthProfile } = await admin.from('health_profile').select('*').eq('user_id', user.id).maybeSingle();
console.log('health_profile:', JSON.stringify(healthProfile, null, 2));

const { data: plans } = await admin.from('fitness_plans').select('plan_id, week_start_date, week_end_date, status, created_at').eq('user_id', user.id).order('created_at', { ascending: false });
console.log('fitness_plans history:', JSON.stringify(plans, null, 2));
