--
-- Name: verify_pin_for_any(uuid[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_pin_for_any(p_user_ids uuid[], p_pin text) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
declare
  v_any_pin boolean;
begin
  -- Does anybody in the set hold a PIN at all? Asked first and independently of
  -- what was typed, because `not_set` is a fact about the FAMILY and must not
  -- depend on the shape of the input.
  select exists (
    select 1
      from customer_profiles
     where user_id = any(coalesce(p_user_ids, array[]::uuid[]))
       and pin_hash is not null
  ) into v_any_pin;

  if not v_any_pin then
    return 'not_set';
  end if;

  -- A malformed PIN is `invalid`, never an error: this sits on a credential path
  -- where raising would turn "the child typed three digits" into a 500 the
  -- client has to special-case. The regex is set_my_pin's, unchanged.
  if p_pin is null or p_pin !~ '^\d{4}$' then
    return 'invalid';
  end if;

  if exists (
    select 1
      from customer_profiles
     where user_id = any(p_user_ids)
       and pin_hash is not null
       and pin_hash = crypt(p_pin, pin_hash)
  ) then
    return 'valid';
  end if;

  return 'invalid';
end;
$_$;


--
-- Name: FUNCTION verify_pin_for_any(p_user_ids uuid[], p_pin text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.verify_pin_for_any(p_user_ids uuid[], p_pin text) IS 'Does this PIN match ANY of these users? Answers with exactly one of `valid`, `invalid` or `not_set` — never NULL, and never a raise, not even on malformed input, because it sits on a credential path where a throw would become a 500 for a mistyped digit. `not_set` means nobody in the set holds a PIN at all, which the account-switch route answers by sending the family to set one rather than by telling a child their PIN was wrong; that distinction is why this returns text and not a boolean. The comparison is the same bcrypt one verify_my_pin uses. The set exists because a child may be linked to more than one parent and any of their PINs opens the gate. service_role ONLY: no argument is checked against auth.uid(), so reachable by `authenticated` this would be a PIN oracle pointable at any family — entitlement to ask about these particular users is established by the route that calls it.';


--
-- Name: FUNCTION verify_pin_for_any(p_user_ids uuid[], p_pin text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.verify_pin_for_any(p_user_ids uuid[], p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.verify_pin_for_any(p_user_ids uuid[], p_pin text) TO service_role;


