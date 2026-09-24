// Lana Chat V1 — source-level architecture guards. These can't be proven by
// calling the route (no live OpenAI/Supabase in this test run) — instead
// they pin invariants at the SOURCE level, the same pattern already used by
// nutrition-planning-candidate-source.test.ts: if a future change
// reintroduces plan mutation, tool-calling, or a coaching_memory write from
// raw chat, this fails loudly.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routeSource = readFileSync(path.resolve(__dirname, '../route.ts'), 'utf-8');
const contextSource = readFileSync(path.resolve(__dirname, '../context.ts'), 'utf-8');

describe('Test I — chat cannot mutate plans', () => {
  test('the OpenAI request never defines tools/functions/tool_choice (no tool-calling at all)', () => {
    assert.ok(!/\btools\s*:/.test(routeSource));
    assert.ok(!/\bfunctions\s*:/.test(routeSource));
    assert.ok(!/\btool_choice\s*:/.test(routeSource));
  });
  test('the route never writes to a workout, nutrition-plan, booking, or goal table', () => {
    const mutatingTables = [
      'workout_history', 'plan_activity_execution', 'plan_activity_completions',
      'nutrition_planned_meals', 'nutrition_weekly_plans', 'nutrition_planning_cycles',
      'fitness_profile', 'bookings',
    ];
    for (const table of mutatingTables) {
      const re = new RegExp(`from\\(\\s*['"]${table}['"]\\s*\\)[^;]*\\.(update|insert|upsert|delete)\\(`, 's');
      assert.ok(!re.test(routeSource), `route.ts must never write to ${table}`);
    }
  });
  test('context.ts (the read-only evidence builder) performs zero writes anywhere', () => {
    assert.ok(!/\.(update|insert|upsert|delete)\(/.test(contextSource), 'context.ts must be read-only');
  });
});

describe('Test M — raw chat is never written to coaching_memory', () => {
  test('neither route.ts nor context.ts ever writes to coaching_memory', () => {
    assert.ok(!/coaching_memory['"]\s*\)[^;]*\.(update|insert|upsert)\(/s.test(routeSource));
    assert.ok(!/coaching_memory['"]\s*\)[^;]*\.(update|insert|upsert)\(/s.test(contextSource));
  });
});

describe('Test K — personal state is keyed only to the verified token, never a client-supplied userId', () => {
  test('buildLanaChatContext is called with user.id from the verified token, not the request body\'s userId', () => {
    assert.match(routeSource, /buildLanaChatContext\(user!\.id,/);
  });
});

describe('OpenAI secret handling (§L is proven mobile-side; this pins the server half)', () => {
  test('the OpenAI key is read only from process.env, never accepted from the request body', () => {
    assert.match(routeSource, /process\.env\.OPENAI_API_KEY/);
    assert.ok(!/body\??\.\s*openAiKey/i.test(routeSource));
  });
});
