// ACP Intelligence™ Day 7.1 — reuses this repo's existing admin-route
// pattern (apps/web/app/api/admin/delete-user/route.ts): Bearer token →
// resolve the caller via Supabase auth → require users.role === 'admin'.
// Shared here so the three new knowledge admin routes don't each duplicate
// it (the pre-existing admin routes are left exactly as they were).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Lazily constructed (same pattern as lib/knowledge/ingestion.ts and
// retrieval.ts) so merely importing this module — e.g. from a unit test that
// only exercises the no-token branch — never requires the service-role env
// vars to be present.
function adminSupabaseClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// `deps` is injectable (real service-role client by default) so the
// security-boundary branches can be unit tested without a live database —
// same convention as IngestDeps/RetrieveDeps in this directory.
export interface AdminAuthDeps {
  supabase?: SupabaseClient;
}

export async function requireAdmin(
  request: Request,
  deps: AdminAuthDeps = {},
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };

  const adminSupabase = deps.supabase ?? adminSupabaseClient();

  const { data: { user }, error } = await adminSupabase.auth.getUser(token);
  if (error || !user) return { ok: false, status: 401, error: 'Unauthorized' };

  const { data } = await adminSupabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (data?.role !== 'admin') return { ok: false, status: 403, error: 'Forbidden' };

  return { ok: true };
}
