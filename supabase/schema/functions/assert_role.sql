--
-- Name: assert_role(public.user_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_role(p_role public.user_role) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  -- A NULL p_role is a caller bug — no role name was asked for, so nothing can
  -- satisfy the assertion. Refuse before the comparison can swallow it.
  IF p_role IS NULL THEN
    RAISE EXCEPTION 'assert_role requires a role' USING ERRCODE = '42501';
  END IF;

  -- IS DISTINCT FROM, not `<>`: a caller with no profiles row has a NULL role,
  -- and `NULL <> 'admin'` is NULL, which an IF treats as false — that let a
  -- roleless caller straight through. NULL is distinct from every role, so this
  -- form refuses them.
  IF (SELECT public.get_user_role()) IS DISTINCT FROM p_role THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;


--
-- Name: FUNCTION assert_role(p_role public.user_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assert_role(p_role public.user_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_role(p_role public.user_role) TO authenticated;
GRANT ALL ON FUNCTION public.assert_role(p_role public.user_role) TO service_role;


