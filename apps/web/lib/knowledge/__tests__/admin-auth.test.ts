import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdmin } from '../admin-auth.ts';

// test N — security boundary: the knowledge mutation/retrieval routes cannot
// be used as an unauthenticated consumer path. requireAdmin is exercised
// directly (not through a live HTTP route); the bad-token case injects a
// fake Supabase whose auth.getUser rejects the token, so no live database or
// service-role env var is needed.
const rejectingSupabase = {
  auth: { getUser: async () => ({ data: { user: null }, error: { message: 'invalid token' } }) },
  from() { throw new Error('from() must not be reached when the token is already invalid'); },
} as unknown as SupabaseClient;

describe('requireAdmin (test N — security boundary)', () => {
  test('a request with no Authorization header is rejected as unauthorized', async () => {
    const result = await requireAdmin(new Request('http://localhost/api/admin/knowledge/ingest', { method: 'POST' }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 401);
  });

  test('a garbage bearer token is rejected as unauthorized', async () => {
    const result = await requireAdmin(new Request('http://localhost/api/admin/knowledge/ingest', {
      method: 'POST',
      headers: { Authorization: 'Bearer not-a-real-token' },
    }), { supabase: rejectingSupabase });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 401);
  });
});
