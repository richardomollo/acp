UPDATE public.subscription_plans
SET is_active = false
WHERE tier = 'pay_as_you_go';
