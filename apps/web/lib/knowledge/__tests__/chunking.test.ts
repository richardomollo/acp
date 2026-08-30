import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sectionsToChunks } from '../chunking.ts';
import { MAX_SECTION_CHARS } from '../constants.ts';

describe('sectionsToChunks', () => {
  test('a normal-sized section becomes exactly one chunk (section 25)', () => {
    const chunks = sectionsToChunks([{ heading: 'A', content: 'Short section content.' }], {});
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].heading, 'A');
    assert.equal(chunks[0].content, 'Short section content.');
  });

  test('chunk_index is contiguous and ordered across multiple sections (test C)', () => {
    const chunks = sectionsToChunks([
      { heading: 'A', content: 'First section.' },
      { heading: 'B', content: 'Second section.' },
      { heading: 'C', content: 'Third section.' },
    ], {});
    assert.deepEqual(chunks.map(c => c.chunkIndex), [0, 1, 2]);
    assert.deepEqual(chunks.map(c => c.heading), ['A', 'B', 'C']);
  });

  test('an oversized section splits deterministically at paragraph boundaries', () => {
    const para1 = 'A'.repeat(MAX_SECTION_CHARS - 10);
    const para2 = 'B'.repeat(MAX_SECTION_CHARS - 10);
    const chunks = sectionsToChunks([{ heading: 'Big', content: `${para1}\n\n${para2}` }], {});
    assert.ok(chunks.length >= 2, 'expects more than one chunk for an oversized section');
    for (const c of chunks) assert.ok(c.content.length <= MAX_SECTION_CHARS);
  });

  test('splitting is deterministic — running it twice gives identical results', () => {
    const content = `${'X'.repeat(2000)}\n\n${'Y'.repeat(2000)}`;
    const a = sectionsToChunks([{ heading: 'H', content }], {});
    const b = sectionsToChunks([{ heading: 'H', content }], {});
    assert.deepEqual(a, b);
  });

  test('chunk metadata inherits document metadata, with section metadata added on top (section 19)', () => {
    const chunks = sectionsToChunks(
      [{ heading: 'A', content: 'Content.', metadata: { topics: ['progressive_overload'] } }],
      { goals: ['build_muscle'], experience_levels: ['beginner'] },
    );
    assert.deepEqual(chunks[0].metadata, {
      goals: ['build_muscle'], experience_levels: ['beginner'], topics: ['progressive_overload'],
    });
  });

  test('empty/whitespace-only sections are skipped entirely, never producing an empty chunk', () => {
    const chunks = sectionsToChunks([{ heading: 'Empty', content: '   ' }, { heading: 'Real', content: 'Actual content.' }], {});
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].heading, 'Real');
  });
});
