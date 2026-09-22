--
-- Name: handle_orphaned_gamer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_orphaned_gamer() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  remaining_parents INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_parents
  FROM parent_gamer
  WHERE gamer_id = OLD.gamer_id;

  IF remaining_parents = 0 THEN
    DELETE FROM auth.users WHERE id = OLD.gamer_id;
  END IF;

  RETURN OLD;
END;
$$;


--
-- Name: FUNCTION handle_orphaned_gamer(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_orphaned_gamer() TO anon;
GRANT ALL ON FUNCTION public.handle_orphaned_gamer() TO authenticated;
GRANT ALL ON FUNCTION public.handle_orphaned_gamer() TO service_role;


