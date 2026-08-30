// Minimal in-memory double of the exact Supabase query-builder surface
// ingestion.ts/retrieval.ts actually use — not a general-purpose mock. Lets
// ingestion tests (sections 56-72) run deterministically without a live
// database, per section 55 ("tests should not depend unnecessarily on live
// OpenAI" — extended here to not depend on a live DB either, for the pure
// orchestration logic that doesn't need real Postgres to verify).
export type FakeRow = Record<string, unknown>;

export class FakeKnowledgeDb {
  documents: FakeRow[] = [];
  chunks: FakeRow[] = [];
  private nextId = 1;

  from(table: 'knowledge_documents' | 'knowledge_chunks') {
    return new FakeTable(this, table);
  }

  genId(): string {
    return `fake-id-${this.nextId++}`;
  }
}

type Filter = { col: string; val: unknown; neq?: boolean };
type FakeResult = { data: FakeRow | FakeRow[] | null; error: { message: string } | null };

class FakeTable implements PromiseLike<FakeResult> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private insertRows: FakeRow[] | null = null;
  private updateData: FakeRow | null = null;
  private filters: Filter[] = [];
  private inFilter: { col: string; vals: unknown[] } | null = null;

  private db: FakeKnowledgeDb;
  private table: 'knowledge_documents' | 'knowledge_chunks';

  constructor(db: FakeKnowledgeDb, table: 'knowledge_documents' | 'knowledge_chunks') {
    this.db = db;
    this.table = table;
  }

  private rows(): FakeRow[] {
    return this.table === 'knowledge_documents' ? this.db.documents : this.db.chunks;
  }

  // `.insert(...).select(...)` means "return the inserted row's columns" —
  // .select() must NOT clobber a mutation op back to a plain select (mirrors
  // real supabase-js: .select() after insert/update only affects RETURNING
  // columns, it never changes what operation actually runs).
  select() { return this; }
  insert(rows: FakeRow | FakeRow[]) { this.op = 'insert'; this.insertRows = Array.isArray(rows) ? rows : [rows]; return this; }
  update(data: FakeRow) { this.op = 'update'; this.updateData = data; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(col: string, val: unknown) { this.filters.push({ col, val }); return this; }
  neq(col: string, val: unknown) { this.filters.push({ col, val, neq: true }); return this; }
  in(col: string, vals: unknown[]) { this.inFilter = { col, vals }; return this; }

  private matches(row: FakeRow): boolean {
    for (const f of this.filters) {
      const equal = row[f.col] === f.val;
      if (f.neq ? equal : !equal) return false;
    }
    if (this.inFilter && !this.inFilter.vals.includes(row[this.inFilter.col])) return false;
    return true;
  }

  private execute(): FakeResult {
    const list = this.rows();
    if (this.op === 'select') {
      return { data: list.filter(r => this.matches(r)), error: null };
    }
    if (this.op === 'insert') {
      const inserted = (this.insertRows ?? []).map(r => ({ id: this.db.genId(), created_at: new Date().toISOString(), ...r }));
      list.push(...inserted);
      return { data: inserted, error: null };
    }
    if (this.op === 'update') {
      const matched = list.filter(r => this.matches(r));
      matched.forEach(r => Object.assign(r, this.updateData));
      return { data: matched, error: null };
    }
    if (this.op === 'delete') {
      const keep = list.filter(r => !this.matches(r));
      list.length = 0;
      list.push(...keep);
      return { data: null, error: null };
    }
    return { data: null, error: { message: 'Unsupported operation' } };
  }

  async maybeSingle() {
    const { data, error } = this.execute();
    if (error) return { data: null, error };
    return { data: Array.isArray(data) ? (data[0] ?? null) : data, error: null };
  }

  async single() {
    const { data, error } = this.execute();
    if (error) return { data: null, error };
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { data: row, error: null } : { data: null, error: { message: 'No rows' } };
  }

  // Thenable — mirrors the real supabase-js query builder, so `await
  // supabase.from(...).insert(...)` (no explicit .single()/.maybeSingle())
  // resolves exactly like ingestion.ts expects.
  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}
