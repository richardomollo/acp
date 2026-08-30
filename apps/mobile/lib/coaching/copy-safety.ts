// ACP Intelligence™ Day 8 — user-facing copy safety guard (section 50).
//
// A deterministic check that a coaching string does not contain: causal
// health claims, over-certain language, prescriptive support language,
// shaming language, the internal adaptation decision label, or leaked
// AI/RAG implementation terminology. Used by the Day 8 test suites to
// assert that every generated user-facing string is safe.

const BANNED_PATTERNS: { label: string; re: RegExp }[] = [
  // causal / outcome-guarantee claims
  { label: 'causal-workout', re: /because (your|the|these) (workout|workouts|training|exercise|session|sessions)/i },
  { label: 'lost-weight-because', re: /\b(lost|gained|losing|gaining) (weight|fat|muscle) because\b/i },
  { label: 'will-build-faster', re: /\bwill (build|burn|lose|gain|improve)\b.*\b(faster|guaranteed|for sure)\b/i },
  { label: 'guarantee', re: /\bguarantee(s|d)?\b/i },
  // over-certain / creepy
  { label: 'acp-knows', re: /\bACP knows\b/i },
  { label: 'watching-you', re: /\b(been|i.?ve been) watching you\b/i },
  { label: 'know-you-better', re: /\bknow you better\b/i },
  { label: 'detected-underrecovered', re: /\b(detected|under[- ]?recovered|overtrained)\b/i },
  // prescriptive support
  { label: 'you-need-a-trainer', re: /\byou need (a|an) (personal )?trainer\b/i },
  { label: 'must-see', re: /\byou must (see|hire|book)\b/i },
  // shaming
  { label: 'you-failed', re: /\byou failed\b/i },
  { label: 'you-should-have', re: /\byou should have\b/i },
  { label: 'only-completed', re: /\byou only completed\b/i },
  // internal decision label
  { label: 'decision-label', re: /\b(decision:\s*)?(rebalance)\b/i },
  { label: 'decision-colon', re: /\bdecision:\s*(keep|progress|simplify|adjust)\b/i },
  { label: 'adaptation-decision', re: /\badaptation decision\b/i },
  // AI/RAG implementation terminology
  { label: 'impl-term', re: /\b(embedding|embeddings|vector|\bRAG\b|cosine similarity|similarity score|knowledge chunk|retrieval[- ]augmented|confidence score|model decision)\b/i },
  // medical inference
  { label: 'muscles-need-hours', re: /\bmuscles need \d+\s*hours\b/i },
  { label: 'diagnos', re: /\bdiagnos(e|is|ed)\b/i },
  // Day 9 — execution feedback must never become judgement or a body/health verdict (section 72)
  { label: 'lazy-unmotivated', re: /\byou(?: are|'re| ?re) (lazy|unmotivated|undisciplined)\b/i },
  { label: 'lack-motivation', re: /\byou lack (motivation|commitment|discipline)\b/i },
  { label: 'failed-again', re: /\byou failed again\b/i },
  { label: 'fitness-is-poor', re: /\byour fitness is poor\b/i },
  { label: 'overtrained-injured', re: /\byou(?: are|'re| ?re) (overtrained|injured)\b/i },
  { label: 'need-more-recovery', re: /\byou need more recovery\b/i },
  { label: 'detected-fatigue', re: /\bdetected fatigue\b/i },
  { label: 'skipped-n-times', re: /\byou skipped .*\b\d+\s*times\b/i },
];

/** Returns the labels of every banned pattern found in `text` (empty = safe). */
export function findBannedPhrases(text: string): string[] {
  return BANNED_PATTERNS.filter(p => p.re.test(text)).map(p => p.label);
}

/** Throws if `text` contains any banned phrase. */
export function assertUserSafeCoachingText(text: string, context = 'coaching text'): void {
  const hits = findBannedPhrases(text);
  if (hits.length > 0) {
    throw new Error(`Unsafe ${context}: "${text}" matched [${hits.join(', ')}]`);
  }
}
