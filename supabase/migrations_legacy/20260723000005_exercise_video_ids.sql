-- Add YouTube video_id to exercises for in-app tutorial playback
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS video_id text;

-- Home / Bodyweight
UPDATE public.exercises SET video_id = 'IODxDxX7oi4' WHERE id = '11111111-0000-0000-0000-000000000001'; -- Push Up
UPDATE public.exercises SET video_id = 'bI2qDaLrKCg' WHERE id = '11111111-0000-0000-0000-000000000002'; -- Bodyweight Squat
UPDATE public.exercises SET video_id = 'bI2qDaLrKCg' WHERE id = '11111111-0000-0000-0000-000000000003'; -- Lunge
UPDATE public.exercises SET video_id = 'aFk1SjShgO4' WHERE id = '11111111-0000-0000-0000-000000000004'; -- Plank
UPDATE public.exercises SET video_id = '1PRGMrkaOBM' WHERE id = '11111111-0000-0000-0000-000000000005'; -- Glute Bridge
UPDATE public.exercises SET video_id = 'eJllA-pZlb8' WHERE id = '11111111-0000-0000-0000-000000000006'; -- Mountain Climber
UPDATE public.exercises SET video_id = 'JEA5YYE_VXQ' WHERE id = '11111111-0000-0000-0000-000000000007'; -- Jumping Jack
UPDATE public.exercises SET video_id = 'F46KNCwIdeM' WHERE id = '11111111-0000-0000-0000-000000000008'; -- High Knees
UPDATE public.exercises SET video_id = 'u1floBsMZNs' WHERE id = '11111111-0000-0000-0000-000000000009'; -- Burpee
UPDATE public.exercises SET video_id = 'MC6nbI-eXDo' WHERE id = '11111111-0000-0000-0000-000000000010'; -- Jump Squat
UPDATE public.exercises SET video_id = 'usZgF8TBWcA' WHERE id = '11111111-0000-0000-0000-000000000011'; -- Speed Skater

-- Gym — Push
UPDATE public.exercises SET video_id = 'Z1ErMMcDR9E' WHERE id = '11111111-0000-0000-0000-000000000012'; -- Barbell Bench Press
UPDATE public.exercises SET video_id = 'DnV3R4vp3K0' WHERE id = '11111111-0000-0000-0000-000000000013'; -- Incline Dumbbell Press
UPDATE public.exercises SET video_id = 'Z1ErMMcDR9E' WHERE id = '11111111-0000-0000-0000-000000000014'; -- Dumbbell Shoulder Press
UPDATE public.exercises SET video_id = 'JSDpq14vCZ8' WHERE id = '11111111-0000-0000-0000-000000000015'; -- Cable Chest Fly
UPDATE public.exercises SET video_id = 'ssAo_xwFt5c' WHERE id = '11111111-0000-0000-0000-000000000016'; -- Lateral Raise
UPDATE public.exercises SET video_id = '_w-HpW70nSQ' WHERE id = '11111111-0000-0000-0000-000000000017'; -- Tricep Pushdown
UPDATE public.exercises SET video_id = 'GzmlxvSFE7A' WHERE id = '11111111-0000-0000-0000-000000000018'; -- Overhead Tricep Extension

-- Gym — Pull
UPDATE public.exercises SET video_id = 'NOrzocw9UkQ' WHERE id = '11111111-0000-0000-0000-000000000019'; -- Pull-Up
UPDATE public.exercises SET video_id = 'ML1L5ytxLMY' WHERE id = '11111111-0000-0000-0000-000000000020'; -- Barbell Row
UPDATE public.exercises SET video_id = 'lJoozxC0Rns' WHERE id = '11111111-0000-0000-0000-000000000021'; -- Seated Cable Row
UPDATE public.exercises SET video_id = 'CAwf7n6Luuc' WHERE id = '11111111-0000-0000-0000-000000000022'; -- Lat Pulldown
UPDATE public.exercises SET video_id = '0Po47vvj9g4' WHERE id = '11111111-0000-0000-0000-000000000023'; -- Face Pull
UPDATE public.exercises SET video_id = 'Jfp4b5Olc7A' WHERE id = '11111111-0000-0000-0000-000000000024'; -- Dumbbell Bicep Curl
UPDATE public.exercises SET video_id = 'BRVDS6HVR9Q' WHERE id = '11111111-0000-0000-0000-000000000025'; -- Hammer Curl

-- Gym — Legs
UPDATE public.exercises SET video_id = '6JZHiz8hswM' WHERE id = '11111111-0000-0000-0000-000000000026'; -- Barbell Squat
UPDATE public.exercises SET video_id = 'JCXUYuzwNrM' WHERE id = '11111111-0000-0000-0000-000000000027'; -- Romanian Deadlift
UPDATE public.exercises SET video_id = 'l2eih0DP10w' WHERE id = '11111111-0000-0000-0000-000000000028'; -- Leg Press
UPDATE public.exercises SET video_id = 'bI2qDaLrKCg' WHERE id = '11111111-0000-0000-0000-000000000029'; -- Walking Lunge
UPDATE public.exercises SET video_id = 'mANzolX2_IA' WHERE id = '11111111-0000-0000-0000-000000000030'; -- Leg Curl
UPDATE public.exercises SET video_id = 'qFxTNOiQIAU' WHERE id = '11111111-0000-0000-0000-000000000031'; -- Hip Thrust
UPDATE public.exercises SET video_id = 'PYZY00hI43w' WHERE id = '11111111-0000-0000-0000-000000000032'; -- Calf Raise

-- Gym — Compound Strength
UPDATE public.exercises SET video_id = 'Z1ErMMcDR9E' WHERE id = '11111111-0000-0000-0000-000000000033'; -- Barbell Deadlift
UPDATE public.exercises SET video_id = 'Z1ErMMcDR9E' WHERE id = '11111111-0000-0000-0000-000000000034'; -- Overhead Press

-- Mobility
UPDATE public.exercises SET video_id = 'lD9ZDwlHmmE' WHERE id = '11111111-0000-0000-0000-000000000035'; -- Cat-Cow Stretch
UPDATE public.exercises SET video_id = 'Rc3VJmebxhE' WHERE id = '11111111-0000-0000-0000-000000000036'; -- Pigeon Pose
UPDATE public.exercises SET video_id = 'WpLBO61Ba-w' WHERE id = '11111111-0000-0000-0000-000000000037'; -- Child's Pose
UPDATE public.exercises SET video_id = 'WpLBO61Ba-w' WHERE id = '11111111-0000-0000-0000-000000000038'; -- Cobra Pose

-- Core
UPDATE public.exercises SET video_id = 'g_BYB0R-4Ws' WHERE id = '11111111-0000-0000-0000-000000000039'; -- Dead Bug
UPDATE public.exercises SET video_id = 'JyUqwkVpsi8' WHERE id = '11111111-0000-0000-0000-000000000040'; -- Russian Twist
UPDATE public.exercises SET video_id = 'aFk1SjShgO4' WHERE id = '11111111-0000-0000-0000-000000000041'; -- Bicycle Crunch
UPDATE public.exercises SET video_id = 'aFk1SjShgO4' WHERE id = '11111111-0000-0000-0000-000000000042'; -- Bird Dog
