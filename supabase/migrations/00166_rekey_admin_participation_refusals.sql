-- 00166: three admin refusals stop asking about the product TYPE and start
-- asking about the thing they were protecting; the groups snapshot carries the
-- answer to the one that cannot be answered client-side.
--
-- WHY. Consumer clubs are about to become free-or-paid, so "consumer_club" is
-- no longer a synonym for "subscription-billed". Three admin RPCs refuse that
-- type outright, and every one of them would wrongly block a *free* club:
--
--   demote_to_waitlist          refuses a consumer club
--   admin_remove_participation  refuses a consumer club (then refuses a live sub)
--   admin_enroll_gamer          refuses a consumer club
--
-- Each refusal is re-keyed to what it actually protects.
--
-- 1. demote_to_waitlist -> refuse a LIVE SUBSCRIPTION, on any type.
--
--    This is the load-bearing one, and it is a parent-path integrity rule
--    rather than an admin-trust one, which is why it stays in the database.
--    A waitlisted row can be deleted by the parent through the self-service
--    leave affordance; family_subscriptions.participation_id is ON DELETE
--    CASCADE, so that delete would take the subscription row with it and leave
--    Stripe billing a family the database no longer knows about. Demotion was
--    the only way to produce a waitlisted row carrying a subscription, so
--    refusing it at the demote is what closes the hole — and it closes it for
--    a paid camp that somehow acquired a subscription too, which the old
--    type-keyed test never did.
--
--    The predicate is admin_remove_participation's, verbatim: participation_id
--    is UNIQUE on family_subscriptions and stripe_subscription_id is NOT NULL,
--    so the row's existence IS the live subscription. The ERRCODE is that
--    function's as well (object_not_in_prerequisite_state / 55000), so one
--    condition raises one code however it is reached and a route can map it
--    once.
--
--    It keeps its position ABOVE the already-waitlisted noop, where the type
--    refusal sat. The reason is unchanged: this refuses the OPERATION, not the
--    row's current state. A subscribed row that is somehow already waitlisted
--    is a state that should not exist, and answering "noop" to it would be the
--    function quietly agreeing with it.
--
-- 2. admin_remove_participation -> drop the type refusal, keep the sub one.
--
--    Without this no family could ever leave a free club: free enrollment has
--    no parent-facing cancel (there is no subscription to cancel), so admin
--    removal is the only exit, and a hard-capped free club could never free a
--    seat. The live-sub refusal underneath was already the real rule — it is
--    what the type check was standing in for — and it is untouched.
--
-- 3. admin_enroll_gamer -> refuse only consumer_club AND billing_mode='paid'.
--
--    That pair is the one combination whose seat REQUIRES a Stripe
--    subscription, which comp-enrollment cannot create; a seat written without
--    one is a member who is billed nothing forever with no record of why.
--    Every other shape — free clubs now included — is exactly the free camp
--    and free event this RPC has always been allowed to write.
--
-- WHY THE SNAPSHOT GROWS A FIELD. The admin groups panel wants to explain the
-- demote refusal in a dialog BEFORE the drag writes anything, and it renders
-- every participation on the product at once. Asking per row is an N+1 against
-- a table the panel already has a natural join to, so the flag rides along in
-- the snapshot the panel already reads. It is added in all THREE places the
-- function builds a participation object — grouped, unassigned, waitlist — so
-- the zod contract keeps ONE required shape rather than a union of two. On the
-- waitlist branch it is a constant false: under rule 1 above, a waitlisted row
-- carrying a live subscription is precisely the state the database now refuses
-- to create, so reading the table there would only ever confirm it.
--
-- The join is a LEFT JOIN rather than a correlated EXISTS because
-- family_subscriptions.participation_id is UNIQUE — it cannot fan the row set
-- out — and it is indexed.
--
-- WHY THESE ARE `CREATE OR REPLACE`. Every signature is unchanged, so each
-- function keeps its OID, its ACL and its authorization-spine classification
-- (all four remain admin-gated with `PERFORM public.assert_admin();` as their
-- first statement). The grants below are re-issued anyway — the house rule is
-- that a migration says out loud who may execute what it wrote, and an
-- idempotent GRANT is cheaper than a claim nobody checks. The DO block at the
-- foot then asserts the end state that a REPLACE cannot restate: that the
-- type-keyed refusals are gone from the source, and that anon still holds
-- nothing.
--
-- WHAT IS DELIBERATELY NOT HERE. No guard is added to promote_from_waitlist.
-- Promoting an unpaid family onto a paid product is an admin-trust decision
-- handled by a dialog in the groups panel, not a database rule: unlike the
-- demote case there is no parent-reachable path that can turn it into an
-- orphaned subscription, so there is nothing here for the database to protect.

-- ---------------------------------------------------------------------------
-- 1. demote_to_waitlist — the live-subscription refusal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demote_to_waitlist(p_participation_id uuid)
RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id UUID;
  v_status     public.participation_status;
  v_live_sub   TEXT;
  v_now        TIMESTAMPTZ;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id, status INTO v_product_id, v_status
    FROM public.participations
    WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found' USING ERRCODE = 'P0002';
  END IF;

  -- The product gate lock, as before. The product's TYPE is no longer read:
  -- nothing in this function branches on it any more.
  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- family_subscriptions.participation_id is UNIQUE and stripe_subscription_id
  -- is NOT NULL, so the mere existence of a row means a live Stripe sub is
  -- linked to this participation. Demoting it would put a subscribed family on
  -- the waitlist, where the parent's own leave affordance can delete the row
  -- and CASCADE the subscription away while Stripe keeps billing.
  --
  -- Refused for the operation, not for the row's current state — so this
  -- precedes the idempotent noop below, exactly where the consumer-club
  -- refusal it replaces used to sit.
  SELECT stripe_subscription_id INTO v_live_sub
    FROM public.family_subscriptions
    WHERE participation_id = p_participation_id;
  IF v_live_sub IS NOT NULL THEN
    RAISE EXCEPTION
      'participation % still has live Stripe subscription %',
      p_participation_id, v_live_sub
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- Idempotent: already on the waitlist.
  IF v_status = 'waitlisted' THEN
    RETURN jsonb_build_object('kind', 'noop', 'status', v_status::text);
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'only an active participation can be moved to the waitlist (status: %)', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Back of the line: clock_timestamp() under the gate lock is monotonic with
  -- real ordering (00117 rule). Clear group_id — waitlisted gamers aren't grouped.
  v_now := clock_timestamp();
  UPDATE public.participations
     SET status = 'waitlisted',
         waitlisted_at = v_now,
         group_id = NULL
   WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind', 'demoted',
    'participation_id', p_participation_id,
    'product_id', v_product_id
  );
END;
$$;

COMMENT ON FUNCTION public.demote_to_waitlist(p_participation_id uuid) IS
  'Admin-gated demotion of an active participation to the back of the product waitlist, under the product gate lock. Refuses any participation carrying a live Stripe subscription, on any product type: a waitlisted row can be deleted by the parent via leave_my_waitlist_spot, which cascades family_subscriptions and orphans a subscription that keeps billing. Raised with the same errcode admin_remove_participation uses for the same condition.';

-- ---------------------------------------------------------------------------
-- 2. admin_remove_participation — the type refusal goes, the sub refusal stays
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_remove_participation(
  p_product_id uuid,
  p_participation_id uuid
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row_product_id uuid;
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

  -- family_subscriptions.participation_id is UNIQUE and stripe_subscription_id
  -- is NOT NULL, so the mere existence of a row means a live Stripe sub is
  -- linked to this participation. This is the whole rule now: the product-type
  -- check that used to sit above it was a proxy for exactly this condition, and
  -- it stopped being a correct one when clubs became free-or-paid — a free club
  -- has no other exit, so refusing removal there stranded families forever.
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

COMMENT ON FUNCTION public.admin_remove_participation(p_product_id uuid, p_participation_id uuid) IS
  'Admin-gated un-enrollment. Refuses a participation that is not on the named product, or one with a live Stripe subscription (which must be cancelled through Stripe first, or the cancel would orphan it); otherwise delegates to cancel_participation. Product type is not consulted — a free club has no parent-facing cancel, so this is its only exit.';

-- ---------------------------------------------------------------------------
-- 3. admin_enroll_gamer — refuse the subscription-shaped product, not the type
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_enroll_gamer(
  p_product_id uuid,
  p_gamer_id uuid
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_type     public.product_type;
  v_billing_mode     public.billing_mode;
  v_customer_id      uuid;
  v_participation_id uuid;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_type, billing_mode
    INTO v_product_type, v_billing_mode
    FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- The one shape whose seat cannot exist without a Stripe subscription, which
  -- comp-enrollment has no way to create. Every other combination — free clubs
  -- included, since 00166 — is the free camp and free event this function has
  -- always written.
  IF v_product_type = 'consumer_club' AND v_billing_mode = 'paid' THEN
    RAISE EXCEPTION 'admin enrollment is not supported for subscription-billed consumer clubs'
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

COMMENT ON FUNCTION public.admin_enroll_gamer(p_product_id uuid, p_gamer_id uuid) IS
  'Admin-gated comp-enrollment: drops a gamer onto a product with status=active, bypassing payment, seat caps and registration windows by design. Refuses only a paid consumer club — the one shape whose seat requires a Stripe subscription this function cannot create; free clubs enroll like any free camp or event.';

-- ---------------------------------------------------------------------------
-- 4. get_product_groups_with_details — the per-participation has-live-sub flag
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_product_groups_with_details(p_product_id uuid)
RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_groups     JSONB;
  v_unassigned JSONB;
  v_waitlist   JSONB;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(g ORDER BY g->>'created_at', g->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'email',      gp.email
                   )
                   ORDER BY ga.created_at, gp.id
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'participations', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',                       p.id,
                     'gamer_id',                 p.gamer_id,
                     'gamer_first_name',         gmp.first_name,
                     'gamer_date_of_birth',      gprof.date_of_birth,
                     'gamer_gender',             gprof.gender,
                     'gamer_minecraft_username', mca.minecraft_username,
                     'gamer_minecraft_uuid',     mca.minecraft_uuid,
                     'gamer_parent_first_name',  parent.first_name,
                     'gamer_parent_last_name',   parent.last_name,
                     'status',                   p.status,
                     'signed_up_at',             p.signed_up_at,
                     -- The demote dialog's condition, resolved server-side so
                     -- the panel needs no second round trip per chip.
                     'has_live_subscription',    (fs.id IS NOT NULL)
                   )
                   ORDER BY p.updated_at, p.id
                 )
            FROM participations p
            JOIN profiles gmp ON gmp.id = p.gamer_id
            LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
            LEFT JOIN minecraft_accounts mca ON mca.user_id = p.gamer_id
            -- participation_id is UNIQUE here, so this cannot fan the row out.
            LEFT JOIN family_subscriptions fs ON fs.participation_id = p.id
            LEFT JOIN LATERAL (
              SELECT pp.first_name, pp.last_name
                FROM parent_gamer pgm
                JOIN profiles pp ON pp.id = pgm.parent_id
               WHERE pgm.gamer_id = p.gamer_id
               ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
               LIMIT 1
            ) parent ON true
           WHERE p.group_id = pg.id
             AND p.status = 'active'
        ), '[]'::jsonb)
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                       p.id,
             'gamer_id',                 p.gamer_id,
             'gamer_first_name',         gmp.first_name,
             'gamer_date_of_birth',      gprof.date_of_birth,
             'gamer_gender',             gprof.gender,
             'gamer_minecraft_username', mca.minecraft_username,
             'gamer_minecraft_uuid',     mca.minecraft_uuid,
             'gamer_parent_first_name',  parent.first_name,
             'gamer_parent_last_name',   parent.last_name,
             'status',                   p.status,
             'signed_up_at',             p.signed_up_at,
             'has_live_subscription',    (fs.id IS NOT NULL)
           )
           ORDER BY p.updated_at, p.id
         ), '[]'::jsonb)
    INTO v_unassigned
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.gamer_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.gamer_id
    LEFT JOIN family_subscriptions fs ON fs.participation_id = p.id
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.gamer_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.group_id IS NULL
     AND p.status = 'active';

  -- Waitlist: same detail shape as `unassigned`, but ordered by the derived
  -- waitlist key (waitlisted_at, id). Position is the array index + 1, computed
  -- client-side — never stored. waitlisted_at drives ORDER BY but is omitted
  -- from the object so the row shape stays identical to a group/unassigned chip.
  --
  -- has_live_subscription is a CONSTANT false here rather than a read. Since
  -- 00166 demote_to_waitlist refuses a subscribed participation, so a waitlisted
  -- row carrying a live subscription is a state the database will not create;
  -- the field exists on this branch only so the shape stays one object, and the
  -- panel's demote dialog never asks it of a row that is already waitlisted.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                       p.id,
             'gamer_id',                 p.gamer_id,
             'gamer_first_name',         gmp.first_name,
             'gamer_date_of_birth',      gprof.date_of_birth,
             'gamer_gender',             gprof.gender,
             'gamer_minecraft_username', mca.minecraft_username,
             'gamer_minecraft_uuid',     mca.minecraft_uuid,
             'gamer_parent_first_name',  parent.first_name,
             'gamer_parent_last_name',   parent.last_name,
             'status',                   p.status,
             'signed_up_at',             p.signed_up_at,
             'has_live_subscription',    FALSE
           )
           ORDER BY p.waitlisted_at, p.id
         ), '[]'::jsonb)
    INTO v_waitlist
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.gamer_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.gamer_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.gamer_id
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.gamer_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.status = 'waitlisted';

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'groups',     v_groups,
    'unassigned', v_unassigned,
    'waitlist',   v_waitlist
  );
END;
$$;

COMMENT ON FUNCTION public.get_product_groups_with_details(p_product_id uuid) IS
  'Admin-gated snapshot behind the product Groups panel: groups with their gedus and active members, the unassigned actives, and the waitlist in derived (waitlisted_at, id) order. Every participation object carries the same fields, including has_live_subscription — the condition behind the demote dialog, resolved here so the panel does not ask per chip. It is a constant false on the waitlist branch, because demote_to_waitlist refuses to create such a row.';

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
--
-- Unchanged signatures mean CREATE OR REPLACE kept every ACL, but a migration
-- states who may execute what it wrote rather than relying on that.

GRANT EXECUTE ON FUNCTION public.demote_to_waitlist(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.demote_to_waitlist(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_remove_participation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_participation(uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_enroll_gamer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_enroll_gamer(uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Assert the end state
-- ---------------------------------------------------------------------------
--
-- Source-level, not behavioural: migrations run against a schema with no rows,
-- so there is no subscribed participation here to demote and a behavioural
-- probe would pass on the un-migrated function as readily as on this one. The
-- behaviour is pinned where fixtures exist — tests/db/waitlist-admin.test.ts
-- and tests/db/admin-participation-rpcs.test.ts. What IS worth asserting here
-- is the thing a replace can silently fail to do: leave the old type-keyed
-- refusal standing because an edit landed in the wrong copy of a long body.
--
-- All four also have to keep opening with the guard, or the authorization
-- spine's static check fails on the next CI run rather than here.

DO $$
DECLARE
  v_src TEXT;
  v_key TEXT;
BEGIN
  v_src := (SELECT prosrc FROM pg_catalog.pg_proc
             WHERE oid = 'public.demote_to_waitlist(uuid)'::regprocedure);
  IF v_src LIKE '%not supported for consumer clubs%' THEN
    RAISE EXCEPTION 'demote_to_waitlist still refuses consumer clubs by type';
  END IF;
  IF v_src NOT LIKE '%family_subscriptions%' THEN
    RAISE EXCEPTION 'demote_to_waitlist does not check for a live subscription';
  END IF;

  v_src := (SELECT prosrc FROM pg_catalog.pg_proc
             WHERE oid = 'public.admin_remove_participation(uuid, uuid)'::regprocedure);
  IF v_src LIKE '%consumer_club%' THEN
    RAISE EXCEPTION 'admin_remove_participation still refuses consumer clubs by type';
  END IF;
  IF v_src NOT LIKE '%family_subscriptions%' THEN
    RAISE EXCEPTION 'admin_remove_participation lost its live-subscription refusal';
  END IF;

  v_src := (SELECT prosrc FROM pg_catalog.pg_proc
             WHERE oid = 'public.admin_enroll_gamer(uuid, uuid)'::regprocedure);
  IF v_src NOT LIKE '%billing_mode%' THEN
    RAISE EXCEPTION 'admin_enroll_gamer still refuses consumer clubs regardless of billing';
  END IF;

  -- Counted, not merely present: the field has to appear in ALL THREE
  -- participation objects or the zod contract's one required shape is a lie for
  -- whichever branch was missed. The needle carries the quote and the comma so
  -- it matches jsonb keys only, never the prose about them.
  v_src := (SELECT prosrc FROM pg_catalog.pg_proc
             WHERE oid = 'public.get_product_groups_with_details(uuid)'::regprocedure);
  v_key := '''has_live_subscription'',';
  IF (length(v_src) - length(replace(v_src, v_key, ''))) / length(v_key) <> 3 THEN
    RAISE EXCEPTION
      'get_product_groups_with_details must carry has_live_subscription in all three participation objects (grouped, unassigned, waitlist)';
  END IF;
END;
$$;

DO $$
DECLARE
  v_signature TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.demote_to_waitlist(uuid)',
    'public.admin_remove_participation(uuid, uuid)',
    'public.admin_enroll_gamer(uuid, uuid)',
    'public.get_product_groups_with_details(uuid)'
  ] LOOP
    -- The spine requires the guard to be the FIRST statement; asserting its
    -- presence here catches a body pasted without it, and the spine's own
    -- static check catches it having drifted below something else.
    IF (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = v_signature::regprocedure)
       NOT LIKE '%PERFORM public.assert_admin();%' THEN
      RAISE EXCEPTION '% lost its admin guard across the replace', v_signature;
    END IF;

    IF NOT pg_catalog.has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated cannot execute %', v_signature;
    END IF;
    IF NOT pg_catalog.has_function_privilege('service_role', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role cannot execute %', v_signature;
    END IF;
    IF pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE') THEN
      RAISE EXCEPTION '% is reachable by anon', v_signature;
    END IF;
  END LOOP;
END;
$$;
