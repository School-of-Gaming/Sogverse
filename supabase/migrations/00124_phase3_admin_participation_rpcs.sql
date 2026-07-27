-- Phase 3 of the DB authorization refactor (docs/db-authorization-architecture.md
-- §5 Phase 3), batch 3 of 3: the new RPCs, written to the §3.5 template.
--
-- The two admin participation routes were the only remaining candidates that
-- could not be converted by a grant or a client swap. `participations` is
-- grant-locked — `authenticated` holds SELECT and nothing else, deliberately,
-- because a stray write there is a free seat — so an admin acting as themselves
-- has no path to it except a SECURITY DEFINER function. These are that function,
-- one per direction.
--
-- Both encode the business rules the routes were carrying in TypeScript. That is
-- the point rather than a side effect: a rule enforced in the handler is a rule
-- that only applies to callers who came through the handler, and these two RPCs
-- are now reachable by any admin over PostgREST.
--
-- WHY NOT GUARD cancel_participation ITSELF
--
-- The doc's Phase 3 sketch expected admin-participation-cancel to be a
-- grant-plus-guard conversion. Re-verifying against the current code says
-- otherwise: `cancel_participation` is also called by the Stripe webhook, which
-- has no session by definition and must keep calling it as service_role
-- permanently. A role guard on its body would break that path for good, not just
-- through the deployment window. So it stays a service_role-only engine and the
-- admin-facing entry point wraps it — which is also what lets the wrapper hold
-- the admin-specific preconditions the webhook must not have.

-- ---------------------------------------------------------------------------
-- admin_enroll_gamer — comp-enrollment, admin-gated
-- ---------------------------------------------------------------------------
-- Deliberately does NOT go through create_participation: that function's gates
-- (parent-of-customer, registration window, effective status, seat cap) are
-- exactly what an admin override is for. What it does keep is the pieces that
-- are not overridable — the product must exist, consumer clubs are out of scope
-- (recurring billing has no comp story yet), and a gamer with no linked parent
-- has no customer to attribute the participation to.

CREATE OR REPLACE FUNCTION public.admin_enroll_gamer(
  p_product_id uuid,
  p_gamer_id   uuid
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $$
DECLARE
  v_product_type     public.product_type;
  v_customer_id      uuid;
  v_participation_id uuid;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_type INTO v_product_type
    FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_product_type = 'consumer_club' THEN
    RAISE EXCEPTION 'admin enrollment is not supported for consumer clubs'
      USING ERRCODE = 'check_violation';
  END IF;

  -- One parent per gamer is the current model; where a gamer somehow has
  -- several links, the oldest wins so the choice is deterministic rather than
  -- whatever the planner returned. Multi-parent reckoning is future work.
  SELECT parent_id INTO v_customer_id
    FROM public.parent_gamer
    WHERE gamer_id = p_gamer_id
    ORDER BY created_at ASC
    LIMIT 1;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'gamer % has no linked parent', p_gamer_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- The partial unique index on (product_id, gamer_id) for non-reserving
  -- statuses is the source of truth for "already enrolled"; it raises 23505 and
  -- the route maps that to 409. Re-checking it here would be a race, not a
  -- safeguard.
  INSERT INTO public.participations (product_id, gamer_id, customer_id, status)
  VALUES (p_product_id, p_gamer_id, v_customer_id, 'active')
  RETURNING id INTO v_participation_id;

  RETURN jsonb_build_object(
    'participation_id', v_participation_id,
    'customer_id', v_customer_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_enroll_gamer(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_enroll_gamer(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_enroll_gamer(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.admin_enroll_gamer(uuid, uuid) IS
  'Admin-gated comp-enrollment: drops a gamer onto a non-consumer_club product with status=active, bypassing payment, seat caps and registration windows by design.';

-- ---------------------------------------------------------------------------
-- admin_remove_participation — the inverse, admin-gated
-- ---------------------------------------------------------------------------
-- The product id is a parameter, not decoration: without it a participation id
-- from a different product could be cancelled through the admin product URL.
-- Checking the pair inside the function means the check cannot be skipped by
-- calling the RPC directly.
--
-- The live-subscription refusal moves in here from the route, and moving it is
-- an improvement rather than a relocation: the read and the delete now happen in
-- one transaction under the same product lock cancel_participation takes, so
-- there is no window in which a subscription can appear between the check and
-- the CASCADE that would orphan it. Under current invariants it is unreachable
-- (only consumer_club ever has a live sub, and that is refused above), but if
-- that changes, deleting here would bill the customer forever with no DB record
-- and no refund.

CREATE OR REPLACE FUNCTION public.admin_remove_participation(
  p_product_id       uuid,
  p_participation_id uuid
) RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $$
DECLARE
  v_row_product_id uuid;
  v_product_type   public.product_type;
  v_live_sub       text;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id INTO v_row_product_id
    FROM public.participations WHERE id = p_participation_id;
  IF NOT FOUND OR v_row_product_id IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'participation % is not on product %',
      p_participation_id, p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT product_type INTO v_product_type
    FROM public.products WHERE id = p_product_id;
  IF v_product_type = 'consumer_club' THEN
    RAISE EXCEPTION 'admin removal is not supported for consumer clubs'
      USING ERRCODE = 'check_violation';
  END IF;

  -- family_subscriptions.participation_id is UNIQUE and stripe_subscription_id
  -- is NOT NULL, so the mere existence of a row means a live Stripe sub is
  -- linked to this participation.
  SELECT stripe_subscription_id INTO v_live_sub
    FROM public.family_subscriptions
    WHERE participation_id = p_participation_id;
  IF v_live_sub IS NOT NULL THEN
    RAISE EXCEPTION
      'participation % still has live Stripe subscription %',
      p_participation_id, v_live_sub
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  RETURN public.cancel_participation(p_participation_id, 'admin_cancelled');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_remove_participation(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_remove_participation(uuid, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_remove_participation(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.admin_remove_participation(uuid, uuid) IS
  'Admin-gated un-enrollment. Refuses a participation that is not on the named product, a consumer_club product, or a participation with a live Stripe subscription; otherwise delegates to cancel_participation.';
