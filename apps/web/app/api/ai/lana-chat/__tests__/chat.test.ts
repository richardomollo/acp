import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyLanaChatIntent, selectContextForIntent, validateChatReply,
  sanitiseMessage, sanitiseHistory, sanitiseProteinTarget, buildLanaChatUserPrompt,
  LANA_CHAT_SYSTEM_PROMPT, MAX_HISTORY_TURNS, MAX_MESSAGE_LENGTH,
} from '../chat.ts';
import type { LanaChatContext } from '../context.ts';

const FULL_CONTEXT: LanaChatContext = {
  user: { goal: 'build_muscle', fitnessLevel: 'intermediate' },
  today: {
    plannedWorkout: { title: 'Upper body strength', category: 'strength', intensity: 'moderate', durationMinutes: 45 },
    workoutStatus: 'planned',
    plannedMeals: [{ slot: 'lunch', label: 'Githeri', status: 'planned' }],
  },
  fitness: {
    weekStartDate: '2026-09-21', weekEndDate: '2026-09-27',
    recentCompletion: { weeksUsed: 3, planned: 12, completed: 9, completionRate: 0.75, trendDirection: 'improving' },
    supportedPatterns: [{ subject: 'strength', kind: 'success', confidence: 'strong', message: 'Strength sessions have a strong completion rate.' }],
  },
  nutrition: {
    proteinTargetG: { min: 112, max: 160 },
    consumedTodayKcal: 1200, consumedTodayProteinG: 74,
    weeklyObjective: 'Focus on protein', weeklyObjectiveReason: 'Carried forward: below target on 4 of 6 days',
    weeklyObjectiveTheme: 'protein_consistency',
    recentProteinEvidence: { daysWithLogs: 5, averageProteinG: 90 },
  },
};

describe('classifyLanaChatIntent — §5 deterministic keyword routing', () => {
  test('A. a fitness question classifies as fitness', () => {
    assert.equal(classifyLanaChatIntent('What am I training tomorrow?'), 'fitness');
  });
  test('B. a nutrition question classifies as nutrition', () => {
    assert.equal(classifyLanaChatIntent('What should I eat tonight?'), 'nutrition');
  });
  test('progress question classifies as progress', () => {
    assert.equal(classifyLanaChatIntent('How am I doing this week?'), 'progress');
  });
  test('adaptation/why question classifies as adaptation', () => {
    assert.equal(classifyLanaChatIntent('Why did my meal plan change?'), 'adaptation');
  });
  test('protein-specific question classifies as protein, not generic nutrition', () => {
    assert.equal(classifyLanaChatIntent('How much protein have I logged today?'), 'protein');
  });
  test('a general-knowledge question classifies as general', () => {
    assert.equal(classifyLanaChatIntent('What is a Romanian deadlift?'), 'general');
  });
  test('an ambiguous/empty message classifies as default', () => {
    assert.equal(classifyLanaChatIntent('hi'), 'default');
    assert.equal(classifyLanaChatIntent('   '), 'default');
  });
  test('deterministic — same message always classifies the same way', () => {
    const a = classifyLanaChatIntent('What should I eat after training?');
    const b = classifyLanaChatIntent('What should I eat after training?');
    assert.equal(a, b);
  });
});

describe('selectContextForIntent — §5/§16 keeps the payload small and relevant', () => {
  test('A. fitness intent gets fitness + today, never the nutrition slice', () => {
    const trimmed = selectContextForIntent('fitness', FULL_CONTEXT);
    assert.ok(trimmed.fitness);
    assert.ok(trimmed.today);
    assert.equal(trimmed.nutrition, undefined);
  });
  test('B. nutrition intent gets nutrition + today (post-workout context), never fitness evidence', () => {
    const trimmed = selectContextForIntent('nutrition', FULL_CONTEXT);
    assert.ok(trimmed.nutrition);
    assert.ok(trimmed.today);
    assert.equal(trimmed.fitness, undefined);
  });
  test('C. a general-knowledge intent receives only fitnessLevel — no fitness/nutrition/today personal evidence', () => {
    const trimmed = selectContextForIntent('general', FULL_CONTEXT);
    assert.deepEqual(Object.keys(trimmed).sort(), ['user']);
    assert.equal(trimmed.fitness, undefined);
    assert.equal(trimmed.nutrition, undefined);
    assert.equal(trimmed.today, undefined);
  });
  test('protein intent is the narrowest personal slice — just user + nutrition', () => {
    const trimmed = selectContextForIntent('protein', FULL_CONTEXT);
    assert.deepEqual(Object.keys(trimmed).sort(), ['nutrition', 'user']);
  });
  test('default (ambiguous) intent never sends the full personal dump', () => {
    const trimmed = selectContextForIntent('default', FULL_CONTEXT);
    assert.equal(trimmed.fitness, undefined);
    assert.ok(!('recentCompletion' in (trimmed.nutrition ?? {})));
  });
});

describe('missing evidence stays missing, never becomes a fabricated zero/value (Test D)', () => {
  const emptyContext: LanaChatContext = {
    user: { goal: null, fitnessLevel: null },
    today: { plannedWorkout: null, workoutStatus: 'unknown', plannedMeals: [] },
    fitness: { weekStartDate: null, weekEndDate: null, recentCompletion: null, supportedPatterns: [] },
    nutrition: {
      proteinTargetG: null, consumedTodayKcal: null, consumedTodayProteinG: null,
      weeklyObjective: null, weeklyObjectiveReason: null, weeklyObjectiveTheme: null, recentProteinEvidence: null,
    },
  };
  test('a context with no evidence anywhere serialises every personal field as null, never 0 or a placeholder string', () => {
    const trimmed = selectContextForIntent('progress', emptyContext);
    const json = JSON.stringify(trimmed);
    assert.ok(json.includes('"proteinTargetG":null'));
    assert.ok(json.includes('"consumedTodayProteinG":null'));
    assert.ok(json.includes('"recentCompletion":null'));
    assert.ok(!json.includes('"consumedTodayProteinG":0'));
  });
});

describe('unsupported macro targets are structurally impossible to invent (Test E)', () => {
  test('LanaChatContext has no calorie/carb/fat TARGET field at all — only protein', () => {
    const keys = Object.keys(FULL_CONTEXT.nutrition);
    assert.ok(keys.includes('proteinTargetG'));
    assert.ok(!keys.some(k => /calorieTarget|carbTarget|fatTarget|energyTarget/i.test(k)));
  });
  test('the system prompt explicitly forbids fabricating calorie/carb/fat targets', () => {
    assert.match(LANA_CHAT_SYSTEM_PROMPT, /never fabricate a calorie, carb, or fat target/i);
  });
});

describe('validateChatReply — reply safety (mirrors nutrition-coaching\'s BANNED convention)', () => {
  test('a clean reply passes through unchanged', () => {
    const result = validateChatReply('You have logged 74g of protein today, within reach of your range.');
    assert.equal(result.ok, true);
    assert.match(result.text, /74g/);
  });
  test('a diagnosis/deficiency claim is rejected wholesale, never partially edited', () => {
    const result = validateChatReply('Based on your logs, you have a protein deficiency.');
    assert.equal(result.ok, false);
  });
  test('a supplement recommendation is rejected', () => {
    const result = validateChatReply('You could try a protein powder supplement.');
    assert.equal(result.ok, false);
  });
  test('§9 — a claimed plan mutation is rejected (chat must never claim it changed something)', () => {
    const result = validateChatReply("I've updated your workout plan for tomorrow.");
    assert.equal(result.ok, false);
  });
  test('a non-string or empty model response is rejected safely, never throws', () => {
    assert.equal(validateChatReply(undefined).ok, false);
    assert.equal(validateChatReply('').ok, false);
    assert.equal(validateChatReply('   ').ok, false);
  });
});

describe('request sanitisation', () => {
  test('sanitiseMessage trims, caps length, rejects empty/non-string', () => {
    assert.equal(sanitiseMessage('  hello  '), 'hello');
    assert.equal(sanitiseMessage(''), null);
    assert.equal(sanitiseMessage(42), null);
    assert.equal(sanitiseMessage('x'.repeat(2000)).length, MAX_MESSAGE_LENGTH);
  });
  test('sanitiseHistory caps turns and drops malformed entries', () => {
    const long = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `turn ${i}` }));
    const capped = sanitiseHistory(long);
    assert.ok(capped.length <= MAX_HISTORY_TURNS * 2);
    assert.equal(sanitiseHistory([{ role: 'system', content: 'x' }]).length, 0);
    assert.equal(sanitiseHistory('not an array').length, 0);
  });
  test('sanitiseProteinTarget only accepts a valid {min,max} shape', () => {
    assert.deepEqual(sanitiseProteinTarget({ min: 112, max: 160 }), { min: 112, max: 160 });
    assert.equal(sanitiseProteinTarget(null), null);
    assert.equal(sanitiseProteinTarget({ min: 160, max: 112 }), null);
    assert.equal(sanitiseProteinTarget({ min: -5, max: 100 }), null);
    assert.equal(sanitiseProteinTarget({ min: '112', max: 160 }), null);
  });
});

describe('buildLanaChatUserPrompt — pure, deterministic', () => {
  test('includes the evidence JSON, history, and the message; omits an empty knowledge block', () => {
    const prompt = buildLanaChatUserPrompt('How am I doing?', { user: FULL_CONTEXT.user }, [], '');
    assert.match(prompt, /LANA EVIDENCE/);
    assert.match(prompt, /User: How am I doing\?/);
    assert.ok(!prompt.includes('RELEVANT LANA KNOWLEDGE'));
  });
  test('includes a non-empty knowledge block only when supplied', () => {
    const prompt = buildLanaChatUserPrompt('What is a deadlift?', { user: FULL_CONTEXT.user }, [], 'RELEVANT LANA KNOWLEDGE\n\nsome fact');
    assert.match(prompt, /RELEVANT LANA KNOWLEDGE/);
  });
  test('deterministic given the same inputs', () => {
    const a = buildLanaChatUserPrompt('msg', { user: FULL_CONTEXT.user }, [], '');
    const b = buildLanaChatUserPrompt('msg', { user: FULL_CONTEXT.user }, [], '');
    assert.equal(a, b);
  });
});
