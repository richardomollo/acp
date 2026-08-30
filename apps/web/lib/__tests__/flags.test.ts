import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isWeeklyAdaptationEnabled, isRagEnabled, isExecutionFeedbackEnabled, flagSnapshot } from '../flags.ts';

const KEYS = ['ACP_WEEKLY_ADAPTATION_ENABLED', 'ACP_RAG_ENABLED', 'ACP_EXECUTION_FEEDBACK_ENABLED'];
afterEach(() => { for (const k of KEYS) delete process.env[k]; });

describe('operational kill switches', () => {
  test('all default to ENABLED when unset', () => {
    assert.equal(isWeeklyAdaptationEnabled(), true);
    assert.equal(isRagEnabled(), true);
    assert.equal(isExecutionFeedbackEnabled(), true);
  });

  test('only the exact string "false" disables a flag', () => {
    process.env.ACP_RAG_ENABLED = 'false';
    assert.equal(isRagEnabled(), false);
    process.env.ACP_RAG_ENABLED = '0';
    assert.equal(isRagEnabled(), true);
    process.env.ACP_RAG_ENABLED = 'FALSE';
    assert.equal(isRagEnabled(), true);
    process.env.ACP_RAG_ENABLED = 'true';
    assert.equal(isRagEnabled(), true);
  });

  test('flags are independent', () => {
    process.env.ACP_WEEKLY_ADAPTATION_ENABLED = 'false';
    assert.equal(isWeeklyAdaptationEnabled(), false);
    assert.equal(isRagEnabled(), true);
    assert.equal(isExecutionFeedbackEnabled(), true);
  });

  test('flagSnapshot reflects current env', () => {
    process.env.ACP_EXECUTION_FEEDBACK_ENABLED = 'false';
    assert.deepEqual(flagSnapshot(), { weeklyAdaptation: true, rag: true, executionFeedback: false });
  });
});
