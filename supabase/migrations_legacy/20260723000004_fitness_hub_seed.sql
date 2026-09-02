-- ── ACP Fitness Hub — Seed Data ───────────────────────────────────────────────
-- 42 exercises + 8 workout templates + workout_exercise prescriptions

-- ── Exercises ─────────────────────────────────────────────────────────────────
INSERT INTO public.exercises (id, name, body_part, target_muscle, equipment, difficulty, instructions, source) VALUES

-- Home / Bodyweight
('11111111-0000-0000-0000-000000000001', 'Push Up',             'chest',       'pectorals',            'none',                 'beginner',
  ARRAY['Start in a high plank with hands shoulder-width apart.','Lower your chest toward the floor, elbows at ~45°.','Push back up, keeping core tight throughout.'], 'ACP'),

('11111111-0000-0000-0000-000000000002', 'Bodyweight Squat',    'lower body',  'quadriceps',           'none',                 'beginner',
  ARRAY['Stand with feet shoulder-width apart, toes slightly out.','Push hips back and bend knees to lower down.','Keep chest up and knees over toes. Lower until thighs are parallel to the floor.','Drive through heels to return to standing.'], 'ACP'),

('11111111-0000-0000-0000-000000000003', 'Lunge',               'lower body',  'quadriceps, glutes',   'none',                 'beginner',
  ARRAY['Step one foot forward and lower your back knee toward the floor.','Keep your front knee over your ankle, not past your toes.','Push back to standing and switch sides.'], 'ACP'),

('11111111-0000-0000-0000-000000000004', 'Plank',               'core',        'transverse abdominis', 'none',                 'beginner',
  ARRAY['Start in a forearm plank with elbows under shoulders.','Keep body in a straight line from head to heels.','Engage core and glutes. Don''t let hips sag or rise.','Breathe steadily and hold.'], 'ACP'),

('11111111-0000-0000-0000-000000000005', 'Glute Bridge',        'glutes',      'glutes, hamstrings',   'none',                 'beginner',
  ARRAY['Lie on your back, knees bent, feet flat on the floor.','Drive through your heels to lift hips toward the ceiling.','Squeeze glutes at the top, then lower with control.'], 'ACP'),

('11111111-0000-0000-0000-000000000006', 'Mountain Climber',    'core',        'abs, hip flexors',     'none',                 'beginner',
  ARRAY['Start in a high plank with arms straight.','Drive one knee toward your chest, then quickly switch legs.','Keep hips level and core engaged throughout.'], 'ACP'),

('11111111-0000-0000-0000-000000000007', 'Jumping Jack',        'full body',   'cardiovascular',       'none',                 'beginner',
  ARRAY['Stand with feet together and arms at your sides.','Jump feet out while raising arms overhead.','Jump back to start. Maintain a steady rhythm.'], 'ACP'),

('11111111-0000-0000-0000-000000000008', 'High Knees',          'lower body',  'hip flexors',          'none',                 'beginner',
  ARRAY['Stand tall and run in place, driving each knee to hip height.','Pump arms in opposition to your legs.','Stay on the balls of your feet for speed.'], 'ACP'),

('11111111-0000-0000-0000-000000000009', 'Burpee',              'full body',   'full body',            'none',                 'intermediate',
  ARRAY['Start standing. Drop into a squat and place hands on the floor.','Jump feet back to a plank position.','Perform a push-up, then jump feet forward to hands.','Explode up and jump with arms overhead.'], 'ACP'),

('11111111-0000-0000-0000-000000000010', 'Jump Squat',          'lower body',  'quadriceps, glutes',   'none',                 'intermediate',
  ARRAY['Stand with feet shoulder-width apart and squat down.','Explode up and jump as high as you can.','Land softly with bent knees and immediately go into the next squat.'], 'ACP'),

('11111111-0000-0000-0000-000000000011', 'Speed Skater',        'lower body',  'glutes, adductors',    'none',                 'intermediate',
  ARRAY['Stand on one foot with a slight squat.','Bound laterally to the other foot, swinging arms across your body.','Land softly and repeat side to side.'], 'ACP'),

-- Gym — Push muscles
('11111111-0000-0000-0000-000000000012', 'Barbell Bench Press', 'chest',       'pectorals, triceps',   'barbell, bench',       'intermediate',
  ARRAY['Lie on a flat bench with feet flat on the floor.','Grip the bar slightly wider than shoulder-width.','Lower the bar to your lower chest, then press back up.','Keep shoulder blades retracted and core braced.'], 'ACP'),

('11111111-0000-0000-0000-000000000013', 'Incline Dumbbell Press','chest',     'upper pectorals',      'dumbbells, bench',     'intermediate',
  ARRAY['Set a bench to a 30-45° incline.','Hold a dumbbell in each hand at chest level, elbows out.','Press the dumbbells up until arms are extended.','Slowly lower back to the starting position.'], 'ACP'),

('11111111-0000-0000-0000-000000000014', 'Dumbbell Shoulder Press','shoulders','deltoids, triceps',     'dumbbells',            'intermediate',
  ARRAY['Sit or stand with a dumbbell at each shoulder.','Press the dumbbells overhead until arms are fully extended.','Slowly lower back down to shoulder level.'], 'ACP'),

('11111111-0000-0000-0000-000000000015', 'Cable Chest Fly',     'chest',       'pectorals',            'cable machine',        'intermediate',
  ARRAY['Set cables at chest height and stand in the centre.','With a slight bend in elbows, bring hands together in front.','Squeeze your chest at the peak, then slowly return.'], 'ACP'),

('11111111-0000-0000-0000-000000000016', 'Lateral Raise',       'shoulders',   'lateral deltoids',     'dumbbells',            'beginner',
  ARRAY['Stand holding light dumbbells at your sides.','Raise arms out to the sides until they reach shoulder height.','Lower slowly with control. Avoid shrugging.'], 'ACP'),

('11111111-0000-0000-0000-000000000017', 'Tricep Pushdown',     'arms',        'triceps',              'cable machine',        'beginner',
  ARRAY['Set the cable to high position. Grip the bar with palms down.','Keep elbows pinned to your sides and push the bar down.','Fully extend arms, then slowly return.'], 'ACP'),

('11111111-0000-0000-0000-000000000018', 'Overhead Tricep Extension','arms',   'triceps',              'dumbbell',             'beginner',
  ARRAY['Hold one dumbbell overhead with both hands.','Lower it behind your head by bending your elbows.','Extend arms back up, keeping elbows pointing forward.'], 'ACP'),

-- Gym — Pull muscles
('11111111-0000-0000-0000-000000000019', 'Pull-Up',             'back',        'latissimus dorsi',     'pull-up bar',          'intermediate',
  ARRAY['Hang from a bar with an overhand grip wider than shoulder-width.','Pull your body up until your chin clears the bar.','Lower with control to a dead hang. Avoid swinging.'], 'ACP'),

('11111111-0000-0000-0000-000000000020', 'Barbell Row',         'back',        'latissimus dorsi',     'barbell',              'intermediate',
  ARRAY['Hinge at the hips with a flat back and grip the barbell.','Pull the bar toward your lower chest, squeezing shoulder blades.','Lower the bar with control.'], 'ACP'),

('11111111-0000-0000-0000-000000000021', 'Seated Cable Row',    'back',        'rhomboids',            'cable machine',        'beginner',
  ARRAY['Sit upright with feet on the footrest and grip the handle.','Pull the handle to your lower sternum, squeezing shoulder blades together.','Slowly return to the start.'], 'ACP'),

('11111111-0000-0000-0000-000000000022', 'Lat Pulldown',        'back',        'latissimus dorsi',     'cable machine',        'beginner',
  ARRAY['Sit at the lat pulldown machine and grip the bar wide.','Pull the bar to your upper chest while leaning back slightly.','Return with arms fully extended.'], 'ACP'),

('11111111-0000-0000-0000-000000000023', 'Face Pull',           'shoulders',   'rear deltoids',        'cable machine',        'intermediate',
  ARRAY['Set cable to face height and use a rope attachment.','Pull the rope toward your face, separating the ends.','Squeeze rear delts at the peak. Return slowly.'], 'ACP'),

('11111111-0000-0000-0000-000000000024', 'Dumbbell Bicep Curl', 'arms',        'biceps',               'dumbbells',            'beginner',
  ARRAY['Stand holding dumbbells at your sides with palms forward.','Curl the weights to shoulder height, squeezing biceps.','Lower slowly to the start.'], 'ACP'),

('11111111-0000-0000-0000-000000000025', 'Hammer Curl',         'arms',        'biceps, brachialis',   'dumbbells',            'beginner',
  ARRAY['Hold dumbbells at your sides with palms facing each other.','Curl the weights while keeping palms neutral.','Lower with control.'], 'ACP'),

-- Gym — Legs
('11111111-0000-0000-0000-000000000026', 'Barbell Squat',       'lower body',  'quadriceps, glutes',   'barbell',              'intermediate',
  ARRAY['Rest the barbell across your upper back.','Stand with feet shoulder-width apart, toes slightly out.','Brace core and lower until thighs are parallel to the floor.','Drive through heels to stand back up.'], 'ACP'),

('11111111-0000-0000-0000-000000000027', 'Romanian Deadlift',   'lower body',  'hamstrings, glutes',   'barbell or dumbbells', 'intermediate',
  ARRAY['Hold the bar at hip height with a shoulder-width grip.','Hinge at the hips, lowering the bar along your legs.','Keep a slight bend in knees and a flat back throughout.','Drive hips forward to return to standing.'], 'ACP'),

('11111111-0000-0000-0000-000000000028', 'Leg Press',           'lower body',  'quadriceps, glutes',   'leg press machine',    'beginner',
  ARRAY['Sit in the leg press machine with feet hip-width apart on the platform.','Lower the weight until knees are at 90°.','Push through heels to extend legs. Don''t lock out your knees.'], 'ACP'),

('11111111-0000-0000-0000-000000000029', 'Walking Lunge',       'lower body',  'quadriceps, glutes',   'dumbbells or bodyweight','beginner',
  ARRAY['Step forward into a lunge, lowering your back knee toward the floor.','Push through your front foot and bring the back leg forward into the next lunge.','Keep torso upright and core engaged.'], 'ACP'),

('11111111-0000-0000-0000-000000000030', 'Leg Curl',            'lower body',  'hamstrings',           'leg curl machine',     'beginner',
  ARRAY['Lie face-down on the leg curl machine, ankles under the roller.','Curl legs toward glutes while keeping hips pressed down.','Slowly lower back to start.'], 'ACP'),

('11111111-0000-0000-0000-000000000031', 'Hip Thrust',          'glutes',      'glutes, hamstrings',   'bench, barbell',       'intermediate',
  ARRAY['Rest upper back on a bench and place a barbell across your hips.','Drive hips up toward the ceiling, squeezing glutes at the top.','Lower in a controlled manner and repeat.'], 'ACP'),

('11111111-0000-0000-0000-000000000032', 'Calf Raise',          'lower body',  'calves',               'none or machine',      'beginner',
  ARRAY['Stand with feet hip-width apart.','Rise onto your toes and hold briefly at the top.','Lower slowly. Use a step for greater range of motion.'], 'ACP'),

-- Gym — Compound Strength
('11111111-0000-0000-0000-000000000033', 'Barbell Deadlift',    'full body',   'hamstrings, glutes, lower back','barbell',     'intermediate',
  ARRAY['Stand with feet hip-width and bar over mid-foot.','Hinge down and grip the bar just outside your legs.','Drive through the floor, pulling the bar close to your body.','Lock out at the top, then lower with control.'], 'ACP'),

('11111111-0000-0000-0000-000000000034', 'Overhead Press',      'shoulders',   'deltoids, triceps',    'barbell',              'intermediate',
  ARRAY['Stand with barbell at shoulder height, elbows slightly forward.','Press the bar overhead until arms are fully extended.','Lower back to shoulder height.'], 'ACP'),

-- Mobility
('11111111-0000-0000-0000-000000000035', 'Cat-Cow Stretch',     'back',        'spine, core',          'none',                 'beginner',
  ARRAY['Start on hands and knees with wrists under shoulders.','Inhale and arch your back (Cow): chest and tailbone rise.','Exhale and round your back (Cat): tuck chin and tailbone.','Flow between the two with each breath.'], 'ACP'),

('11111111-0000-0000-0000-000000000036', 'Pigeon Pose',         'lower body',  'hip flexors, glutes',  'none',                 'beginner',
  ARRAY['From a plank, bring one knee forward toward your same-side wrist.','Extend the back leg straight behind you.','Lower your hips to the floor and hold. Breathe deeply.','Switch sides after prescribed time.'], 'ACP'),

('11111111-0000-0000-0000-000000000037', 'Child''s Pose',       'back',        'lower back, hips',     'none',                 'beginner',
  ARRAY['Kneel on the floor and sit back toward your heels.','Extend arms forward on the floor.','Rest forehead down and breathe into your lower back.','Hold and relax.'], 'ACP'),

('11111111-0000-0000-0000-000000000038', 'Cobra Pose',          'back',        'lower back, spine',    'none',                 'beginner',
  ARRAY['Lie face-down with hands under your shoulders.','Press your palms into the floor and lift your chest, keeping hips down.','Hold at the top, then lower slowly.'], 'ACP'),

-- Core
('11111111-0000-0000-0000-000000000039', 'Dead Bug',            'core',        'transverse abdominis', 'none',                 'beginner',
  ARRAY['Lie on your back with arms pointing up and knees at 90°.','Lower one arm and the opposite leg toward the floor simultaneously.','Return to start and switch sides. Keep lower back pressed down.'], 'ACP'),

('11111111-0000-0000-0000-000000000040', 'Russian Twist',       'core',        'obliques',             'none',                 'beginner',
  ARRAY['Sit with knees bent and lean back slightly.','Rotate side to side, touching the floor each time.','Keep core tight. Lift feet off the floor for extra challenge.'], 'ACP'),

('11111111-0000-0000-0000-000000000041', 'Bicycle Crunch',      'core',        'obliques, abs',        'none',                 'beginner',
  ARRAY['Lie on your back, hands behind head, knees bent.','Bring one knee to your chest while rotating the opposite elbow toward it.','Alternate sides in a pedaling motion.'], 'ACP'),

('11111111-0000-0000-0000-000000000042', 'Bird Dog',            'core',        'core, glutes, lower back','none',              'beginner',
  ARRAY['Start on hands and knees with a neutral spine.','Extend one arm forward and the opposite leg back simultaneously.','Hold briefly, return, and switch sides.','Avoid rotating your hips.'], 'ACP');


-- ── Workouts ──────────────────────────────────────────────────────────────────
INSERT INTO public.workouts (id, title, description, category, location_type, difficulty, duration_minutes, goal, equipment) VALUES

('22222222-0000-0000-0000-000000000001',
  'Beginner Full Body',
  'A well-rounded starter routine that builds strength and coordination using only your bodyweight. Perfect for your first week of training.',
  'full_body', 'home', 'beginner', 20, 'general_fitness', 'None'),

('22222222-0000-0000-0000-000000000002',
  'Fat Burn HIIT',
  'High-intensity intervals designed to spike your heart rate and torch calories. Short bursts of effort with brief rest periods.',
  'hiit', 'home', 'intermediate', 20, 'lose_weight', 'None'),

('22222222-0000-0000-0000-000000000003',
  'Mobility & Flexibility',
  'Gentle movement flows and holds to improve range of motion, reduce stiffness, and help your body recover faster.',
  'mobility', 'home', 'beginner', 20, 'improve_mobility', 'None'),

('22222222-0000-0000-0000-000000000004',
  'Core Strength',
  'Targeted core work to build a strong and stable midsection. These exercises protect your back and improve posture.',
  'core', 'home', 'beginner', 20, 'general_fitness', 'None'),

('22222222-0000-0000-0000-000000000005',
  'Push Day',
  'A classic chest, shoulder and tricep session. Push patterns build upper body pressing strength and create a strong, wide physique.',
  'push', 'gym', 'intermediate', 45, 'build_muscle', 'Barbell, dumbbells, cable machine, bench'),

('22222222-0000-0000-0000-000000000006',
  'Pull Day',
  'Back, bicep and rear delt work to complement your push sessions and build balanced upper body strength.',
  'pull', 'gym', 'intermediate', 45, 'build_muscle', 'Pull-up bar, barbell, cable machine, dumbbells'),

('22222222-0000-0000-0000-000000000007',
  'Leg Day',
  'A complete lower body session targeting quads, hamstrings and glutes with compound lifts and isolation work.',
  'legs', 'gym', 'intermediate', 50, 'build_muscle', 'Barbell, leg press machine, dumbbells'),

('22222222-0000-0000-0000-000000000008',
  'Strength Builder',
  'The five foundational lifts performed at low reps and heavy weight. Built around progressive overload for maximum strength gains.',
  'strength', 'gym', 'intermediate', 45, 'build_muscle', 'Barbell');


-- ── Workout Exercises ─────────────────────────────────────────────────────────

-- Workout 1: Beginner Full Body
INSERT INTO public.workout_exercises (workout_id, exercise_id, sort_order, sets, reps, duration_seconds, rest_seconds) VALUES
('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002',1,3,12,NULL,60),  -- Bodyweight Squat
('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001',2,3,10,NULL,60),  -- Push Up
('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000003',3,3,12,NULL,60),  -- Lunge
('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000004',4,3,NULL,30,60),  -- Plank 30s
('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000005',5,3,15,NULL,45),  -- Glute Bridge
('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000006',6,3,20,NULL,45);  -- Mountain Climber

-- Workout 2: Fat Burn HIIT
INSERT INTO public.workout_exercises (workout_id, exercise_id, sort_order, sets, reps, duration_seconds, rest_seconds) VALUES
('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000007',1,3,NULL,40,20),  -- Jumping Jack 40s
('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000008',2,3,NULL,30,15),  -- High Knees 30s
('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000009',3,3,10,NULL,30),  -- Burpee
('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000010',4,3,12,NULL,20),  -- Jump Squat
('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000011',5,3,NULL,30,15),  -- Speed Skater 30s
('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000006',6,3,NULL,30,20);  -- Mountain Climber 30s

-- Workout 3: Mobility & Flexibility
INSERT INTO public.workout_exercises (workout_id, exercise_id, sort_order, sets, reps, duration_seconds, rest_seconds) VALUES
('22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000035',1,3,10,NULL,30),  -- Cat-Cow
('22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000038',2,3,NULL,20,30),  -- Cobra Pose 20s
('22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000036',3,2,NULL,30,30),  -- Pigeon Pose 30s each side
('22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000037',4,2,NULL,30,20);  -- Child's Pose 30s

-- Workout 4: Core Strength
INSERT INTO public.workout_exercises (workout_id, exercise_id, sort_order, sets, reps, duration_seconds, rest_seconds) VALUES
('22222222-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000004',1,3,NULL,30,45),  -- Plank 30s
('22222222-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000039',2,3,10,NULL,45),  -- Dead Bug
('22222222-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000040',3,3,20,NULL,45),  -- Russian Twist
('22222222-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000041',4,3,20,NULL,45),  -- Bicycle Crunch
('22222222-0000-0000-0000-000000000004','11111111-0000-0000-0000-000000000042',5,3,10,NULL,45);  -- Bird Dog

-- Workout 5: Push Day
INSERT INTO public.workout_exercises (workout_id, exercise_id, sort_order, sets, reps, duration_seconds, rest_seconds) VALUES
('22222222-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000012',1,4,8,NULL,120),  -- Bench Press
('22222222-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000013',2,3,10,NULL,90),  -- Incline DB Press
('22222222-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000014',3,3,10,NULL,90),  -- Shoulder Press
('22222222-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000015',4,3,12,NULL,60),  -- Cable Fly
('22222222-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000016',5,3,15,NULL,60),  -- Lateral Raise
('22222222-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000017',6,3,12,NULL,60),  -- Tricep Pushdown
('22222222-0000-0000-0000-000000000005','11111111-0000-0000-0000-000000000018',7,3,12,NULL,60);  -- Overhead Tricep Ext

-- Workout 6: Pull Day
INSERT INTO public.workout_exercises (workout_id, exercise_id, sort_order, sets, reps, duration_seconds, rest_seconds) VALUES
('22222222-0000-0000-0000-000000000006','11111111-0000-0000-0000-000000000019',1,4,8,NULL,120),  -- Pull-Up
('22222222-0000-0000-0000-000000000006','11111111-0000-0000-0000-000000000020',2,4,8,NULL,120),  -- Barbell Row
('22222222-0000-0000-0000-000000000006','11111111-0000-0000-0000-000000000021',3,3,10,NULL,90),  -- Seated Cable Row
('22222222-0000-0000-0000-000000000006','11111111-0000-0000-0000-000000000022',4,3,10,NULL,90),  -- Lat Pulldown
('22222222-0000-0000-0000-000000000006','11111111-0000-0000-0000-000000000023',5,3,15,NULL,60),  -- Face Pull
('22222222-0000-0000-0000-000000000006','11111111-0000-0000-0000-000000000024',6,3,12,NULL,60),  -- Bicep Curl
('22222222-0000-0000-0000-000000000006','11111111-0000-0000-0000-000000000025',7,3,12,NULL,60);  -- Hammer Curl

-- Workout 7: Leg Day
INSERT INTO public.workout_exercises (workout_id, exercise_id, sort_order, sets, reps, duration_seconds, rest_seconds) VALUES
('22222222-0000-0000-0000-000000000007','11111111-0000-0000-0000-000000000026',1,4,8,NULL,150),  -- Barbell Squat
('22222222-0000-0000-0000-000000000007','11111111-0000-0000-0000-000000000027',2,3,10,NULL,120),  -- Romanian Deadlift
('22222222-0000-0000-0000-000000000007','11111111-0000-0000-0000-000000000028',3,4,10,NULL,90),  -- Leg Press
('22222222-0000-0000-0000-000000000007','11111111-0000-0000-0000-000000000029',4,3,12,NULL,60),  -- Walking Lunge
('22222222-0000-0000-0000-000000000007','11111111-0000-0000-0000-000000000030',5,3,12,NULL,60),  -- Leg Curl
('22222222-0000-0000-0000-000000000007','11111111-0000-0000-0000-000000000031',6,3,12,NULL,75),  -- Hip Thrust
('22222222-0000-0000-0000-000000000007','11111111-0000-0000-0000-000000000032',7,4,15,NULL,45);  -- Calf Raise

-- Workout 8: Strength Builder
INSERT INTO public.workout_exercises (workout_id, exercise_id, sort_order, sets, reps, duration_seconds, rest_seconds) VALUES
('22222222-0000-0000-0000-000000000008','11111111-0000-0000-0000-000000000033',1,4,5,NULL,180),  -- Deadlift
('22222222-0000-0000-0000-000000000008','11111111-0000-0000-0000-000000000012',2,4,5,NULL,180),  -- Bench Press
('22222222-0000-0000-0000-000000000008','11111111-0000-0000-0000-000000000026',3,4,5,NULL,180),  -- Barbell Squat
('22222222-0000-0000-0000-000000000008','11111111-0000-0000-0000-000000000020',4,3,6,NULL,120),  -- Barbell Row
('22222222-0000-0000-0000-000000000008','11111111-0000-0000-0000-000000000034',5,3,6,NULL,120);  -- Overhead Press
