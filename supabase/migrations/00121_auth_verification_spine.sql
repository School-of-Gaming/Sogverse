-- Phase 2 of the DB authorization refactor (docs/db-authorization-architecture.md
-- §3.4 / §5 Phase 2): the verification spine.
--
-- The spine itself is test code. This migration supplies the three things the
-- tests cannot express from the client side, plus the two behaviour changes
-- Phase 1 explicitly deferred to Phase 2.
--
-- 1. CATALOG INTROSPECTION for the static checks
--
--    _list_function_authorization_surface() replaces _list_rpc_access(). The old
--    RPC answered only "can authenticated/anon EXECUTE this?", which is the
--    grant-level half Phase 1's doc calls insufficient. The spine's check 1 also
--    needs the function's language (plpgsql bodies have a first statement; sql
--    bodies do not), whether it is SECURITY DEFINER, whether it is STRICT (a
--    STRICT function returns NULL on NULL input WITHOUT running its body, which
--    would silently void the all-NULL calling convention of the role × RPC
--    matrix), the body itself — so the test can assert the guard primitive really
--    is the first statement — and the input argument names, so the matrix can
--    BUILD its all-NULL argument object from the catalog instead of a
--    hand-copied parameter list that goes stale the first time someone adds a
--    parameter. One RPC, one round trip, no overlap.
--
--    _list_column_grants(text) closes the blind spot named in the access-control
--    test's own comment: information_schema.table_privileges cannot see
--    column-level grants, so `profiles`' column-scoped UPDATE was untestable and
--    a column grant on a "grant-locked" table would pass every check we had.
--    information_schema.column_privileges is the union of relation-level and
--    attribute-level ACLs, i.e. the *effective* per-column privilege — exactly
--    what §3.4 check 4 audits.
--
-- 2. assert_role NO LONGER LETS A ROLELESS CALLER THROUGH (§5 Phase 1 inherited
--    item 1). `(SELECT get_user_role()) <> p_role` is NULL — not true — when the
--    caller has no profiles row, so the IF never fired and the caller passed.
--    IS DISTINCT FROM makes it fail closed.
--
--    Verified safe before writing this: no src/ path calls a converted role-gated
--    RPC through createAdminClient. Every call site
--    (apply_group_changes, create_product, update_product,
--    get_product_groups_with_details, promote_from_waitlist, demote_to_waitlist,
--    get_gedu_assigned_product, get_my_assigned_products, set_gedu_verified)
--    runs on the user-bound client from requireRole(), or on the browser client
--    through a service class. No pg_cron job and no other SQL function calls one
--    either. The only callers that relied on the pass-through were db tests
--    driving admin RPCs through the service-role client; they now sign in as the
--    seeded admin instead.
--
--    Who this newly refuses, deliberately: a session whose profiles row was
--    deleted mid-session, and a service_role connection. Both SHOULD be refused —
--    the first is the revocation case §3.1 exists for, the second has no business
--    impersonating a role it cannot name.
--
-- 3. set_gedu_verified CONVERTED to the canonical guard (§5 Phase 1 inherited
--    item 2). It was role-gated by a hand-written `IF NOT is_admin()` that raised
--    a generic error, which is why the `42501` grep did not find it in Phase 1.
--    Its refusal code becomes 42501 like every other role-gated RPC; the route
--    layer keys on status, not on this message, and the only DB test asserting on
--    it asserted "an error, any error". search_path moves to the canonical empty
--    form while we are here (§3.5) — the body was already fully qualified.

-- ---------------------------------------------------------------------------
-- 1. Catalog introspection for §3.4 checks 1, 4 and 5
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public._list_rpc_access();
DROP FUNCTION IF EXISTS public._list_function_authorization_surface();

CREATE FUNCTION public._list_function_authorization_surface()
RETURNS TABLE(
  function_name text,
  function_language text,
  is_security_definer boolean,
  is_strict boolean,
  authenticated_access boolean,
  anon_access boolean,
  argument_names text[],
  body text
)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = ''
    AS $$
  SELECT
    p.proname::text,
    l.lanname::text,
    p.prosecdef,
    p.proisstrict,
    pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'),
    -- proargnames carries OUT/TABLE column names after the input args, so slice
    -- to pronargs. NULL when the function takes no arguments at all.
    COALESCE(p.proargnames[1:p.pronargs], '{}'::text[]),
    p.prosrc::text
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language  l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    -- Trigger functions are not a callable surface: PostgREST cannot invoke them
    -- and PostgreSQL only runs them from a trigger context. Same exclusion the
    -- RPC-access view this replaces used.
    AND p.prorettype <> 'pg_catalog.trigger'::pg_catalog.regtype;
$$;

CREATE OR REPLACE FUNCTION public._list_column_grants(p_grantee text)
RETURNS TABLE(table_name text, column_name text, privilege_type text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = ''
    AS $$
  SELECT c.table_name::text, c.column_name::text, c.privilege_type::text
  FROM information_schema.column_privileges c
  WHERE c.grantee = p_grantee
    AND c.table_schema = 'public'
  ORDER BY 1, 2, 3;
$$;

REVOKE ALL ON FUNCTION public._list_function_authorization_surface() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._list_function_authorization_surface() TO service_role;

REVOKE ALL ON FUNCTION public._list_column_grants(p_grantee text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._list_column_grants(p_grantee text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. assert_role fails closed on a roleless caller
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_role(p_role public.user_role) RETURNS void
    LANGUAGE plpgsql
    SET search_path = ''
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

-- ---------------------------------------------------------------------------
-- 3. set_gedu_verified on the canonical guard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_gedu_verified(p_gedu_id uuid, p_verified boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_gedu_id AND role = 'gedu'
  ) THEN
    RAISE EXCEPTION 'set_gedu_verified: % is not a gedu', p_gedu_id;
  END IF;

  UPDATE public.gedu_profiles
  SET verified    = p_verified,
      verified_at = CASE WHEN p_verified THEN now() ELSE NULL END,
      verified_by = CASE WHEN p_verified THEN (SELECT auth.uid()) ELSE NULL END
  WHERE user_id = p_gedu_id;
END;
$$;
