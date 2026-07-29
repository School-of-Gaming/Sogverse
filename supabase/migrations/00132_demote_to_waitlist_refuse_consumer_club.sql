-- demote_to_waitlist must refuse consumer clubs, the guard its two siblings
-- (admin_enroll_gamer, admin_remove_participation) have carried since 00124.
--
-- WHY THIS MATTERS NOW
--
-- 00131 gave a parent leave_my_waitlist_spot, which DELETEs the participation
-- row. `family_subscriptions.participation_id` is the only FK pointing at
-- `participations` and it is ON DELETE CASCADE, so deleting a waitlisted row
-- that carries a live Stripe subscription would silently drop the DB's only
-- record of that subscription while Stripe keeps billing the family.
--
-- The constraint is not "paid" but "requires a subscription": consumer_club is
-- the only product type billed as a recurring subscription (camps and events
-- are single payments, municipality clubs are invoiced off-platform), so it is
-- the only type whose participation rows ever have a family_subscriptions row.
--
-- Joining a waitlist never creates a subscription — a waitlisted family has not
-- paid for anything. So the ONLY way to produce a waitlisted row holding a live
-- subscription is to take an ALREADY-ACTIVE consumer-club member, who does have
-- one, and move them onto the waitlist. That is exactly what this function did,
-- and it was the last unguarded route to the state. With it refused, a
-- subscription-bearing waitlisted row cannot exist, and leave_my_waitlist_spot
-- needs no subscription check of its own — the check would be dead code
-- asserting an invariant this guard already establishes.
--
-- The admin groups panel already hides the waitlist drop target for consumer
-- clubs, so nothing that exists today calls this path. That is a UI affordance
-- though, not enforcement: a rule that only applies to callers who came through
-- the drag handler is not a rule the database holds.
--
-- CREATE OR REPLACE preserves the existing grants (authenticated + service_role
-- from 00118), so this migration adds none. Body copied from schema.sql per
-- supabase/CLAUDE.md; the only changes are the product-type read and the
-- refusal.

CREATE OR REPLACE FUNCTION public.demote_to_waitlist(p_participation_id uuid)
  RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $$
DECLARE
  v_product_id   UUID;
  v_product_type public.product_type;
  v_status       public.participation_status;
  v_now          TIMESTAMPTZ;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id, status INTO v_product_id, v_status
    FROM public.participations
    WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found' USING ERRCODE = 'P0002';
  END IF;

  -- Same product-gate lock as before, now also reading the type it needs one
  -- statement later rather than issuing a second query for it.
  SELECT product_type INTO v_product_type
    FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- Refused for the operation, not for the row's current state — so this
  -- precedes the idempotent noop below, the way both siblings refuse a consumer
  -- club before looking at anything else. There is no demotion of a consumer
  -- club that is correct to perform, retried or otherwise.
  IF v_product_type = 'consumer_club' THEN
    RAISE EXCEPTION 'demotion to the waitlist is not supported for consumer clubs'
      USING ERRCODE = 'check_violation';
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

COMMENT ON FUNCTION public.demote_to_waitlist(uuid) IS
  'Admin-gated demotion of an active participation to the back of the product waitlist, under the product gate lock. Refuses consumer clubs: those are the only subscription-billed type, and a waitlisted row carrying a live Stripe subscription could be deleted by the parent via leave_my_waitlist_spot, cascading family_subscriptions and orphaning the subscription.';
