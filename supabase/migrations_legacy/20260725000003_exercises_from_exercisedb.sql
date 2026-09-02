-- Replace all 42 curated ACP-authored exercises with matching ExerciseDB
-- content (same row `id`s, so existing workout_exercises links, weight logs,
-- and history are untouched — only the exercise's own fields change).
--
-- Every exercise now has a real ExerciseDB `external_id`. A handful had no
-- clean ExerciseDB equivalent (Plank, Face Pull, Bird Dog, and the four
-- yoga/mobility poses used by the Mobility & Flexibility workout) — those
-- were mapped to the closest available ExerciseDB entry per an explicit
-- decision to have every exercise sourced from ExerciseDB, even where the
-- match changes the exercise's character (e.g. Cobra Pose -> an advanced
-- push-up variant, since ExerciseDB has no yoga content).

UPDATE public.exercises SET
  name = 'Drop Push Up',
  body_part = 'chest',
  target_muscle = 'pectorals',
  equipment = 'body weight',
  difficulty = 'beginner',
  instructions = ARRAY['Start in a high plank position with your hands slightly wider than shoulder-width apart.', 'Lower your chest towards the ground, keeping your elbows close to your body.', 'Once your chest is just above the ground, quickly drop your knees to the ground.', 'Push yourself back up to the starting position by extending your arms.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/pectorals/drop-push-up.gif',
  external_id = '1275',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000001';

UPDATE public.exercises SET
  name = 'Bodyweight Squat',
  body_part = 'upper legs',
  target_muscle = 'quads',
  equipment = 'body weight',
  difficulty = 'beginner',
  instructions = ARRAY['Stand with your feet shoulder-width apart.', 'Lower your body by bending your knees and pushing your hips back as if sitting on a chair.', 'Keep your chest up and your back straight.', 'Lower yourself until your thighs are parallel to the ground.', 'Push through your heels to return to the starting position.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/quads/quads.gif',
  external_id = '3533',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000002';

UPDATE public.exercises SET
  name = 'Forward Lunge',
  body_part = 'upper legs',
  target_muscle = 'glutes',
  equipment = 'body weight',
  difficulty = 'beginner',
  instructions = ARRAY['Stand with your feet hip-width apart and hands on your hips.', 'Take a big step forward with your right foot, lowering your body into a lunge position.', 'Bend your right knee to about 90 degrees, keeping your knee aligned with your ankle.', 'Push off with your right foot and return to the starting position.', 'Repeat with your left leg, alternating sides for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/forward-lunge.gif',
  external_id = '3470',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000003';

UPDATE public.exercises SET
  name = 'Kneeling Plank Tap Shoulder',
  body_part = 'waist',
  target_muscle = 'abs',
  equipment = 'body weight',
  difficulty = 'beginner',
  instructions = ARRAY['Start in a kneeling position with your hands on the ground, shoulder-width apart.', 'Extend your legs behind you, resting on your toes, and lift your body into a plank position.', 'Keeping your core engaged and your hips stable, lift one hand off the ground and tap the opposite shoulder.', 'Return the hand to the ground and repeat with the other hand.', 'Continue alternating sides for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/abs/kneeling-plank-tap-shoulder.gif',
  external_id = '3239',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000004';

UPDATE public.exercises SET
  name = 'Low Glute Bridge On Floor',
  body_part = 'upper legs',
  target_muscle = 'glutes',
  equipment = 'body weight',
  difficulty = 'beginner',
  instructions = ARRAY['Lie flat on your back with your knees bent and feet flat on the ground.', 'Place your arms by your sides, palms facing down.', 'Engage your glutes and core, then lift your hips off the ground until your body forms a straight line from your knees to your shoulders.', 'Pause for a moment at the top, squeezing your glutes.', 'Slowly lower your hips back down to the starting position.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/low-glute-bridge-on-floor.gif',
  external_id = '3013',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000005';

UPDATE public.exercises SET
  name = 'Mountain Climber',
  body_part = 'cardio',
  target_muscle = 'cardiovascular system',
  equipment = 'body weight',
  difficulty = 'beginner',
  instructions = ARRAY['Start in a high plank position with your hands directly under your shoulders and your body in a straight line.', 'Engage your core and bring your right knee towards your chest, then quickly switch and bring your left knee towards your chest.', 'Continue alternating legs in a running motion, keeping your hips low and your core engaged.', 'Maintain a steady pace and breathe evenly throughout the exercise.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/cardio/mountain-climber.gif',
  external_id = '0630',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000006';

UPDATE public.exercises SET
  name = 'Star Jump',
  body_part = 'cardio',
  target_muscle = 'cardiovascular system',
  equipment = 'body weight',
  difficulty = 'beginner',
  instructions = ARRAY['Stand with your feet shoulder-width apart and your arms by your sides.', 'Bend your knees slightly and jump up explosively.', 'As you jump, spread your legs and extend your arms out to the sides, forming a star shape with your body.', 'Land softly on the balls of your feet with your knees slightly bent.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/cardio/star-jump.gif',
  external_id = '3223',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000007';

UPDATE public.exercises SET
  name = 'Walking High Knees Lunge',
  body_part = 'cardio',
  target_muscle = 'cardiovascular system',
  equipment = 'body weight',
  difficulty = 'beginner',
  instructions = ARRAY['Stand with your feet hip-width apart.', 'Lift your right knee up towards your chest as high as you can while balancing on your left leg.', 'Step forward with your right foot and lower your body into a lunge position, bending both knees to a 90-degree angle.', 'Push off with your right foot and bring your left knee up towards your chest.', 'Step forward with your left foot and lower your body into a lunge position.', 'Continue alternating legs and lunging forward, keeping your core engaged and maintaining a steady pace.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/cardio/walking-high-knees-lunge.gif',
  external_id = '3655',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000008';

UPDATE public.exercises SET
  name = 'Burpee',
  body_part = 'cardio',
  target_muscle = 'cardiovascular system',
  equipment = 'body weight',
  difficulty = 'intermediate',
  instructions = ARRAY['Start in a standing position with your feet shoulder-width apart.', 'Lower your body into a squat position by bending your knees and placing your hands on the floor in front of you.', 'Kick your feet back into a push-up position.', 'Perform a push-up, keeping your body in a straight line.', 'Jump your feet back into the squat position.', 'Jump up explosively, reaching your arms overhead.', 'Land softly and immediately lower back into a squat position to begin the next repetition.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/cardio/burpee.gif',
  external_id = '1160',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000009';

UPDATE public.exercises SET
  name = 'Jump Squat',
  body_part = 'upper legs',
  target_muscle = 'glutes',
  equipment = 'body weight',
  difficulty = 'intermediate',
  instructions = ARRAY['Stand with your feet shoulder-width apart.', 'Lower your body into a squat position by bending your knees and pushing your hips back.', 'Jump explosively off the ground, extending your hips, knees, and ankles.', 'While in mid-air, quickly bring your arms forward for balance.', 'Land softly on the balls of your feet and immediately go into the next repetition.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/jump-squat.gif',
  external_id = '0514',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000010';

UPDATE public.exercises SET
  name = 'Skater Hops',
  body_part = 'cardio',
  target_muscle = 'cardiovascular system',
  equipment = 'body weight',
  difficulty = 'intermediate',
  instructions = ARRAY['Stand with your feet shoulder-width apart.', 'Bend your knees slightly and jump to the right, landing on your right foot.', 'As you land, swing your left leg behind your right leg and tap the ground with your left toes.', 'Immediately jump to the left, landing on your left foot.', 'As you land, swing your right leg behind your left leg and tap the ground with your right toes.', 'Continue alternating sides, jumping and tapping the ground with each leg.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/cardio/skater-hops.gif',
  external_id = '3361',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000011';

UPDATE public.exercises SET
  name = 'Barbell Bench Press',
  body_part = 'chest',
  target_muscle = 'pectorals',
  equipment = 'barbell',
  difficulty = 'intermediate',
  instructions = ARRAY['Lie flat on a bench with your feet flat on the ground and your back pressed against the bench.', 'Grasp the barbell with an overhand grip slightly wider than shoulder-width apart.', 'Lift the barbell off the rack and hold it directly above your chest with your arms fully extended.', 'Lower the barbell slowly towards your chest, keeping your elbows tucked in.', 'Pause for a moment when the barbell touches your chest.', 'Push the barbell back up to the starting position by extending your arms.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/pectorals/barbell-bench-press.gif',
  external_id = '0025',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000012';

UPDATE public.exercises SET
  name = 'Dumbbell Incline Bench Press',
  body_part = 'chest',
  target_muscle = 'pectorals',
  equipment = 'dumbbell',
  difficulty = 'intermediate',
  instructions = ARRAY['Set up an incline bench at a 45-degree angle.', 'Sit on the bench with your feet flat on the ground and your back pressed firmly against the bench.', 'Hold a dumbbell in each hand, palms facing forward, and lift them to shoulder height.', 'Slowly lower the dumbbells to the sides of your chest, keeping your elbows at a 90-degree angle.', 'Push the dumbbells back up to the starting position, fully extending your arms.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/pectorals/dumbbell-incline-bench-press.gif',
  external_id = '0314',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000013';

UPDATE public.exercises SET
  name = 'Dumbbell Seated Shoulder Press',
  body_part = 'shoulders',
  target_muscle = 'delts',
  equipment = 'dumbbell',
  difficulty = 'beginner',
  instructions = ARRAY['Sit on a bench with a dumbbell in each hand, resting on your thighs.', 'Raise the dumbbells to shoulder height, palms facing forward.', 'Press the dumbbells upward until your arms are fully extended overhead.', 'Pause for a moment at the top, then slowly lower the dumbbells back to shoulder height.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/delts/dumbbell-seated-shoulder-press.gif',
  external_id = '0405',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000014';

UPDATE public.exercises SET
  name = 'Cable One Arm Decline Chest Fly',
  body_part = 'chest',
  target_muscle = 'pectorals',
  equipment = 'cable',
  difficulty = 'intermediate',
  instructions = ARRAY['Attach a D-handle to a low pulley cable machine and set the bench to a decline angle.', 'Lie down on the bench with your head towards the machine and grab the handle with your right hand.', 'Extend your arm straight up above your chest, keeping a slight bend in your elbow.', 'With a controlled motion, lower your arm out to the side until your hand is in line with your shoulder.', 'Pause for a moment, then reverse the motion and bring your arm back to the starting position.', 'Repeat for the desired number of repetitions, then switch to your left arm and repeat the exercise.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/pectorals/cable-one-arm-decline-chest-fly.gif',
  external_id = '1262',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000015';

UPDATE public.exercises SET
  name = 'Dumbbell Lateral Raise',
  body_part = 'shoulders',
  target_muscle = 'delts',
  equipment = 'dumbbell',
  difficulty = 'beginner',
  instructions = ARRAY['Stand with your feet shoulder-width apart and hold a dumbbell in each hand, palms facing your body.', 'Keep your back straight and engage your core.', 'Raise your arms out to the sides until they are parallel to the floor, keeping a slight bend in your elbows.', 'Pause for a moment at the top, then slowly lower your arms back down to the starting position.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/delts/dumbbell-lateral-raise.gif',
  external_id = '0334',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000016';

UPDATE public.exercises SET
  name = 'Cable Triceps Pushdown (V-Bar)',
  body_part = 'upper arms',
  target_muscle = 'triceps',
  equipment = 'cable',
  difficulty = 'beginner',
  instructions = ARRAY['Attach a v-bar attachment to the cable machine at the highest setting.', 'Stand facing the cable machine with your feet shoulder-width apart.', 'Grasp the v-bar with an overhand grip, palms facing down, and your hands shoulder-width apart.', 'Keep your elbows close to your sides and your upper arms stationary throughout the exercise.', 'Engage your triceps and exhale as you push the v-bar down until your arms are fully extended.', 'Pause for a moment at the bottom of the movement, squeezing your triceps.', 'Inhale as you slowly return the v-bar to the starting position, maintaining control.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/triceps/cable-triceps-pushdown.gif',
  external_id = '0241',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000017';

UPDATE public.exercises SET
  name = 'Barbell Standing Overhead Triceps Extension',
  body_part = 'upper arms',
  target_muscle = 'triceps',
  equipment = 'barbell',
  difficulty = 'intermediate',
  instructions = ARRAY['Stand with your feet shoulder-width apart and hold a barbell with an overhand grip.', 'Raise the barbell overhead, fully extending your arms.', 'Keeping your upper arms close to your head, slowly lower the barbell behind your head by bending your elbows.', 'Pause for a moment, then raise the barbell back to the starting position by extending your arms.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/triceps/barbell-standing-overhead-triceps-extension.gif',
  external_id = '0109',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000018';

UPDATE public.exercises SET
  name = 'Pull Up (Neutral Grip)',
  body_part = 'back',
  target_muscle = 'lats',
  equipment = 'body weight',
  difficulty = 'intermediate',
  instructions = ARRAY['Hang from a pull-up bar with a neutral grip (palms facing each other) and your arms fully extended.', 'Engage your core and squeeze your shoulder blades together.', 'Pull your body up towards the bar by bending your elbows and driving your elbows down towards your hips.', 'Continue pulling until your chin is above the bar.', 'Pause for a moment at the top, then slowly lower your body back down to the starting position with control.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/lats/pull-up.gif',
  external_id = '0651',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000019';

UPDATE public.exercises SET
  name = 'Barbell Bent Over Row',
  body_part = 'back',
  target_muscle = 'upper back',
  equipment = 'barbell',
  difficulty = 'intermediate',
  instructions = ARRAY['Stand with your feet shoulder-width apart and knees slightly bent.', 'Bend forward at the hips while keeping your back straight and chest up.', 'Grasp the barbell with an overhand grip, hands slightly wider than shoulder-width apart.', 'Pull the barbell towards your lower chest by retracting your shoulder blades and squeezing your back muscles.', 'Pause for a moment at the top, then slowly lower the barbell back to the starting position.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/upper-back/barbell-bent-over-row.gif',
  external_id = '0027',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000020';

UPDATE public.exercises SET
  name = 'Cable Seated Row',
  body_part = 'back',
  target_muscle = 'upper back',
  equipment = 'cable',
  difficulty = 'beginner',
  instructions = ARRAY['Sit on the cable row machine with your feet flat on the footrests and your knees slightly bent.', 'Grasp the handles with an overhand grip, keeping your back straight and your shoulders relaxed.', 'Pull the handles towards your body, squeezing your shoulder blades together.', 'Pause for a moment at the peak of the movement, then slowly release the handles back to the starting position.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/upper-back/cable-seated-row.gif',
  external_id = '0861',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000021';

UPDATE public.exercises SET
  name = 'Cable Lat Pulldown Full Range Of Motion',
  body_part = 'back',
  target_muscle = 'lats',
  equipment = 'cable',
  difficulty = 'beginner',
  instructions = ARRAY['Sit on the lat pulldown machine with your knees positioned under the pads.', 'Grasp the cable bar with an overhand grip, slightly wider than shoulder-width apart.', 'Lean back slightly and keep your chest up, maintaining a slight arch in your lower back.', 'Pull the bar down towards your upper chest, squeezing your shoulder blades together.', 'Pause for a moment at the bottom of the movement, then slowly release the bar back to the starting position.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/lats/cable-lat-pulldown-full-range-of-motion.gif',
  external_id = '2330',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000022';

UPDATE public.exercises SET
  name = 'Cable Rear Delt Row (Stirrups)',
  body_part = 'shoulders',
  target_muscle = 'delts',
  equipment = 'cable',
  difficulty = 'intermediate',
  instructions = ARRAY['Attach a stirrup handle to a low cable pulley and stand facing the machine.', 'Grasp the handle with your left hand and take a step back with your right foot, positioning your body at a slight angle.', 'Bend your knees slightly and hinge forward at the hips, keeping your back straight and your core engaged.', 'With your left arm extended and your palm facing down, pull the handle towards your chest by retracting your shoulder blade.', 'Pause for a moment at the top of the movement, squeezing your shoulder blade.', 'Slowly release the handle back to the starting position and repeat for the desired number of repetitions.', 'Switch sides and repeat the exercise with your right arm.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/delts/cable-rear-delt-row.gif',
  external_id = '0202',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000023';

UPDATE public.exercises SET
  name = 'Dumbbell Biceps Curl',
  body_part = 'upper arms',
  target_muscle = 'biceps',
  equipment = 'dumbbell',
  difficulty = 'beginner',
  instructions = ARRAY['Stand up straight with a dumbbell in each hand, palms facing forward and arms fully extended.', 'Keeping your upper arms stationary, exhale and curl the weights while contracting your biceps.', 'Continue to raise the weights until your biceps are fully contracted and the dumbbells are at shoulder level.', 'Hold the contracted position for a brief pause as you squeeze your biceps.', 'Inhale and slowly begin to lower the dumbbells back to the starting position.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/biceps/dumbbell-biceps-curl.gif',
  external_id = '0294',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000024';

UPDATE public.exercises SET
  name = 'Dumbbell Hammer Curl',
  body_part = 'upper arms',
  target_muscle = 'biceps',
  equipment = 'dumbbell',
  difficulty = 'beginner',
  instructions = ARRAY['Stand up straight with a dumbbell in each hand, palms facing your torso.', 'Keep your elbows close to your torso and rotate the palms of your hands until they are facing forward.', 'This will be your starting position.', 'Now, keeping the upper arms stationary, exhale and curl the weights while contracting your biceps.', 'Continue to raise the weights until your biceps are fully contracted and the dumbbells are at shoulder level.', 'Hold the contracted position for a brief pause as you squeeze your biceps.', 'Then, inhale and slowly begin to lower the dumbbells back to the starting position.', 'Repeat for the recommended amount of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/biceps/dumbbell-hammer-curl.gif',
  external_id = '0313',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000025';

UPDATE public.exercises SET
  name = 'Barbell Front Squat',
  body_part = 'upper legs',
  target_muscle = 'glutes',
  equipment = 'barbell',
  difficulty = 'intermediate',
  instructions = ARRAY['Start by standing with your feet shoulder-width apart, toes slightly turned out.', 'Hold the barbell in front of your shoulders, resting it on your collarbone and shoulders.', 'Engage your core and keep your chest up as you lower your body down into a squat position, pushing your hips back and bending your knees.', 'Lower until your thighs are parallel to the ground, or as low as you can comfortably go.', 'Pause for a moment at the bottom, then push through your heels to return to the starting position.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/barbell-front-squat.gif',
  external_id = '0042',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000026';

UPDATE public.exercises SET
  name = 'Barbell Romanian Deadlift',
  body_part = 'upper legs',
  target_muscle = 'glutes',
  equipment = 'barbell',
  difficulty = 'intermediate',
  instructions = ARRAY['Stand with your feet shoulder-width apart and your toes pointing forward.', 'Hold the barbell with an overhand grip, hands slightly wider than shoulder-width apart.', 'Bend at the hips, keeping your back straight and your knees slightly bent.', 'Lower the barbell towards the ground, keeping it close to your body.', 'Feel the stretch in your hamstrings as you lower the barbell.', 'Once you feel a stretch in your hamstrings, push your hips forward and stand up straight.', 'Squeeze your glutes at the top of the movement.', 'Lower the barbell back down to the starting position and repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/barbell-romanian-deadlift.gif',
  external_id = '0085',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000027';

UPDATE public.exercises SET
  name = 'Sled 45° Leg Press',
  body_part = 'upper legs',
  target_muscle = 'glutes',
  equipment = 'sled machine',
  difficulty = 'beginner',
  instructions = ARRAY['Adjust the seat and footplate of the sled machine to a comfortable position.', 'Sit on the sled machine with your back against the backrest and your feet shoulder-width apart on the footplate.', 'Grip the handles on the sides of the seat for stability.', 'Push the footplate away from your body by extending your legs, keeping your heels on the footplate.', 'Continue pushing until your legs are almost fully extended, but without locking your knees.', 'Pause for a moment at the top of the movement, then slowly lower the footplate back towards your body by bending your knees.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/sled-45-leg-press.gif',
  external_id = '0739',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000028';

UPDATE public.exercises SET
  name = 'Walking Lunge',
  body_part = 'upper legs',
  target_muscle = 'glutes',
  equipment = 'body weight',
  difficulty = 'intermediate',
  instructions = ARRAY['Stand with your feet shoulder-width apart.', 'Take a step forward with your right leg, lowering your body into a lunge position.', 'Keep your torso upright and your front knee aligned with your ankle.', 'Push off with your right foot and bring your left foot forward, stepping into a lunge position with your left leg.', 'Continue alternating legs and walking forward, maintaining a controlled and steady pace.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/walking-lunge.gif',
  external_id = '1460',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000029';

UPDATE public.exercises SET
  name = 'Lever Seated Leg Curl',
  body_part = 'upper legs',
  target_muscle = 'hamstrings',
  equipment = 'leverage machine',
  difficulty = 'beginner',
  instructions = ARRAY['Adjust the machine to fit your body and sit on it with your back against the backrest.', 'Place your lower legs under the padded lever, just above your ankles.', 'Grasp the handles on the sides of the machine for support.', 'Keeping your upper legs stationary, exhale and curl your legs up as far as possible.', 'Hold the contracted position for a brief pause as you squeeze your hamstrings.', 'Inhale and slowly lower the lever back to the starting position.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/hamstrings/lever-seated-leg-curl.gif',
  external_id = '0599',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000030';

UPDATE public.exercises SET
  name = 'Resistance Band Hip Thrusts On Knees',
  body_part = 'upper legs',
  target_muscle = 'glutes',
  equipment = 'resistance band',
  difficulty = 'beginner',
  instructions = ARRAY['Start by kneeling on the ground with your knees hip-width apart and your feet flexed.', 'Wrap the resistance band around your thighs, just above your knees.', 'Place your hands on your hips or extend them out in front of you for balance.', 'Engage your glutes and core muscles.', 'Push your hips forward and squeeze your glutes as you lift your knees off the ground, extending your hips until your thighs are parallel to the ground.', 'Hold the position for a moment, then slowly lower your knees back down to the starting position.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/resistance-band-hip-thrusts-on-knees.gif',
  external_id = '3236',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000031';

UPDATE public.exercises SET
  name = 'Donkey Calf Raise',
  body_part = 'lower legs',
  target_muscle = 'calves',
  equipment = 'body weight',
  difficulty = 'beginner',
  instructions = ARRAY['Stand with your toes on an elevated surface, such as a step or block.', 'Place your hands on a stable support, such as a wall or railing, for balance.', 'Raise your heels as high as possible, lifting your body weight onto the balls of your feet.', 'Pause for a moment at the top, then slowly lower your heels back down to the starting position.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/calves/donkey-calf-raise.gif',
  external_id = '0284',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000032';

UPDATE public.exercises SET
  name = 'Barbell Deadlift',
  body_part = 'upper legs',
  target_muscle = 'glutes',
  equipment = 'barbell',
  difficulty = 'intermediate',
  instructions = ARRAY['Stand with your feet shoulder-width apart and the barbell on the ground in front of you.', 'Bend your knees and hinge at the hips to lower your torso and grip the barbell with an overhand grip, hands slightly wider than shoulder-width apart.', 'Keep your back straight and chest lifted as you drive through your heels to lift the barbell off the ground, extending your hips and knees.', 'As you stand up straight, squeeze your glutes and keep your core engaged.', 'Lower the barbell back down to the ground by bending at the hips and knees, keeping your back straight.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/barbell-deadlift.gif',
  external_id = '0032',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000033';

UPDATE public.exercises SET
  name = 'Dumbbell Standing Overhead Press',
  body_part = 'shoulders',
  target_muscle = 'delts',
  equipment = 'dumbbell',
  difficulty = 'intermediate',
  instructions = ARRAY['Stand with your feet shoulder-width apart, holding a dumbbell in each hand at shoulder level with your palms facing forward.', 'Press the dumbbells upward until your arms are fully extended overhead.', 'Pause for a moment at the top, then slowly lower the dumbbells back down to shoulder level.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/delts/dumbbell-standing-overhead-press.gif',
  external_id = '0426',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000034';

UPDATE public.exercises SET
  name = 'Skin The Cat',
  body_part = 'back',
  target_muscle = 'upper back',
  equipment = 'body weight',
  difficulty = 'advanced',
  instructions = ARRAY['Start by hanging from a bar with your arms fully extended and your body relaxed.', 'Engage your core and lift your legs up, bringing your knees towards your chest.', 'Continue to lift your legs up and over your head, allowing your body to pass through the arms.', 'Once your legs are fully extended over your head, begin to lower them back down towards the starting position.', 'As you lower your legs, allow your body to pass back through the arms until you are hanging with your arms fully extended again.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/upper-back/skin-the-cat.gif',
  external_id = '3304',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000035';

UPDATE public.exercises SET
  name = 'Seated Glute Stretch',
  body_part = 'upper legs',
  target_muscle = 'glutes',
  equipment = 'body weight',
  difficulty = 'beginner',
  instructions = ARRAY['Sit on the ground with your legs extended in front of you.', 'Bend your right knee and cross your right ankle over your left thigh.', 'Place your right hand on the ground behind you for support.', 'With your left hand, gently press down on your right knee to deepen the stretch.', 'Hold the stretch for 30 seconds to 1 minute.', 'Switch sides and repeat.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/seated-glute-stretch.gif',
  external_id = '1424',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000036';

UPDATE public.exercises SET
  name = 'Seated Lower Back Stretch',
  body_part = 'back',
  target_muscle = 'lats',
  equipment = 'body weight',
  difficulty = 'beginner',
  instructions = ARRAY['Sit on the edge of a chair with your feet flat on the ground.', 'Place your hands on your thighs or on the sides of the chair for support.', 'Slowly lean forward from your hips, keeping your back straight.', 'Feel the stretch in your lower back and hold for 20-30 seconds.', 'Slowly return to the starting position and repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/lats/seated-lower-back-stretch.gif',
  external_id = '0690',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000037';

UPDATE public.exercises SET
  name = 'Pike-To-Cobra Push-Up',
  body_part = 'upper legs',
  target_muscle = 'glutes',
  equipment = 'body weight',
  difficulty = 'advanced',
  instructions = ARRAY['Start in a push-up position with your hands slightly wider than shoulder-width apart and your feet together.', 'Engage your core and lift your hips up towards the ceiling, forming an inverted V shape with your body.', 'Lower your upper body towards the ground by bending your elbows, keeping them close to your body.', 'As you lower down, shift your weight forward and transition into a cobra pose by straightening your arms and lifting your chest up.', 'Reverse the movement by bending your elbows and lowering your chest back down towards the ground.', 'Push through your hands to return to the inverted V position.', 'Continue the movement by lowering your hips back down towards the ground, returning to the starting push-up position.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/piketocobra-pushup.gif',
  external_id = '3662',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000038';

UPDATE public.exercises SET
  name = 'Dead Bug',
  body_part = 'waist',
  target_muscle = 'abs',
  equipment = 'body weight',
  difficulty = 'beginner',
  instructions = ARRAY['Lie flat on your back with your arms extended towards the ceiling.', 'Bend your knees and lift your legs off the ground, creating a 90-degree angle at your hips and knees.', 'Engage your core and lower back to press your lower back into the ground.', 'Slowly lower your right arm and left leg towards the ground, keeping them straight and hovering just above the floor.', 'Pause for a moment, then return to the starting position.', 'Repeat the movement with your left arm and right leg.', 'Continue alternating sides for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/abs/dead-bug.gif',
  external_id = '0276',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000039';

UPDATE public.exercises SET
  name = 'Russian Twist',
  body_part = 'waist',
  target_muscle = 'abs',
  equipment = 'body weight',
  difficulty = 'intermediate',
  instructions = ARRAY['Sit on the ground with your knees bent and feet flat on the floor.', 'Lean back slightly while keeping your back straight and your core engaged.', 'Hold your hands together in front of your chest or hold a weight if desired.', 'Lift your feet off the ground, balancing on your sit bones.', 'Twist your torso to the right, bringing your hands or weight towards the right side of your body.', 'Pause for a moment, then twist your torso to the left, bringing your hands or weight towards the left side of your body.', 'Continue alternating sides for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/abs/russian-twist.gif',
  external_id = '0687',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000040';

UPDATE public.exercises SET
  name = 'Band Bicycle Crunch',
  body_part = 'waist',
  target_muscle = 'abs',
  equipment = 'band',
  difficulty = 'intermediate',
  instructions = ARRAY['Lie flat on your back with your hands behind your head and your knees bent.', 'Lift your feet off the ground and bring your right knee towards your chest while simultaneously twisting your torso to bring your left elbow towards your right knee.', 'Straighten your right leg while bringing your left knee towards your chest and twisting your torso to bring your right elbow towards your left knee.', 'Continue alternating the twisting motion, as if you are pedaling a bicycle, while keeping your core engaged throughout the movement.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/abs/band-bicycle-crunch.gif',
  external_id = '0972',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000041';

UPDATE public.exercises SET
  name = 'Bodyweight Squatting Row (With Towel)',
  body_part = 'back',
  target_muscle = 'upper back',
  equipment = 'body weight',
  difficulty = 'beginner',
  instructions = ARRAY['Stand with your feet shoulder-width apart, holding a towel in front of you with your palms facing down.', 'Bend your knees and lower your body into a squat position, keeping your back straight and your chest up.', 'As you lower into the squat, simultaneously pull the towel towards your chest, squeezing your shoulder blades together.', 'Pause for a moment at the bottom of the squat, then slowly return to the starting position while extending your arms.', 'Repeat for the desired number of repetitions.'],
  gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/upper-back/bodyweight-squatting-row.gif',
  external_id = '3167',
  source = 'ExerciseDB'
WHERE id = '11111111-0000-0000-0000-000000000042';
