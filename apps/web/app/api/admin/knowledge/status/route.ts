// ACP Intelligence™ Day 7.1 — admin-only lifecycle transitions (section 47):
// draft → reviewed → approved → retired. Approving handles version
// supersession (section 21/49) via setKnowledgeDocumentStatus.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/knowledge/admin-auth';
import { setKnowledgeDocumentStatus } from '@/lib/knowledge/ingestion';
import type { KnowledgeStatus } from '@/lib/knowledge/types';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { documentId?: string; status?: KnowledgeStatus };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.documentId || !body.status) {
    return NextResponse.json({ error: 'Missing documentId or status' }, { status: 400 });
  }

  const result = await setKnowledgeDocumentStatus(body.documentId, body.status);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json(result);
}
