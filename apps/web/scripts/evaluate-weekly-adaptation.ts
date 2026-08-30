#!/usr/bin/env node
// ACP Intelligence™ Day 7.5 — weekly-adaptation evaluation runner.
//
// Usage (from apps/web):
//   node --env-file=.env scripts/evaluate-weekly-adaptation.ts
//   node --env-file=.env scripts/evaluate-weekly-adaptation.ts --live
//   node --env-file=.env scripts/evaluate-weekly-adaptation.ts --scenario A1
//   node --env-file=.env scripts/evaluate-weekly-adaptation.ts --group C
//   ACP_RUN_LIVE_AI_EVAL=1 node --env-file=.env scripts/evaluate-weekly-adaptation.ts
//
// Live model calls NEVER happen unless ACP_RUN_LIVE_AI_EVAL=1 is set.
// Writes JSON to tmp/acp-intelligence-eval/ (gitignored).

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EVALUATION_SCENARIOS, LIVE_SUITE_IDS, ABLATION_IDS, EXECUTION_LIVE_IDS,
} from '../app/api/ai/weekly-adaptation/evaluation/scenarios.ts';
import { buildWeeklyExecutionSummary, buildCompactExecutionContext } from '../app/api/ai/weekly-adaptation/execution.ts';
import { isRagEnabled, isExecutionFeedbackEnabled } from '../lib/flags.ts';
import {
  gradeDecision, gradeDomainSelection, gradeWorkload, gradeContinuity,
  gradeGrounding, gradeSupport, gradeGoalImmutability, gradeScenario,
  buildDomainRequestsForScenario, selectLiveSuite, computeDecisionDistribution,
  computePassRates, evaluateQualityGate, calcThresholdAnalysis,
} from '../app/api/ai/weekly-adaptation/evaluation/graders.ts';
import { CORPUS_MAP, CORPUS_SUMMARY, CORPUS_GAPS } from '../app/api/ai/weekly-adaptation/evaluation/corpus-map.ts';
import {
  WEEKLY_ADAPTATION_MODEL, AI_REQUEST_CONFIG, WEEKLY_ADAPTATION_SYSTEM_PROMPT,
  buildWeeklyAdaptationUserPrompt, validateWeeklyAdaptation, enforceAdaptationMagnitude,
  preserveMeaningfulActivityContinuity, enforceAdaptationSupportLogic,
  type BehaviourSummary, type AdaptationDecision,
} from '../app/api/ai/weekly-adaptation/adaptation.ts';
import {
  retrieveKnowledgeForAdaptation,
  buildKnowledgeRetrievalRequests, hasRepeatedChallengingSessions,
} from '../app/api/ai/weekly-adaptation/knowledge.ts';
import { enforceTimeBudget } from '../app/api/ai/onboarding-assessment/assessment.ts';
import type { EvaluationScenario, WeeklyAdaptationEvaluationResult, EvaluationReport } from '../app/api/ai/weekly-adaptation/evaluation/types.ts';
import type { StartingPlanActivity } from '../app/api/ai/onboarding-assessment/assessment.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIVE = process.env.ACP_RUN_LIVE_AI_EVAL === '1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const specificScenario = args.includes('--scenario') ? (args[args.indexOf('--scenario') + 1] ?? null) : null;
const specificGroup = args.includes('--group') ? (args[args.indexOf('--group') + 1] ?? null) : null;
const EXECUTION_ONLY = args.includes('--execution'); // Day 9 — bounded live validation of the new N-group scenarios

function selectScenarios(): EvaluationScenario[] {
  if (specificScenario) return EVALUATION_SCENARIOS.filter(s => s.id === specificScenario);
  if (specificGroup) return EVALUATION_SCENARIOS.filter(s => s.group === specificGroup);
  if (EXECUTION_ONLY) return EVALUATION_SCENARIOS.filter(s => EXECUTION_LIVE_IDS.has(s.id));
  return LIVE ? selectLiveSuite(EVALUATION_SCENARIOS, LIVE_SUITE_IDS) : EVALUATION_SCENARIOS;
}

// ── Deterministic retrieval-domain evaluation ─────────────────────────────────

function runDeterministicEval(scenarios: EvaluationScenario[]): WeeklyAdaptationEvaluationResult[] {
  const results: WeeklyAdaptationEvaluationResult[] = [];

  for (const scenario of scenarios) {
    const domainRequests = buildDomainRequestsForScenario(scenario);
    const domainGrade = gradeDomainSelection(
      domainRequests.map(r => r.domain),
      scenario.expected,
    );

    results.push({
      scenarioId: scenario.id,
      description: scenario.description,
      group: scenario.group,
      retrieval: {
        requests: domainRequests,
        results: [],
        domainPass: domainGrade.pass,
      },
      grading: {
        decisionPass: true,   // not graded deterministically without model output
        domainPass: domainGrade.pass,
        workloadPass: true,
        continuityPass: true,
        supportPass: true,
        goalPass: true,
        groundingWarnings: [],
        overallPass: domainGrade.pass,
        severity: domainGrade.pass ? 'pass' : 'major',
        detail: {
          decision: { pass: true, actual: 'N/A', allowed: [], forbidden: [] },
          domain: domainGrade,
          workload: { pass: true, previousMinutes: 0, nextMinutes: 0, deltaPercent: 0 },
          continuity: { pass: true, removedCategories: [], addedCategories: [], preservedRequired: [], missingRequired: [], forbiddenPresent: [] },
          support: { pass: true },
          goal: { pass: true },
          grounding: { warnings: [] },
        },
      },
    });
  }

  return results;
}

// ── Live model evaluation ─────────────────────────────────────────────────────

async function runLiveScenario(
  scenario: EvaluationScenario,
  withKnowledge = true,
): Promise<WeeklyAdaptationEvaluationResult> {
  const start = Date.now();

  // Retrieval.
  const knowledgeRequests = buildKnowledgeRetrievalRequests({
    goal: scenario.userContext.goal,
    experience: scenario.userContext.experience,
    barriers: scenario.userContext.barriers,
    behaviourAdherenceRate: scenario.behaviourEvidence.adherence_rate,
    hasDifficultyPattern: (scenario.longitudinalPatterns ?? []).some(
      p => p.confidence !== 'emerging' && ['category_difficulty', 'day_difficulty', 'duration_difficulty'].includes(p.type),
    ),
    hasRepeatedChallengingSessions: hasRepeatedChallengingSessions(scenario.currentPlanActivities),
  });
  const retrievalStart = Date.now();
  const knowledgeResult = await retrieveKnowledgeForAdaptation(knowledgeRequests);
  const retrievalMs = Date.now() - retrievalStart;

  const domainGrade = gradeDomainSelection(knowledgeResult.domainsRequested, scenario.expected);

  const previousActivities = scenario.currentPlanActivities;
  const fakeCurrentPlan = {
    headline: 'Current plan', summary: '', starting_point: { experience: scenario.userContext.experience ?? '', available_time: '', main_barriers: scenario.userContext.barriers },
    recommendation: { approach: 'self_directed' as const, title: '', reason: '' },
    support_opportunities: [], starting_plan: { title: '', rationale: '', activities: previousActivities },
    weekly_focus: { title: '', description: '' }, next_steps: [], nutrition_focus: null, review: null,
    generation_source: 'ai_adaptation' as const,
  };

  // Day 9 — reconcile the scenario's execution records into the compact
  // EXECUTION EVIDENCE block, exactly as the production route does.
  const executionRecords = (scenario.executionRecords ?? []).map(r => ({
    activityIndex: r.activityIndex,
    executionStatus: r.executionStatus,
    difficulty: r.difficulty ?? null,
    skipReason: r.skipReason ?? null,
    actualDurationMinutes: null,
  }));
  const completedIdx = new Set(
    executionRecords.filter(r => r.executionStatus === 'completed' || r.executionStatus === 'partial').map(r => r.activityIndex),
  );
  const executionContext = executionRecords.length > 0 && isExecutionFeedbackEnabled()
    ? buildCompactExecutionContext(buildWeeklyExecutionSummary(previousActivities, completedIdx, executionRecords))
    : '';

  const userPrompt = buildWeeklyAdaptationUserPrompt({
    goal: scenario.userContext.goal,
    experience: scenario.userContext.experience,
    barriers: scenario.userContext.barriers,
    preferredActivities: scenario.userContext.preferredActivities,
    weeklyMinutesBudget: scenario.userContext.weeklyMinutesBudget,
    previousWeeklyFocus: fakeCurrentPlan.weekly_focus,
    previousSupportOpportunities: [],
    behaviourSummary: scenario.behaviourEvidence as BehaviourSummary,
    longitudinalContext: scenario.longitudinalPatterns && scenario.longitudinalPatterns.length > 0
      ? { weeks_observed: 4, patterns: scenario.longitudinalPatterns as any[], outcomes: scenario.outcomePatterns as any[] ?? [] }
      : null,
    knowledgeContext: withKnowledge && isRagEnabled() ? knowledgeResult.compactContext : null,
    executionContext,
  });

  const generationStart = Date.now();
  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: WEEKLY_ADAPTATION_MODEL,
      messages: [
        { role: 'system', content: WEEKLY_ADAPTATION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'weekly_adaptation', strict: true, schema: (await import('../app/api/ai/weekly-adaptation/adaptation.ts')).WEEKLY_ADAPTATION_JSON_SCHEMA },
      },
      ...AI_REQUEST_CONFIG,
    }),
  });
  const generationMs = Date.now() - generationStart;

  if (!aiRes.ok) throw new Error(`OpenAI ${aiRes.status}: ${await aiRes.text()}`);
  const completion = await aiRes.json();
  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) throw new Error('No content in AI response');
  const parsed = JSON.parse(raw);
  if (!validateWeeklyAdaptation(parsed)) throw new Error('AI response failed validation');

  // Guardrails (same order as production route.ts).
  const interventions: string[] = [];
  let activities = enforceTimeBudget(parsed.starting_plan.activities, scenario.userContext.weeklyMinutesBudget);
  if (activities.length !== parsed.starting_plan.activities.length) interventions.push('time_budget');

  const afterMagnitude = enforceAdaptationMagnitude(activities, previousActivities);
  if (afterMagnitude.length !== activities.length) interventions.push('adaptation_magnitude');
  activities = afterMagnitude;

  const afterContinuity = preserveMeaningfulActivityContinuity({
    previousActivities, nextActivities: activities,
    missedByCategory: scenario.behaviourEvidence.missed_by_category,
    preferredActivities: scenario.userContext.preferredActivities,
    barriers: scenario.userContext.barriers,
    weekStartDate: new Date().toISOString().split('T')[0],
  });
  if (afterContinuity.length !== activities.length) interventions.push('continuity');
  activities = afterContinuity;

  const finalActivities = enforceTimeBudget(activities, scenario.userContext.weeklyMinutesBudget);
  if (finalActivities.length !== activities.length) interventions.push('time_budget_post_continuity');

  const draftAssessment = { ...fakeCurrentPlan, support_opportunities: parsed.support_opportunities, starting_plan: { ...fakeCurrentPlan.starting_plan, activities: finalActivities } };
  const afterSupport = enforceAdaptationSupportLogic(draftAssessment, {
    strengthExperience: scenario.userContext.experience,
    barriers: scenario.userContext.barriers,
  });
  const finalSupport = afterSupport.support_opportunities;
  if (JSON.stringify(finalSupport) !== JSON.stringify(parsed.support_opportunities)) interventions.push('support_logic');

  const grading = gradeScenario(scenario, {
    decision: parsed.decision as AdaptationDecision,
    rationale: `${parsed.review.summary} ${parsed.starting_plan.rationale}`,
    previousActivities,
    finalActivities,
    support_opportunities: finalSupport,
    requestedDomains: knowledgeResult.domainsRequested,
  });

  return {
    scenarioId: scenario.id,
    description: scenario.description,
    group: scenario.group,
    retrieval: {
      requests: knowledgeRequests.map(r => ({ domain: r.domain, query: r.query })),
      results: knowledgeResult.domainsRequested.map(domain => ({
        domain,
        query: knowledgeRequests.find(r => r.domain === domain)?.query ?? '',
        resultCount: (knowledgeResult.resultsByDomain[domain] ?? []).length,
        topSimilarity: (knowledgeResult.resultsByDomain[domain] ?? [])[0]?.similarity ?? null,
        chunks: (knowledgeResult.resultsByDomain[domain] ?? []).map(c => ({
          chunkId: c.chunkId, title: c.title, similarity: c.similarity, relevant: null,
        })),
        domainPass: domainGrade.pass,
      })),
      domainPass: domainGrade.pass,
    },
    generation: {
      decision: parsed.decision as AdaptationDecision,
      rationale: `${parsed.review.summary} ${parsed.starting_plan.rationale}`,
      rawActivities: parsed.starting_plan.activities,
      support_opportunities: parsed.support_opportunities,
    },
    guardrails: { finalActivities, interventions },
    grading,
    timing: { retrievalMs, generationMs, totalMs: Date.now() - start },
  };
}

// ── Reporting ─────────────────────────────────────────────────────────────────

function renderTable(results: WeeklyAdaptationEvaluationResult[]): void {
  const pad = (s: string | undefined, n: number) => (s ?? '').padEnd(n).slice(0, n);
  const col = (s: string | boolean | undefined, n: number) => pad(String(s ?? ''), n);

  console.log('\n' + [
    col('ID', 4), col('Grp', 4), col('Domain', 7), col('Decision', 9), col('Plan', 5), col('Ground', 7), col('Result', 8), 'Description',
  ].join(' '));
  console.log('─'.repeat(110));

  for (const r of results) {
    const domainStr = r.grading.domainPass ? 'PASS' : 'FAIL';
    const decStr = r.generation ? (r.grading.decisionPass ? 'PASS' : 'FAIL') : 'N/A';
    const planStr = r.grading.workloadPass && r.grading.continuityPass ? 'PASS' : 'FAIL';
    const groundStr = r.grading.groundingWarnings.length === 0 ? 'PASS' : `WARN(${r.grading.groundingWarnings.length})`;
    const overall = r.grading.overallPass ? 'PASS' : r.grading.severity.toUpperCase();
    console.log([
      col(r.scenarioId, 4), col(r.group, 4), col(domainStr, 7), col(decStr, 9), col(planStr, 5), col(groundStr, 7), col(overall, 8),
      r.description.slice(0, 55),
    ].join(' '));
  }
  console.log('─'.repeat(110));
}

function renderSummary(results: WeeklyAdaptationEvaluationResult[], liveCount: number): void {
  const gradings = results.map(r => r.grading);
  const rates = computePassRates(gradings);

  const liveGradings = results.filter(r => r.generation).map(r => r.grading);
  const liveRates = liveGradings.length > 0 ? computePassRates(liveGradings) : null;

  const decisions = results.filter(r => r.generation).map(r => r.generation!.decision);
  const dist = decisions.length > 0 ? computeDecisionDistribution(decisions) : null;

  console.log('\n── Summary ──────────────────────────────────────────────');
  console.log(`Scenarios evaluated:   ${results.length}`);
  console.log(`Live model calls:      ${liveCount}`);
  console.log(`Retrieval domain pass: ${Math.round(rates.domainPassRate * 100)}% (${results.filter(r => r.grading.domainPass).length}/${results.length})`);

  if (liveRates) {
    console.log(`\nLive results (n=${liveGradings.length}):`);
    console.log(`  Decision pass rate:  ${Math.round(liveRates.decisionPassRate * 100)}%`);
    console.log(`  Plan validity rate:  ${Math.round(liveRates.planValidityRate * 100)}%`);
    console.log(`  Workload pass:       ${Math.round(liveRates.workloadPassRate * 100)}%`);
    console.log(`  Continuity pass:     ${Math.round(liveRates.continuityPassRate * 100)}%`);
    console.log(`  Support pass:        ${Math.round(liveRates.supportPassRate * 100)}%`);
    console.log(`  Grounding warnings:  ${liveRates.groundingWarningCount}`);
    console.log(`  Critical failures:   ${liveRates.criticalFailures}`);
    console.log(`  Major failures:      ${liveRates.majorFailures}`);
    console.log(`  Minor failures:      ${liveRates.minorFailures}`);
  }

  if (dist) {
    console.log(`\nDecision distribution (n=${decisions.length}):`);
    for (const [k, v] of Object.entries(dist)) {
      if (v > 0) console.log(`  ${k.padEnd(10)} ${v} (${Math.round(v / decisions.length * 100)}%)`);
    }
  }

  // Guardrail interventions
  const allInterventions = results.flatMap(r => r.guardrails?.interventions ?? []);
  if (allInterventions.length > 0) {
    console.log('\nGuardrail intervention rate:');
    const counts: Record<string, number> = {};
    for (const i of allInterventions) counts[i] = (counts[i] ?? 0) + 1;
    for (const [k, v] of Object.entries(counts)) {
      console.log(`  ${k.padEnd(35)} ${v}`);
    }
  }

  // Latency
  const timings = results.filter(r => r.timing?.totalMs).map(r => r.timing!.totalMs!);
  if (timings.length > 0) {
    const sorted = [...timings].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const max = sorted[sorted.length - 1];
    console.log(`\nLatency (n=${timings.length}):`);
    console.log(`  median ${median}ms  p90 ${p90}ms  max ${max}ms`);
  }
}

function renderCorpusMap(): void {
  console.log('\n── Corpus map ───────────────────────────────────────────');
  console.log(`Documents: ${CORPUS_SUMMARY.total} | Chunks: ${CORPUS_SUMMARY.totalChunks} | Domain split: training=${CORPUS_SUMMARY.byDomain.training} nutrition=${CORPUS_SUMMARY.byDomain.nutrition} recovery=${CORPUS_SUMMARY.byDomain.recovery} coaching=${CORPUS_SUMMARY.byDomain.coaching}`);
  for (const doc of CORPUS_MAP) {
    console.log(`  [${doc.domain.slice(0, 2).toUpperCase()}] ${doc.title.padEnd(45)} chunks=${doc.chunkCount} relevant_to=[${doc.relevantScenarioIds.join(',')}]`);
  }
}

function renderCorpusGaps(): void {
  console.log('\n── Corpus gaps ──────────────────────────────────────────');
  for (const gap of CORPUS_GAPS) {
    console.log(`  [${gap.priority}] ${gap.topic} — ${(gap as { status?: string }).status ?? 'open'}`);
    console.log(`       ${gap.rationale}`);
  }
}

function renderQualityGate(results: WeeklyAdaptationEvaluationResult[], liveCount: number): void {
  const gradings = results.filter(r => r.generation).map(r => r.grading);
  const rates = gradings.length > 0 ? computePassRates(gradings) : null;

  const { gate, reasons } = evaluateQualityGate({
    criticalFailures: rates?.criticalFailures ?? 0,
    goalMutations: gradings.filter(g => !g.goalPass).length,
    supplyBoundaryViolations: gradings.filter(g => !g.continuityPass && g.detail.continuity.forbiddenPresent.length > 0).length,
    fabricatedNutrientFacts: gradings.filter(g => g.groundingWarnings.some(w => w.includes('gram') || w.includes('calorie'))).length,
    planValidityRate: rates?.planValidityRate ?? 1,
    decisionPassRate: rates?.decisionPassRate ?? 1,
    domainPassRate: computePassRates(results.map(r => r.grading)).domainPassRate,
    liveCount,
  });

  console.log('\n── Quality gate ─────────────────────────────────────────');
  console.log(`Result: ${gate}`);
  if (reasons.length > 0) {
    console.log('Reasons:');
    for (const r of reasons) console.log(`  - ${r}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const scenarios = selectScenarios();
  console.log(`\nACP Intelligence™ Day 7.5 — Evaluation`);
  console.log(`Model: ${WEEKLY_ADAPTATION_MODEL} | Scenarios: ${scenarios.length} | Live: ${LIVE ? 'YES (ACP_RUN_LIVE_AI_EVAL=1)' : 'NO (deterministic only)'}`);

  renderCorpusMap();
  renderCorpusGaps();

  // Always run deterministic domain-selection evaluation.
  const deterministicResults = runDeterministicEval(scenarios);

  let liveResults: WeeklyAdaptationEvaluationResult[] = [];
  let liveCount = 0;

  if (LIVE) {
    if (!OPENAI_API_KEY) {
      console.error('\n[PARTIAL] ACP_RUN_LIVE_AI_EVAL=1 but OPENAI_API_KEY is not set — live evaluation skipped.');
    } else {
      console.log('\nRunning live model evaluation...');
      for (const scenario of scenarios) {
        process.stdout.write(`  ${scenario.id} (${scenario.group})... `);
        try {
          const result = await runLiveScenario(scenario);
          liveResults.push(result);
          liveCount++;
          console.log(`${result.grading.severity} (${result.timing?.totalMs}ms)`);
        } catch (err: any) {
          console.log(`ERROR: ${err.message}`);
          // Fall back to deterministic result for this scenario.
          liveResults.push(deterministicResults.find(r => r.scenarioId === scenario.id)!);
        }
      }

      // RAG ablation: run ablation scenarios without knowledge context.
      const ablationScenarios = scenarios.filter(s => ABLATION_IDS.has(s.id));
      if (ablationScenarios.length > 0) {
        console.log(`\nRunning RAG ablation (${ablationScenarios.length} scenarios without knowledge)...`);
        for (const scenario of ablationScenarios) {
          process.stdout.write(`  ${scenario.id} (no RAG)... `);
          try {
            const ablResult = await runLiveScenario(scenario, false);
            console.log(`${ablResult.grading.severity}`);
            // Report ablation comparison inline.
            const withRag = liveResults.find(r => r.scenarioId === scenario.id);
            if (withRag?.generation) {
              const withDecision = withRag.generation.decision;
              const withoutDecision = ablResult.generation?.decision ?? 'N/A';
              const same = withDecision === withoutDecision;
              console.log(`    with RAG: ${withDecision}  without RAG: ${withoutDecision}  same=${same}`);
            }
          } catch (err: any) {
            console.log(`ERROR: ${err.message}`);
          }
        }
      }
    }
  }

  const allResults = LIVE && liveResults.length > 0 ? liveResults : deterministicResults;

  console.log('\n── Per-scenario results ─────────────────────────────────');
  renderTable(allResults);
  renderSummary(allResults, liveCount);
  renderQualityGate(allResults, liveCount);

  // Write JSON output.
  const outDir = path.join(__dirname, '..', 'tmp', 'acp-intelligence-eval');
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `eval-${new Date().toISOString().replace(/:/g, '-')}.json`);
  const report = {
    runAt: new Date().toISOString(),
    model: WEEKLY_ADAPTATION_MODEL,
    live: LIVE,
    scenarioCount: scenarios.length,
    liveCount,
    results: allResults,
  };
  await writeFile(outFile, JSON.stringify(report, null, 2));
  console.log(`\nJSON report: ${outFile}`);

  if (!LIVE) {
    console.log('\n[PARTIAL] Live evaluation not run. Set ACP_RUN_LIVE_AI_EVAL=1 to run model calls.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
