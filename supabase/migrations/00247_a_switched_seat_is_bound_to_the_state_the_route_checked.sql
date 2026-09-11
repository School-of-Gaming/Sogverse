-- A switched seat is bound to the state the route checked.
--
-- WHY
--
-- The commit route checks every refusal with plain reads, then moves the Stripe
-- subscription, then calls this function. Between the check and the call the
-- seat can move: another admin switches the same participation, or a support
-- action re-prices its subscription. Until now this function would happily
-- carry out the move anyway — it re-reads the seat itself, so it cannot tell a
-- seat that is where the route left it from one that has since been moved
-- somewhere else and is now being dragged back by a stale dialog. The cost of
-- that is not an odd row: it is a subscription billing for one club while the
-- seat sits on another, which is the exact state this whole feature exists to
-- stop being created by hand.
--
-- WHAT CHANGES
--
-- Two new REQUIRED arguments, `p_expected_source_product_id` and
-- `p_expected_stripe_price_id`, carry the state the route's check actually
-- read. Under the product locks and before any write, the function compares
-- them with what it finds and refuses with check_violation when either has
-- moved:
--
--   * 'the seat has moved'   — the participation is no longer on the product
--                              the check read it on.
--   * 'the price has changed' — the live subscription row's stripe_price_id is
--                              no longer the one the check read.
--
-- Both wordings are load-bearing: the route matches on those substrings to word
-- a 409 that tells the admin the money has moved and the state has to be read
-- in Stripe, rather than inviting a press that can only make it worse.
--
-- `p_group_id uuid DEFAULT NULL` keeps its meaning and stays LAST, because a
-- defaulted argument has to trail the required ones. The argument list changes,
-- so the function is DROPped and recreated, and with it every grant and the
-- comment. A recreated function comes back PUBLIC-executable (observed on
-- staging during 00172), so the REVOKE is re-issued and is load-bearing, not
-- boilerplate.

DROP FUNCTION public.admin_move_participation(uuid, uuid, text, uuid);

CREATE FUNCTION public.admin_move_participation(p_participation_id uuid, p_target_product_id uuid, p_stripe_price_id text, p_expected_source_product_id uuid, p_expected_stripe_price_id text, p_group_id uuid DEFAULT NULL) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_source_product_id uuid;
  v_status            public.participation_status;
  v_locked            integer;
  v_target_type       public.product_type;
  v_target_mode       public.billing_mode;
  v_live_sub          text;
  v_live_price        text;
  v_group_id          uuid;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id, status
    INTO v_source_product_id, v_status
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'participation % does not exist', p_participation_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Refused BEFORE the lock below, not after: the lock reads both products in
  -- one `IN` list, and a target equal to the source collapses that list to a
  -- single row — which would surface as "the target does not exist" and send an
  -- admin looking for a missing product instead of telling them the seat is
  -- already there.
  IF p_target_product_id = v_source_product_id THEN
    RAISE EXCEPTION 'participation % is already on product % — a move needs a different target (same product)',
      p_participation_id, p_target_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- BOTH product rows, locked in ONE statement ORDERED BY id. Two admins
  -- switching in opposite directions (a seat from A to B while another goes from
  -- B to A) take the same two locks; taking them in the order the ids sort in
  -- means both transactions queue on the same row first, so one waits rather
  -- than the pair deadlocking. The order is the whole point of the ORDER BY —
  -- it is not a presentation choice and must not be dropped.
  --
  -- The source is locked as well as the target because the seat leaves it: its
  -- seat counts and its group list are read by every other participation writer
  -- under this same lock.
  SELECT count(*)
    INTO v_locked
    FROM (
      SELECT id
        FROM public.products
       WHERE id IN (v_source_product_id, p_target_product_id)
       ORDER BY id
         FOR UPDATE
    ) locked;
  -- The source exists by foreign key, so a missing row can only be the target.
  IF v_locked < 2 THEN
    RAISE EXCEPTION 'target product % does not exist', p_target_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- THE SEAT, RE-READ UNDER THE LOCKS, against what the route's check saw. The
  -- read above happened before the locks were held, so this is the first look
  -- at the seat nothing can change underneath. A mismatch means the seat moved
  -- between the check and here — a second admin, or a stale dialog pressed
  -- after the seat has already been switched back — and the money has by then
  -- been moved by the caller, so refusing loudly is the only honest answer.
  SELECT product_id
    INTO v_source_product_id
    FROM public.participations
   WHERE id = p_participation_id;

  IF v_source_product_id IS DISTINCT FROM p_expected_source_product_id THEN
    RAISE EXCEPTION 'participation % is on product %, not the % the switch was checked against — the seat has moved',
      p_participation_id, v_source_product_id, p_expected_source_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'participation % is % and not active — only an active seat can be moved',
      p_participation_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- A LIVE subscription, in exactly the sense admin_remove_participation and
  -- demote_to_waitlist mean it: a family_subscriptions row whose status is
  -- anything but `cancelled`. The predicate is deliberately the same one, read
  -- from the opposite side — those two refuse BECAUSE a subscription is live,
  -- and this one refuses because none is. A seat with nothing to bill is not
  -- this function's business: an admin moves one with the panel's remove zone
  -- and a comp-enrolment on the other club, and there is no price to swap.
  SELECT stripe_subscription_id, stripe_price_id
    INTO v_live_sub, v_live_price
    FROM public.family_subscriptions
   WHERE participation_id = p_participation_id
     AND status <> 'cancelled';
  IF v_live_sub IS NULL THEN
    RAISE EXCEPTION 'participation % has no live subscription to move',
      p_participation_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  -- THE PRICE, against what the check read. `IS DISTINCT FROM` because the
  -- stored id is nullable and a null on either side is still a disagreement.
  -- What this catches is the case a Stripe idempotency key cannot: a replayed
  -- update answers the caller with the stored response of the FIRST request
  -- without touching the subscription, so a stale dialog can believe it moved
  -- a price that is no longer where it thought it was.
  IF v_live_price IS DISTINCT FROM p_expected_stripe_price_id THEN
    RAISE EXCEPTION 'subscription % is on price %, not the % the switch was checked against — the price has changed',
      v_live_sub, v_live_price, p_expected_stripe_price_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT product_type, billing_mode
    INTO v_target_type, v_target_mode
    FROM public.products
   WHERE id = p_target_product_id;

  -- Asked through the shared predicate rather than spelled out as a
  -- `product_type` comparison, so the panel's picker and this refusal cannot
  -- drift apart. The billing_mode half is stated as well as implied: the money
  -- condition is what this refusal is about, and a reader should not have to
  -- open the predicate to see it.
  IF v_target_mode <> 'paid'
     OR NOT public.is_subscription_shaped(v_target_type, v_target_mode) THEN
    RAISE EXCEPTION 'product % is not a paid subscription club — there is no subscription price to move to',
      p_target_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_group_id IS NOT NULL THEN
    -- THE ADMIN'S OWN PLACEMENT, and the one thing that has to be true about
    -- it. Read under the target's lock taken above, so the group list cannot
    -- change between this check and the write. A group of the SOURCE is the
    -- mistake this refuses in practice — the dialog is opened from the source
    -- club's panel — and writing it would leave the seat pointing at a group of
    -- a product it is not on: a state no UI can produce, which every
    -- group-scoped read (rosters, attendance, the feed) would then answer
    -- wrongly about rather than fail on.
    PERFORM 1
       FROM public.product_groups
      WHERE id = p_group_id
        AND product_id = p_target_product_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'group % is not a group of the target product % — a switched seat can only land in a group of the club it moves to',
        p_group_id, p_target_product_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_group_id := p_group_id;
  ELSE
    -- THE SHARED PLACEMENT RULE (00206), applied to the TARGET, and still the
    -- answer whenever the admin names no group. A no-charge product with
    -- exactly one group has no placement decision left in it; anything else
    -- lands in the unassigned inbox. A paid target — which the refusal above
    -- has just guaranteed — therefore always resolves to NULL, and the rule is
    -- written out anyway rather than short-circuited to NULL, so placement
    -- stays ONE rule with one home instead of two that agree today. LIMIT 2
    -- because the question is "exactly one?", not "how many?".
    IF public.is_no_charge(v_target_mode) THEN
      SELECT CASE WHEN count(*) = 1 THEN (array_agg(g.id))[1] END
        INTO v_group_id
        FROM (
          SELECT id FROM public.product_groups
           WHERE product_id = p_target_product_id
           LIMIT 2
        ) g;
    END IF;
  END IF;

  -- The whole write. The two purchase markers are untouched on purpose: the
  -- family bought this seat when they bought it, and the payment marker travels
  -- with the row. The join instant is absent for the reason it is absent from
  -- every other writer — the BEFORE UPDATE trigger stamps it from group_id, and
  -- the table comment forbids writing it by hand.
  --
  -- Nothing group-scoped travels either: attendance marks, creations and feed
  -- history belong to the old group and stay there, exactly as after an admin
  -- demote-and-promote.
  --
  -- If the participant already holds a row on the target in any status the
  -- partial unique index covers — active, waitlisted or completed — this raises
  -- 23505, which is the answer. See the header of 00245.
  UPDATE public.participations
     SET product_id = p_target_product_id,
         group_id   = v_group_id
   WHERE id = p_participation_id;

  -- The subscription row's price id, and NOTHING else on that row — its
  -- currency and its Stripe customer are properties of the subscription, which
  -- has not moved and cannot move.
  UPDATE public.family_subscriptions
     SET stripe_price_id = p_stripe_price_id
   WHERE participation_id = p_participation_id;

  RETURN jsonb_build_object(
    'participation_id',       p_participation_id,
    'source_product_id',      v_source_product_id,
    'target_product_id',      p_target_product_id,
    'group_id',               v_group_id,
    'stripe_subscription_id', v_live_sub
  );
END;
$$;

COMMENT ON FUNCTION public.admin_move_participation(uuid, uuid, text, uuid, text, uuid) IS
  'Admin-gated club switch, database half: repoints one ACTIVE, SUBSCRIBED '
  'participation at another paid consumer club and stamps its family_subscriptions '
  'row with the price id the route has already moved the Stripe subscription onto. '
  'Guard-first on assert_admin. Locks BOTH product rows in one statement ordered by '
  'id, which is what stops two admins switching in opposite directions from '
  'deadlocking. Eight refusals, each with its own errcode so the route can map them: '
  'the participation or the target product does not exist (no_data_found); the target '
  'IS the source, the seat is not active, the target is not a paid '
  'subscription-shaped club, p_group_id names a group that is not the target''s, the '
  'seat is no longer on p_expected_source_product_id (the seat has moved) or the live '
  'subscription no longer carries p_expected_stripe_price_id (the price has changed) '
  '(check_violation); the seat carries no live subscription — a family_subscriptions '
  'row whose status is anything but cancelled, the same predicate '
  'admin_remove_participation refuses ON (object_not_in_prerequisite_state). '
  'The two expected-state arguments bind the write to what the commit route actually '
  'read: Stripe replays a reused idempotency key without touching the subscription, so '
  'a stale dialog can believe it moved a price it did not, and the seat would otherwise '
  'be moved under a subscription billing for another club. '
  'p_group_id is the admin''s placement on the target, chosen in the same dialog as '
  'the move so the seat does not have to be dragged out of the unassigned inbox '
  'afterwards; omitted or NULL, placement falls to the shared rule (00206) applied to '
  'the target, which for a paid target is always that inbox. The join instant is never '
  'written here — the BEFORE UPDATE trigger stamps it from group_id. '
  'Seat cap, age range, region lock, product status and required consents are '
  'deliberately NOT enforced: admins are trusted and the panel raises each as a '
  'picker warning, in the posture it already takes when an admin promotes over '
  'capacity. The already-on-the-target collision is not pre-checked either — the '
  'partial unique index over active/waitlisted/completed rows raises 23505 and the '
  'commit route pre-flights it with a plain read before touching Stripe. The row is '
  'UPDATEd rather than deleted and recreated, so the subscription row''s unique '
  'cascading foreign key and the seat''s payment marker travel with it; the purchase '
  'timestamp and the checkout session are untouched.';

-- The whole grant set, re-issued because the DROP took the old one with it. The
-- REVOKE is the load-bearing line: a freshly created function is
-- PUBLIC-executable, which would publish an admin seat-mover to `anon` through
-- PostgREST without anyone writing a GRANT.
REVOKE EXECUTE ON FUNCTION public.admin_move_participation(uuid, uuid, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_move_participation(uuid, uuid, text, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_move_participation(uuid, uuid, text, uuid, text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Assertions
-- ---------------------------------------------------------------------------
--
-- A replacement re-asserts what the migration it supersedes established, plus
-- what it adds itself. Re-derived from the catalog here — never from a copy of
-- the file above — so a clause dropped while retyping the body fails at the
-- moment this file runs rather than in a test somebody has to think to write.

DO $$
DECLARE
  v_src  text;
  v_args text;
BEGIN
  SELECT pr.prosrc, pg_get_function_arguments(pr.oid)
    INTO v_src, v_args
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public'
     AND pr.proname = 'admin_move_participation';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'admin_move_participation is missing after being replaced';
  END IF;

  -- --- (a) The argument list, and only one function left under the name. ----
  IF position('p_expected_source_product_id uuid' IN v_args) = 0
     OR position('p_expected_stripe_price_id text' IN v_args) = 0 THEN
    RAISE EXCEPTION 'admin_move_participation does not carry both expected-state arguments — the write would not be bound to what the route checked: %', v_args;
  END IF;

  -- Required, not defaulted: a DEFAULT on either would let an old caller move a
  -- seat with no expectation at all, which is the hole this migration closes.
  IF position('p_expected_source_product_id uuid DEFAULT' IN v_args) > 0
     OR position('p_expected_stripe_price_id text DEFAULT' IN v_args) > 0 THEN
    RAISE EXCEPTION 'an expected-state argument carries a DEFAULT — it must be required: %', v_args;
  END IF;

  IF position('p_group_id uuid DEFAULT' IN v_args) = 0 THEN
    RAISE EXCEPTION 'admin_move_participation lost the DEFAULT on p_group_id — an unplaced switch would have to name a group: %', v_args;
  END IF;

  IF (SELECT count(*) FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
       WHERE n.nspname = 'public' AND pr.proname = 'admin_move_participation') <> 1 THEN
    RAISE EXCEPTION 'admin_move_participation is overloaded — the four-argument version was not dropped, and a call would be ambiguous';
  END IF;

  -- --- (b) Guard first. The authorization spine calls this RPC with all-NULL
  --         arguments and requires 42501, which only holds while assert_admin
  --         is the first statement — before any read a NULL could shortcut.
  IF position('PERFORM public.assert_admin()' IN v_src) = 0
     OR position('PERFORM public.assert_admin()' IN v_src)
        > position('FROM public.participations' IN v_src) THEN
    RAISE EXCEPTION 'admin_move_participation is not guard-first on assert_admin — the spine''s all-NULL call would reach a read before the guard';
  END IF;

  -- --- (c) The lock, and its ordering. --------------------------------------
  IF position('ORDER BY id' IN v_src) = 0
     OR position('FOR UPDATE' IN v_src) = 0 THEN
    RAISE EXCEPTION 'admin_move_participation lost its ordered FOR UPDATE lock over both products — two admins switching in opposite directions would deadlock';
  END IF;

  -- --- (d) Every refusal 00245 and 00246 established. -----------------------
  IF position('(same product)' IN v_src) = 0
     OR position('not active' IN v_src) = 0
     OR position('not a paid subscription club' IN v_src) = 0
     OR position('no live subscription to move' IN v_src) = 0
     OR position('does not exist' IN v_src) = 0
     OR position('not a group of the target' IN v_src) = 0 THEN
    RAISE EXCEPTION 'admin_move_participation lost one of its refusals — the commit route maps each of them by errcode and message';
  END IF;

  -- --- (e) The two this migration adds. Their wording is what the route reads
  --         to word a 409, so the substrings are part of the contract.
  IF position('the seat has moved' IN v_src) = 0
     OR position('the price has changed' IN v_src) = 0 THEN
    RAISE EXCEPTION 'admin_move_participation does not refuse a moved seat or a changed price — a stale dialog would move a seat under a subscription billing for another club';
  END IF;

  -- Compared with IS DISTINCT FROM, not `<>`: stripe_price_id is nullable, and
  -- `<>` against a NULL is NULL, which would let the guard pass silently.
  IF position('v_live_price IS DISTINCT FROM p_expected_stripe_price_id' IN v_src) = 0 THEN
    RAISE EXCEPTION 'the price guard is not null-safe — a NULL stored price would slip past a plain inequality';
  END IF;

  -- --- (f) Placement is still ONE rule, and still asked by name. -------------
  IF position('public.is_no_charge' IN v_src) = 0
     OR position('public.is_subscription_shaped' IN v_src) = 0 THEN
    RAISE EXCEPTION 'admin_move_participation stopped asking the shared predicates by name — that is how the SQL and TypeScript halves start disagreeing';
  END IF;

  -- --- (g) What must NOT be written. Assignments, not mentions: the body
  --         talks about all three in its comments and must assign none of them.
  IF position('group_joined_at =' IN v_src) > 0
     OR position('group_joined_at :=' IN v_src) > 0
     OR position('signed_up_at =' IN v_src) > 0
     OR position('stripe_checkout_session_id =' IN v_src) > 0 THEN
    RAISE EXCEPTION 'admin_move_participation writes a column it must leave alone — the join instant is the trigger''s, and the two purchase markers travel with the row untouched';
  END IF;

  -- --- (h) Grants survived the DROP. ----------------------------------------
  IF NOT has_function_privilege('authenticated', 'public.admin_move_participation(uuid, uuid, text, uuid, text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.admin_move_participation(uuid, uuid, text, uuid, text, uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'admin_move_participation lost an EXECUTE grant during recreation';
  END IF;

  IF has_function_privilege('anon', 'public.admin_move_participation(uuid, uuid, text, uuid, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'admin_move_participation is executable by anon — the REVOKE FROM PUBLIC did not take';
  END IF;
END $$;
