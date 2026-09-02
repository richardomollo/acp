CREATE OR REPLACE FUNCTION public._debug_check_gym_insert(p_partner_id uuid)
RETURNS TABLE(current_auth_uid uuid, condition_result boolean, partner_row jsonb)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT
    auth.uid(),
    EXISTS (SELECT 1 FROM partners WHERE id = p_partner_id AND user_id = auth.uid()),
    (SELECT to_jsonb(p) FROM partners p WHERE p.id = p_partner_id);
$$;
GRANT EXECUTE ON FUNCTION public._debug_check_gym_insert(uuid) TO authenticated;
