CREATE OR REPLACE FUNCTION public._debug_list_policies(p_table text)
RETURNS TABLE(policyname text, cmd text, permissive text, roles text[], qual text, with_check text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT policyname, cmd, permissive, roles, qual, with_check
  FROM pg_policies
  WHERE tablename = p_table AND schemaname = 'public';
$$;
GRANT EXECUTE ON FUNCTION public._debug_list_policies(text) TO service_role;
