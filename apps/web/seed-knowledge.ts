// ACP Intelligence™ Day 7.1 — seed corpus (section 30/31).
// Small, clearly-labelled internal knowledge to prove the ingestion →
// approval → retrieval pipeline. NOT ACP's real, full knowledge base — every
// document is source_type='internal' (never a fabricated WHO/ACSM/NHS
// reference, section 31). Re-run any time: ingestion is idempotent
// (identical content is reused, never duplicated — section 22/23).
//
// Usage: node --env-file=.env seed-knowledge.ts   (from apps/web)
import { ingestKnowledgeDocument, approveKnowledgeDocument } from './lib/knowledge/ingestion.ts';
import { retrieveKnowledge } from './lib/knowledge/retrieval.ts';
import { SEED_KNOWLEDGE_DOCS as DOCS } from './lib/knowledge/seed-corpus.ts';

async function main() {
  console.log(`Seeding ${DOCS.length} knowledge documents...\n`);
  const documentIds: string[] = [];

  for (const doc of DOCS) {
    const result = await ingestKnowledgeDocument({ ...doc, status: 'draft' });
    if (!result.ok) {
      console.error(`FAILED to ingest "${doc.title}": ${result.error}`);
      process.exit(1);
    }
    console.log(`ingested "${doc.title}" -> ${result.documentId} (duplicate=${result.duplicate}, chunksCreated=${result.chunksCreated}, chunksReused=${result.chunksReused})`);
    documentIds.push(result.documentId);

    const approved = await approveKnowledgeDocument(result.documentId);
    if (!approved.ok) {
      console.error(`FAILED to approve "${doc.title}": ${approved.error}`);
      process.exit(1);
    }
    console.log(`  approved (superseded=${approved.supersededDocumentId ?? 'none'})`);
  }

  console.log('\n--- Idempotency check: re-ingesting the first document ---');
  const repeat = await ingestKnowledgeDocument({ ...DOCS[0], status: 'draft' });
  console.log(repeat.ok
    ? `duplicate=${repeat.duplicate} chunksCreated=${repeat.chunksCreated} chunksReused=${repeat.chunksReused}`
    : `FAILED: ${repeat.error}`);

  console.log('\n--- Developer validation queries (section 81) ---');
  const queries = [
    'beginner strength progression',
    'how do I stay consistent when I have little time',
    'recovery between hard strength sessions',
    'protein as part of a balanced meal',
    'Dutch unemployment benefit calculation',
  ];
  for (const query of queries) {
    const res = await retrieveKnowledge({ query });
    console.log(`\nQuery: "${query}"`);
    if (!res.ok) { console.log(`  FAILED: ${res.error}`); continue; }
    if (res.results.length === 0) { console.log('  (no results above threshold)'); continue; }
    res.results.forEach((r, i) => {
      console.log(`  #${i + 1} [${r.domain}] "${r.title}"${r.heading ? ` — ${r.heading}` : ''} similarity=${r.similarity.toFixed(4)}`);
    });
  }

  // ── Day 7.5C retrieval smoke tests (section 34/35) ──────────────────────
  // The exact training-query shapes the Day 7.5B baseline showed returning
  // nothing, plus the recovery-spacing query. Threshold is NOT tuned to make
  // these pass — KNOWLEDGE_MIN_SIMILARITY stays at 0.3.
  console.log('\n--- Day 7.5C training/recovery retrieval smoke tests ---');
  const smokeTests: Array<{ query: string; domains: ('training' | 'recovery')[]; goals?: string[]; experienceLevels?: string[] }> = [
    { query: 'beginner lose_weight progression with low adherence', domains: ['training'], goals: ['lose_weight'], experienceLevels: ['beginner'] },
    { query: 'beginner reduce_stress progression with high adherence', domains: ['training'], goals: ['reduce_stress'], experienceLevels: ['beginner'] },
    { query: 'intermediate lose_weight progression with high adherence', domains: ['training'], goals: ['lose_weight'], experienceLevels: ['intermediate'] },
    { query: 'intermediate general_fitness progression with high adherence', domains: ['training'], goals: ['general_fitness'], experienceLevels: ['intermediate'] },
    { query: 'experienced build_muscle progression with high adherence', domains: ['training'], goals: ['build_muscle'], experienceLevels: ['experienced'] },
    { query: 'experienced general_fitness progression with high adherence', domains: ['training'], goals: ['general_fitness'], experienceLevels: ['experienced'] },
    { query: 'recovery when demanding sessions are closely scheduled', domains: ['recovery'] },
  ];
  for (const t of smokeTests) {
    const res = await retrieveKnowledge({ query: t.query, domains: t.domains, goals: t.goals, experienceLevels: t.experienceLevels });
    console.log(`\nQuery: "${t.query}"`);
    if (!res.ok) { console.log(`  FAILED: ${res.error}`); continue; }
    if (res.results.length === 0) { console.log('  (no results above threshold)'); continue; }
    res.results.forEach((r, i) => {
      console.log(`  #${i + 1} [${r.domain}] "${r.title}"${r.heading ? ` — ${r.heading}` : ''} similarity=${r.similarity.toFixed(4)}`);
    });
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
