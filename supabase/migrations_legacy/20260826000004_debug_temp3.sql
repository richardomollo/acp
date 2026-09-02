CREATE OR REPLACE FUNCTION public._debug_list_triggers(p_table text)
RETURNS TABLE(trigger_name text, action_timing text, event_manipulation text, action_statement text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT trigger_name, action_timing, event_manipulation, action_statement
  FROM information_schema.triggers
  WHERE event_object_table = p_table AND event_object_schema = 'public';
$$;
GRANT EXECUTE ON FUNCTION public._debug_list_triggers(text) TO service_role;
