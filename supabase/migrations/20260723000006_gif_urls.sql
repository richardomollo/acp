-- Rename video_id → gif_url and populate with jsDelivr-hosted exercise GIFs
-- Source: github.com/JahelCuadrado/ExerciseGymGifsDB (MIT-licensed, served via jsDelivr CDN)

ALTER TABLE public.exercises RENAME COLUMN video_id TO gif_url;

-- CDN base: https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/

-- Home / Bodyweight
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/pectorals/chest-tap-push-up-male.gif'     WHERE id = '11111111-0000-0000-0000-000000000001'; -- Push Up
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/quads/squat-on-bosu-ball.gif'               WHERE id = '11111111-0000-0000-0000-000000000002'; -- Bodyweight Squat
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/quads/split-squats.gif'                     WHERE id = '11111111-0000-0000-0000-000000000003'; -- Lunge
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/abs/weighted-front-plank.gif'               WHERE id = '11111111-0000-0000-0000-000000000004'; -- Plank
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/barbell-glute-bridge.gif'            WHERE id = '11111111-0000-0000-0000-000000000005'; -- Glute Bridge
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/cardio/mountain-climber.gif'               WHERE id = '11111111-0000-0000-0000-000000000006'; -- Mountain Climber
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/cardio/jack-jump-male.gif'                 WHERE id = '11111111-0000-0000-0000-000000000007'; -- Jumping Jack
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/cardio/high-knee-against-wall.gif'         WHERE id = '11111111-0000-0000-0000-000000000008'; -- High Knees
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/cardio/burpee.gif'                         WHERE id = '11111111-0000-0000-0000-000000000009'; -- Burpee
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/cardio/semi-squat-jump-male.gif'           WHERE id = '11111111-0000-0000-0000-000000000010'; -- Jump Squat
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/cardio/skater-hops.gif'                    WHERE id = '11111111-0000-0000-0000-000000000011'; -- Speed Skater

-- Gym — Push
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/pectorals/barbell-bench-press.gif'                          WHERE id = '11111111-0000-0000-0000-000000000012'; -- Barbell Bench Press
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/pectorals/barbell-incline-bench-press.gif'                  WHERE id = '11111111-0000-0000-0000-000000000013'; -- Incline Dumbbell Press
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/delts/dumbbell-bench-seated-press.gif'                      WHERE id = '11111111-0000-0000-0000-000000000014'; -- Dumbbell Shoulder Press
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/pectorals/cable-standing-fly.gif'                           WHERE id = '11111111-0000-0000-0000-000000000015'; -- Cable Chest Fly
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/delts/cable-lateral-raise.gif'                              WHERE id = '11111111-0000-0000-0000-000000000016'; -- Lateral Raise
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/triceps/cable-pushdown.gif'                                 WHERE id = '11111111-0000-0000-0000-000000000017'; -- Tricep Pushdown
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/triceps/barbell-standing-overhead-triceps-extension.gif'   WHERE id = '11111111-0000-0000-0000-000000000018'; -- Overhead Tricep Extension

-- Gym — Pull
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/lats/chin-up.gif'                          WHERE id = '11111111-0000-0000-0000-000000000019'; -- Pull-Up
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/upper-back/barbell-bent-over-row.gif'      WHERE id = '11111111-0000-0000-0000-000000000020'; -- Barbell Row
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/upper-back/cable-seated-row.gif'           WHERE id = '11111111-0000-0000-0000-000000000021'; -- Seated Cable Row
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/lats/cable-pulldown.gif'                   WHERE id = '11111111-0000-0000-0000-000000000022'; -- Lat Pulldown
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/upper-back/cable-rope-seated-row.gif'      WHERE id = '11111111-0000-0000-0000-000000000023'; -- Face Pull
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/biceps/barbell-curl.gif'                   WHERE id = '11111111-0000-0000-0000-000000000024'; -- Dumbbell Bicep Curl
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/biceps/cable-hammer-curl-with-rope.gif'   WHERE id = '11111111-0000-0000-0000-000000000025'; -- Hammer Curl

-- Gym — Legs
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/quads/barbell-wide-squat.gif'              WHERE id = '11111111-0000-0000-0000-000000000026'; -- Barbell Squat
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/barbell-romanian-deadlift.gif'      WHERE id = '11111111-0000-0000-0000-000000000027'; -- Romanian Deadlift
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/quads/lever-alternate-leg-press.gif'       WHERE id = '11111111-0000-0000-0000-000000000028'; -- Leg Press
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/quads/split-squats.gif'                    WHERE id = '11111111-0000-0000-0000-000000000029'; -- Walking Lunge
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/hamstrings/lever-lying-leg-curl.gif'       WHERE id = '11111111-0000-0000-0000-000000000030'; -- Leg Curl
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/barbell-glute-bridge-two-legs-on-bench-male.gif' WHERE id = '11111111-0000-0000-0000-000000000031'; -- Hip Thrust
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/calves/bodyweight-standing-calf-raise.gif' WHERE id = '11111111-0000-0000-0000-000000000032'; -- Calf Raise

-- Gym — Compound Strength
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/glutes/barbell-deadlift.gif'               WHERE id = '11111111-0000-0000-0000-000000000033'; -- Barbell Deadlift
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/delts/barbell-seated-overhead-press.gif'   WHERE id = '11111111-0000-0000-0000-000000000034'; -- Overhead Press

-- Mobility (closest available GIFs)
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/spine/lower-back-curl.gif'                 WHERE id = '11111111-0000-0000-0000-000000000035'; -- Cat-Cow Stretch
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/adductors/butterfly-yoga-pose.gif'         WHERE id = '11111111-0000-0000-0000-000000000036'; -- Pigeon Pose
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/spine/spine-stretch.gif'                   WHERE id = '11111111-0000-0000-0000-000000000037'; -- Child's Pose
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/spine/upward-facing-dog.gif'               WHERE id = '11111111-0000-0000-0000-000000000038'; -- Cobra Pose

-- Core
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/abs/dead-bug.gif'                          WHERE id = '11111111-0000-0000-0000-000000000039'; -- Dead Bug
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/abs/russian-twist.gif'                     WHERE id = '11111111-0000-0000-0000-000000000040'; -- Russian Twist
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/abs/air-bike.gif'                          WHERE id = '11111111-0000-0000-0000-000000000041'; -- Bicycle Crunch
UPDATE public.exercises SET gif_url = 'https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@main/abs/dead-bug.gif'                          WHERE id = '11111111-0000-0000-0000-000000000042'; -- Bird Dog (closest: dead-bug same pattern)
