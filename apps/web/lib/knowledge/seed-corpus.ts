// ACP Intelligence™ Day 7.1 / Day 7.5C — the seed knowledge corpus, as
// data only. Extracted from seed-knowledge.ts so it can be imported by
// tests (that script self-executes on import). NOT ACP's real, full
// knowledge base — every document is source_type='internal' (never a
// fabricated WHO/ACSM/NHS reference, Day 7.1 section 31).
import type { KnowledgeDocumentInput } from './types.ts';

export const SEED_KNOWLEDGE_DOCS: KnowledgeDocumentInput[] = [
  {
    domain: 'training', title: 'Beginner Strength Consistency', sourceType: 'internal',
    metadata: { goals: ['build_muscle', 'general_fitness'], experience_levels: ['beginner'], activities: ['gym'], topics: ['consistency', 'frequency'] },
    sections: [
      { heading: 'Why consistency matters more than intensity early on', content: 'For someone new to strength training, showing up for two or three sessions a week on a predictable schedule builds more long-term progress than occasional maximal-effort workouts. Consistency lets the body adapt gradually to a new stimulus and lets technique improve safely before load increases.' },
      { heading: 'A sustainable starting frequency', content: 'Training each major movement pattern twice per week is a reasonable starting frequency for a beginner. This is often enough stimulus for adaptation while still leaving adequate recovery time between sessions, and it is easier to sustain around work and other commitments than a daily routine.' },
    ],
  },
  {
    domain: 'training', title: 'Progressive Overload', sourceType: 'internal',
    metadata: { goals: ['build_muscle'], experience_levels: ['beginner', 'intermediate'], activities: ['gym'], topics: ['progression', 'progressive_overload'] },
    sections: [
      { heading: 'The core principle', content: 'Progressive overload means gradually increasing the demand placed on the body over time, most commonly through more weight, more reps, or more sets across successive sessions. Without this gradual increase, the body has no reason to keep adapting once it has adjusted to the current level of stimulus.' },
      { heading: 'Applying it safely', content: 'A beginner strength lifter can usually add a small amount of weight or an extra rep every one to two weeks on a given exercise, provided technique stays solid. Progressing too quickly, before movement quality is reliable, raises injury risk without a proportional benefit to strength gains.' },
    ],
  },
  {
    domain: 'training', title: 'Recovery Between Demanding Strength Sessions', sourceType: 'internal',
    metadata: { goals: ['build_muscle'], experience_levels: ['beginner', 'intermediate'], activities: ['gym'], topics: ['recovery', 'session_spacing'] },
    sections: [
      { heading: 'Spacing sessions that stress the same muscles', content: 'When two sessions train the same major muscle group with real intensity, leaving at least one full day between them gives that tissue time to recover before it is loaded hard again. Training the same muscle group hard on consecutive days without that gap tends to blunt recovery and can slow progress rather than speed it up.' },
    ],
  },
  // ── Day 7.5C Correction D — targeted training-corpus expansion ────────────
  // Added to close the goal/experience coverage gaps the Day 7.5B baseline
  // exposed (training-domain queries: ~55% returned nothing). Every document
  // is source_type='internal' ACP coaching principle — no fabricated
  // external citations (Day 7.1 section 31).
  {
    domain: 'training', title: 'Intermediate Strength Progression', sourceType: 'internal',
    metadata: { goals: ['build_muscle', 'general_fitness'], experience_levels: ['intermediate'], activities: ['gym'], topics: ['progression', 'strength'] },
    sections: [
      { heading: 'Progression does not have to mean more sessions', content: 'An intermediate lifter who is completing their current plan does not automatically need extra training days. Progression can come from a small increase in load, an added repetition, better movement quality, or a slightly harder variation of an exercise already in the plan, all while keeping the same weekly session count.' },
      { heading: 'Let recovery set the pace', content: 'How quickly load or volume can rise depends on how well the current sessions are being recovered from. When sessions are already close together in the week, improving their spacing is usually more useful than adding more work on top.' },
    ],
  },
  {
    domain: 'training', title: 'Experienced Strength Progression', sourceType: 'internal',
    metadata: { goals: ['build_muscle', 'general_fitness'], experience_levels: ['advanced', 'experienced'], activities: ['gym'], topics: ['progression', 'strength'] },
    sections: [
      { heading: 'More frequency is not the default lever', content: 'An experienced lifter making steady progress rarely needs more training days added automatically. At this stage, progression more often comes from adjusting load, intensity, exercise selection, or the quality and focus of each set than from increasing how often they train.' },
      { heading: 'Recovery context still applies', content: 'Longer training experience does not remove the need for adequate recovery between demanding sessions. A progression decision should still account for how the current week is spaced and how well recent sessions have been recovered from.' },
    ],
  },
  {
    domain: 'training', title: 'General Fitness Progression', sourceType: 'internal',
    metadata: { goals: ['general_fitness', 'maintain_weight'], topics: ['progression', 'consistency'] },
    sections: [
      { heading: 'Consistency is the main driver', content: 'For a general fitness goal, showing up regularly for a manageable routine matters more than steadily increasing the training load. A plan that is completed most weeks will support fitness better than a harder plan that is often missed.' },
      { heading: 'Progress in small, balanced steps', content: 'When progression is warranted, small balanced adjustments across the activities already in the plan are preferable to continuously adding training volume. There is no need to keep making a general fitness routine harder for it to remain effective.' },
    ],
  },
  {
    domain: 'training', title: 'Exercise Planning for Weight-Loss Goals', sourceType: 'internal',
    metadata: { goals: ['lose_weight'], topics: ['progression', 'consistency'] },
    sections: [
      { heading: 'Exercise supports the wider goal', content: 'For a weight-loss goal, training works alongside nutrition and everyday activity rather than being the sole lever. A routine that fits the week and is completed consistently contributes more than a larger routine that is hard to sustain.' },
      { heading: 'A slow outcome is not a reason to add volume', content: 'A flat or gradual weight trend does not by itself justify adding more exercise. Keeping the plan executable and consistent is usually the more productive response, and changes in weight should be described as observations, not as results caused by any one session.' },
    ],
  },
  {
    domain: 'training', title: 'Running and Cardio Progression', sourceType: 'internal',
    metadata: { goals: ['improve_running', 'general_fitness', 'lose_weight'], activities: ['running', 'walking', 'cycling'], topics: ['progression', 'cardio', 'recovery'] },
    sections: [
      { heading: 'Increase gradually, one variable at a time', content: 'Cardio workload is best increased in small steps — a modest rise in total time or distance across a week, not both at once. Most sessions should stay comfortable, with only a small portion of harder effort.' },
      { heading: 'Consistency and recovery over big jumps', content: 'Regular, repeatable sessions build endurance more reliably than occasional hard efforts. Abrupt increases in weekly volume raise the risk of a setback without a proportional benefit, so a steady routine is usually the better choice.' },
    ],
  },
  {
    domain: 'training', title: 'Training for Stress Reduction and General Wellbeing', sourceType: 'internal',
    metadata: { goals: ['reduce_stress'], activities: ['yoga', 'walking'], topics: ['consistency', 'wellbeing', 'progression'] },
    sections: [
      { heading: 'Regular, sustainable movement is the goal', content: 'When the goal is stress reduction or general wellbeing, the priority is a routine of enjoyable, sustainable activity that reliably happens. Keeping that routine going matters more than performance progression.' },
      { heading: 'Progression need not mean more intensity', content: 'For a wellbeing goal, progression can simply mean maintaining consistency over time. Increasing intensity or volume is not required for the routine to keep delivering its benefit, and adding difficulty can make it harder to sustain.' },
    ],
  },
  {
    domain: 'training', title: 'Managing Training During Inconsistent Adherence', sourceType: 'internal',
    metadata: { topics: ['adherence', 'executability', 'consistency'] },
    sections: [
      { heading: 'Executability comes before more workload', content: 'When adherence has been inconsistent, improving how executable the plan is generally comes before increasing its workload. A smaller plan that is completed most weeks builds more progress than a larger plan that is repeatedly missed.' },
      { heading: 'Adjust structure without changing the goal', content: 'Shortening sessions, reducing the number of activity types, or redistributing sessions across the week can restore consistency without changing what the user is training for. A positive outcome trend during a low-adherence week is not a reason to add volume.' },
    ],
  },
  {
    domain: 'nutrition', title: 'Balanced Meal Composition', sourceType: 'internal',
    metadata: { topics: ['meal_composition'], locale: ['global'] },
    sections: [
      { heading: 'What a balanced meal generally includes', content: 'A balanced meal generally combines a source of protein, a source of carbohydrate, some fat, and vegetables or fruit for fibre and micronutrients. Building meals around this combination, rather than any single food group, tends to support steady energy and satisfaction between meals.' },
      { heading: 'Why variety matters', content: 'Rotating between different protein sources, grains, and vegetables across the week helps cover a broader range of vitamins and minerals than repeating the same few meals. Variety is a simple, practical way to reduce the chance of a nutrient gap without needing to track individual micronutrients.' },
    ],
  },
  {
    domain: 'nutrition', title: 'Protein As Part of Goal-Supportive Nutrition', sourceType: 'internal',
    metadata: { goals: ['build_muscle', 'lose_weight'], topics: ['protein'] },
    sections: [
      { heading: 'Why protein matters for these goals', content: 'Adequate protein intake supports muscle repair and growth after strength training, and it also tends to increase satiety, which can make it easier to manage overall intake during a weight-loss phase. This makes protein a relevant nutritional lever for both a muscle-building goal and a fat-loss goal, even though the goals differ.' },
    ],
  },
  {
    domain: 'recovery', title: 'Recovery and Rest Principle', sourceType: 'internal',
    metadata: { activities: ['strength'], topics: ['rest', 'recovery'] },
    sections: [
      { heading: 'Rest as part of the training process', content: 'Rest is not time away from progress — it is the part of the training process where the body actually adapts to the stimulus training provided. Sleep quality and at least one or two full rest days a week both meaningfully affect how well that adaptation happens, alongside the training itself.' },
      { heading: 'Signs recovery may be insufficient', content: 'Persistent fatigue that does not improve with a normal night of sleep, a string of workouts that all feel harder than they should, and a noticeable dip in motivation to train can all be signs that recovery has not kept pace with training demands, and that an easier week may be useful.' },
    ],
  },
  {
    // ── Day 7.5C Correction C — actionable recovery-spacing principle ──────
    // The baseline H1 failure: recovery guidance was retrieved successfully
    // but the model still read "every session completed" as license to
    // progress. The existing recovery documents describe rest in general
    // terms; none states that completion is not the same as readiness.
    domain: 'recovery', title: 'Recovery Spacing Before Progression', sourceType: 'internal',
    metadata: { activities: ['strength'], topics: ['recovery', 'session_spacing', 'progression'] },
    sections: [
      { heading: 'Completing sessions is not the same as being ready for more', content: 'Finishing every planned session shows the plan was followed; it does not on its own show that the body is ready for additional work. Successful completion and readiness to add workload are separate questions, and a progression decision should treat them separately.' },
      { heading: 'Redistribute before adding', content: 'When demanding sessions sit close together in the week, spreading them across more rest days can make the plan more sustainable without increasing total volume. A decision to progress is better supported once recovery is already well distributed than while sessions are still tightly packed.' },
    ],
  },
  {
    domain: 'coaching', title: 'Reducing Friction When Time Is A Barrier', sourceType: 'internal',
    metadata: { barriers: ['time'], topics: ['consistency', 'time_management'] },
    sections: [
      { heading: 'Shrinking the session, not skipping it', content: 'When time is the main barrier to training, a shorter session that still happens is more valuable than an ideal-length session that gets skipped. A focused twenty-minute session most days keeps the habit and the physical stimulus alive far better than waiting for a spare hour that rarely appears.' },
    ],
  },
  {
    domain: 'coaching', title: 'Confidence Through Achievable Sessions', sourceType: 'internal',
    metadata: { barriers: ['confidence'], topics: ['confidence'] },
    sections: [
      { heading: 'Starting at a level that guarantees an early win', content: 'For someone who feels unsure about starting to exercise, a first session that is comfortably achievable — even if it feels too easy — builds the confidence needed to keep going. An early session that feels overwhelming or leaves someone very sore is far more likely to end the habit before it starts than one that feels manageable.' },
    ],
  },
  {
    domain: 'coaching', title: 'Accountability and Consistency', sourceType: 'internal',
    metadata: { barriers: ['accountability'], topics: ['consistency', 'accountability'] },
    sections: [
      { heading: 'Why an external check-in helps', content: 'Someone who struggles with accountability often benefits more from a simple, regular check-in on whether a session happened than from a more sophisticated training plan. Knowing that a session will be checked, even informally, changes the likelihood that it actually happens.' },
    ],
  },
];
