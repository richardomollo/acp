// ACP Intelligence™ Day 7.1 — admin-only knowledge ingestion (section 16/46).
// No file scraping or arbitrary URL ingestion — accepts only the controlled
// KnowledgeDocumentInput shape.
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/knowledge/admin-auth';
import { ingestKnowledgeDocument } from '@/lib/knowledge/ingestion';
import type { KnowledgeDocumentInput } from '@/lib/knowledge/types';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let input: KnowledgeDocumentInput;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await ingestKnowledgeDocument(input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json(result);
}
