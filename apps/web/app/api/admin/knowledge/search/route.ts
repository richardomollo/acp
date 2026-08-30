// ACP Intelligence™ Day 7.1 — internal retrieval test harness (section 44/45).
// Developer tooling only — never called from mobile, never wired into any
// product surface. Reuses this repo's existing admin Bearer-token pattern
// (section 45 explicitly requires this, not a weaker mechanism).
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/knowledge/admin-auth';
import { retrieveKnowledge } from '@/lib/knowledge/retrieval';
import type { RetrieveKnowledgeParams } from '@/lib/knowledge/types';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let params: RetrieveKnowledgeParams;
  try {
    params = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await retrieveKnowledge(params);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result);
}
