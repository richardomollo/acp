// LANA PRO — Phase 4.4: professional-facing copy safety guard.
//
// Ported from apps/mobile/lib/coaching/copy-safety.ts (the consumer-facing
// guard) and EXTENDED with a professional blocklist. Every string the
// Professional Session Brief renders must pass `assertBriefSafe`. It is a
// deterministic pattern check — no LLM, no network.
//
// Blocks: diagnostic / causal health claims, prescriptive dosing, psychological
// / motivational verdicts, shaming, over-certain "Lana knows" language, and
// leaked implementation terminology.

const CONSUMER_BANNED: { label: string; re: RegExp }[] = [
  // causal / outcome-guarantee (from mobile)
  { label: 'causal-workout', re: /because (your|the|these|his|her|their) (workout|workouts|training|exercise|session|sessions|form|posture)/i },
  { label: 'lost-weight-because', re: /\b(lost|gained|losing|gaining) (weight|fat|muscle) because\b/i },
  { label: 'will-improve-faster', re: /\bwill (build|burn|lose|gain|improve)\b.*\b(faster|guaranteed|for sure)\b/i },
  { label: 'guarantee', re: /\bguarantee(s|d)?\b/i },
  { label: 'lana-knows', re: /\b(lana|acp) knows\b/i },
  { label: 'watching', re: /\b(been|i.?ve been) watching\b/i },
  { label: 'know-better', re: /\bknow(s)? (you|him|her|them) better\b/i },
  { label: 'detected-recovery', re: /\b(detected|under[- ]?recovered|overtrain(ed|ing)|over[- ]?train(ed|ing))\b/i },
  { label: 'you-failed', re: /\b(you|he|she|they) failed\b/i },
  { label: 'should-have', re: /\b(you|he|she|they) should have\b/i },
  { label: 'only-completed', re: /\b(only|just) (completed|did|managed)\b/i },
  { label: 'impl-term', re: /\b(embedding|embeddings|vector|\bRAG\b|cosine similarity|similarity score|knowledge chunk|retrieval[- ]augmented|confidence score|model decision|provenance)\b/i },
  { label: 'diagnos', re: /\bdiagnos(e|is|ed|ing)\b/i },
];

const PROFESSIONAL_BANNED: { label: string; re: RegExp }[] = [
  // psychological / motivational verdicts (§8)
  { label: 'losing-motivation', re: /\b(losing|lost|lacks?|lacking|low on|no) (motivation|discipline|commitment|willpower|drive)\b/i },
  { label: 'is-disengaging', re: /\b(is|seems|appears to be|might be) (disengag|checked out|giving up|unmotivated|struggling mentally)/i },
  { label: 'needs-discipline', re: /\bneeds? (more )?(discipline|willpower|to try harder|to commit|motivation)\b/i },
  { label: 'lazy', re: /\b(lazy|undisciplined|unmotivated|not serious)\b/i },
  // metabolic / physiological inference (§8)
  { label: 'metabolism-slowed', re: /\b(metabolism|metabolic rate) (has )?(slow|slowed|dropped|decreased|adapted)/i },
  { label: 'body-adapted', re: /\bbody has (adapted|plateaued|stopped responding)\b/i },
  // pain / injury causation (§8)
  { label: 'pain-caused-by', re: /\b(back|knee|shoulder|hip|joint|neck) (pain|ache|injury|discomfort) (is |was )?(caused by|due to|from|because of)/i },
  { label: 'injury-diagnosis', re: /\b(has|likely has|probably has|is developing) (an? )?(\w+ )?(injury|strain|tear|impingement|tendonitis|sprain)\b/i },
  // prescriptive dosing (§8)
  { label: 'increase-calories-by', re: /\b(increase|decrease|raise|lower|cut|add|reduce) (his|her|their|the|your)? ?(calories|kcal|protein|carbs|carbohydrates|fat|macros|intake) by \d/i },
  { label: 'macro-target', re: /\b(set|use|target|aim for) \d+\s*(g|grams|kcal|calories)\b.*\b(protein|carbs|fat|per day|daily)\b/i },
  { label: 'take-supplement', re: /\b(should|needs to|must) (take|start|use) (a |an )?(supplement|creatine|protein powder|pre[- ]?workout|bcaa)/i },
  // over-certain
  { label: 'definitely-because', re: /\b(definitely|clearly|obviously|certainly) (because|due to|the result of)\b/i },
  { label: 'proves', re: /\b(this|that) (proves|shows conclusively|confirms)\b/i },
];

const ALL = [...CONSUMER_BANNED, ...PROFESSIONAL_BANNED];

/** Labels of every banned pattern found (empty array = safe). */
export function findBannedPhrases(text: string): string[] {
  return ALL.filter((p) => p.re.test(text)).map((p) => p.label);
}

/** Throws if `text` contains any banned phrase. */
export function assertBriefSafe(text: string, context = 'session brief text'): void {
  const hits = findBannedPhrases(text);
  if (hits.length > 0) {
    throw new Error(`Unsafe ${context}: "${text}" matched [${hits.join(', ')}]`);
  }
}

/** Assert a whole brief's rendered strings are safe. */
export function assertBriefBundleSafe(strings: readonly string[]): void {
  for (const s of strings) assertBriefSafe(s);
}
