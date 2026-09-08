-- An admin moves a subscribed seat to another club.
--
-- WHY
--
-- A family changes its mind about a consumer club. Switching is deliberately not
-- a parent-facing feature, so support asks an admin, and the admin does it by
-- hand today: edit the subscription in the Stripe dashboard, then edit the
-- participation row. Two systems, money in one of them, no lock, and no record
-- beyond the admin's memory. This migration is the database half of the one
-- admin action that replaces both edits — the Stripe half is a plan change made
-- by the route above it, which passes the target club's canonical price id in.
--
-- WHAT THIS ADDS
--
-- Two functions.
--
-- `is_subscription_shaped` is the SQL twin of the predicate the admin groups
-- panel and the checkout route already ask in TypeScript: is this the one
-- product shape whose active seat cannot exist without a monthly Stripe
-- subscription? It exists so the mover below can ask that question by NAME
-- rather than re-spelling a `product_type` comparison, which is how the two
-- languages start disagreeing. Granted to nobody, for the reasons `is_no_charge`
-- (00206) is granted to nobody.
--
-- `admin_move_participation` repoints one active, subscribed participation at
-- another club and stamps the subscription row with the price the route has
-- already moved the Stripe subscription onto. The row is UPDATEd rather than
-- deleted and recreated, so the subscription row's unique cascading foreign key
-- and the seat's payment marker travel with it.
--
-- WHAT IT DELIBERATELY DOES NOT ENFORCE
--
-- Seat cap, age range, region lock, product status and required consents are all
-- unchecked here. Admins are trusted, and the panel raises each of these as a
-- warning on the target picker in exactly the posture it takes when an admin
-- promotes over capacity. What stays hard is what money depends on: the seat
-- must be active, it must carry a live subscription, and the target must be a
-- paid subscription club — anything else has no subscription to move, and this
-- function creates none.
--
-- The unique index over (product_id, participant_id) for active / waitlisted /
-- completed rows is NOT pre-checked. A child who once completed the target club
-- collides on it, and the index firing as 23505 is the correct answer; the commit
-- route pre-flights that collision with a plain read before it touches Stripe, so
-- the index is a race guard rather than the first line of defence.

-- ---------------------------------------------------------------------------
-- The subscription-shaped product
-- ---------------------------------------------------------------------------
--
-- Lockstep: the same predicate exists in TypeScript as `isSubscriptionShaped` in
-- src/lib/constants/billing.ts, beside `isNoChargeBillingMode` and its own SQL
-- twin. The two are one rule in two languages — widen one and you must widen the
-- other in the same change, or the admin panel and the database start
-- disagreeing about which products can be switched between.

CREATE FUNCTION public.is_subscription_shaped(p_type public.product_type, p_mode public.billing_mode) RETURNS boolean
    LANGUAGE sql
    IMMUTABLE
    PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT p_type = 'consumer_club' AND p_mode = 'paid';
$$;

COMMENT ON FUNCTION public.is_subscription_shaped(public.product_type, public.billing_mode) IS
  'Whether an active seat on this product cannot exist without a monthly Stripe subscription: true for a consumer club that charges, false for everything else. Every other shape is either no-charge or paid once — out of band or through Checkout — so an admin action on it leaves no recurring charge unaccounted for. The named home of the question admin_move_participation asks of a switch target and admin_enroll_participant refuses on. Kept in lockstep with isSubscriptionShaped in src/lib/constants/billing.ts, which the admin groups panel reads to decide whether to offer comp-enrollment and whether a promotion needs the never-paid dialog.';

-- Deliberately granted to nobody, exactly as is_no_charge (00206) is. Its only
-- caller is SECURITY DEFINER and so runs as the definer, which needs no
-- caller-side EXECUTE — and withholding the grant is what keeps it out of the
-- Data API entirely: a function reachable by `authenticated` would have to be
-- classified in the DB test suite's authorization spine, and a pure total
-- predicate has no authorization story to tell. The REVOKE is not decoration: a
-- freshly created function comes back PUBLIC-executable, which would publish it
-- through PostgREST to `anon` without anyone writing a GRANT.
REVOKE EXECUTE ON FUNCTION public.is_subscription_shaped(public.product_type, public.billing_mode) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- The move
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.admin_move_participation(p_participation_id uuid, p_target_product_id uuid, p_stripe_price_id text) RETURNS jsonb
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
  SELECT stripe_subscription_id
    INTO v_live_sub
    FROM public.family_subscriptions
   WHERE participation_id = p_participation_id
     AND status <> 'cancelled';
  IF v_live_sub IS NULL THEN
    RAISE EXCEPTION 'participation % has no live subscription to move',
      p_participation_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
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

  -- THE SHARED PLACEMENT RULE (00206), applied to the TARGET. A no-charge
  -- product with exactly one group has no placement decision left in it;
  -- anything else lands in the unassigned inbox. A paid target — which the
  -- refusal above has just guaranteed — therefore always resolves to NULL, and
  -- the rule is written out anyway rather than short-circuited to NULL, so
  -- placement stays ONE rule with one home instead of two that agree today.
  -- LIMIT 2 because the question is "exactly one?", not "how many?".
  IF public.is_no_charge(v_target_mode) THEN
    SELECT CASE WHEN count(*) = 1 THEN (array_agg(g.id))[1] END
      INTO v_group_id
      FROM (
        SELECT id FROM public.product_groups
         WHERE product_id = p_target_product_id
         LIMIT 2
      ) g;
  END IF;

  -- The whole write. `signed_up_at` and `stripe_checkout_session_id` are
  -- untouched on purpose: the family bought this seat when they bought it, and
  -- the payment marker travels with the row. group_joined_at is absent for the
  -- reason it is absent from every other writer — the BEFORE UPDATE trigger
  -- stamps it from group_id, and the table comment forbids writing it by hand.
  --
  -- Nothing group-scoped travels either: attendance marks, creations and feed
  -- history belong to the old group and stay there, exactly as after an admin
  -- demote-and-promote.
  --
  -- If the participant already holds a row on the target in any status the
  -- partial unique index covers — active, waitlisted or completed — this raises
  -- 23505, which is the answer. See the header.
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

COMMENT ON FUNCTION public.admin_move_participation(uuid, uuid, text) IS
  'Admin-gated club switch, database half: repoints one ACTIVE, SUBSCRIBED '
  'participation at another paid consumer club and stamps its family_subscriptions '
  'row with the price id the route has already moved the Stripe subscription onto. '
  'Guard-first on assert_admin. Locks BOTH product rows in one statement ordered by '
  'id, which is what stops two admins switching in opposite directions from '
  'deadlocking. Five refusals, each with its own errcode so the route can map them: '
  'the participation or the target product does not exist (no_data_found); the target '
  'IS the source, the seat is not active, or the target is not a paid '
  'subscription-shaped club (check_violation); the seat carries no live subscription — '
  'a family_subscriptions row whose status is anything but cancelled, the same '
  'predicate admin_remove_participation refuses ON (object_not_in_prerequisite_state). '
  'Seat cap, age range, region lock, product status and required consents are '
  'deliberately NOT enforced: admins are trusted and the panel raises each as a '
  'picker warning, in the posture it already takes when an admin promotes over '
  'capacity. The already-on-the-target collision is not pre-checked either — the '
  'partial unique index over active/waitlisted/completed rows raises 23505 and the '
  'commit route pre-flights it with a plain read before touching Stripe. The row is '
  'UPDATEd rather than deleted and recreated, so the subscription row''s unique '
  'cascading foreign key and the seat''s payment marker travel with it; signed_up_at '
  'and stripe_checkout_session_id are untouched, and group placement is resolved by '
  'the shared rule (00206) applied to the target, which for a paid target is always '
  'the unassigned inbox.';

REVOKE EXECUTE ON FUNCTION public.admin_move_participation(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_move_participation(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_move_participation(uuid, uuid, text) TO service_role;
