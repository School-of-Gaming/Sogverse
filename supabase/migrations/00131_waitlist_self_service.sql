-- Waitlist: the parent/gamer side. Two self-scoping RPCs behind the dashboard
-- waitlist band, which until now had no data layer at all — the dashboard read
-- is filtered to status='active', so a waitlisted row reached neither /parent
-- nor /gamer.
--
-- 1. get_my_waitlist_positions() -> (participation_id, waitlist_position)
--    The set-valued sibling of 00118's get_waitlist_position. The dashboard
--    lists every waitlisted row the viewer is party to, so calling the
--    single-row function per card would be an N+1 whose answers are also read
--    at N different instants: an admin promotion landing mid-loop turns one
--    card's position into NULL while its neighbours keep a position derived
--    from the queue as it was a moment earlier. One STABLE call answers for the
--    whole list off a single snapshot.
--
--    SECURITY DEFINER for the same reason the single-row function is: a
--    position is a count of rows the caller's RLS hides. It takes no argument,
--    is keyed to auth.uid() on both owner columns, and returns only (a row the
--    caller is party to, an integer) — so there is nothing to authorize beyond
--    the key itself, and no argument a caller could aim at another family.
--
-- 2. leave_my_waitlist_spot(participation) -> jsonb
--    The backend behind the waitlist card's corner badge, which shipped with no
--    route behind it. cancel_participation is the wrong tool as it stands: it is
--    service_role-only and authorizes no caller at all (any id -> delete). This
--    one is keyed to customer_id = auth.uid(), refuses anything that is not
--    still 'waitlisted', and runs under the product gate lock like every other
--    waitlist transition (00116-00119).
--
--    Customer-only on purpose, matching the card: the badge does not render for
--    audience='gamer', because giving up a place in line is a decision for the
--    adult who joined it. A gamer's call matches no row keyed to their uid and
--    comes back 'not_found', the same answer a stranger's id gets.
--
--    It DELETEs, matching cancel_participation — the open question TODO.md
--    raised. participation_status has no terminal member ('reserving' |
--    'active' | 'waitlisted' | 'completed'), so keeping a record that the family
--    once wanted this product would mean a new enum value plus every seat-count
--    rollup, RLS predicate and partial index that reads status. That is a much
--    larger change than this affordance justifies, and nothing in the product
--    reads such a history today.

-- 1. Every waitlist position the caller is party to, in one snapshot.
CREATE FUNCTION public.get_my_waitlist_positions() RETURNS TABLE(participation_id uuid, waitlist_position integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT mine.id,
         -- Same derivation as join_waitlist and get_waitlist_position: count the
         -- waitlisted rows ordered at-or-before this one by (waitlisted_at, id).
         -- Recomputed live, so it shrinks as people ahead of them leave.
         -- waitlisted_at is never NULL on a waitlisted row
         -- (chk_participations_waitlisted_has_timestamp), so neither comparison
         -- can go three-valued and swallow a peer.
         (SELECT COUNT(*)::INTEGER
            FROM public.participations peer
           WHERE peer.product_id = mine.product_id
             AND peer.status = 'waitlisted'::public.participation_status
             AND (peer.waitlisted_at < mine.waitlisted_at
                  OR (peer.waitlisted_at = mine.waitlisted_at
                      AND peer.id <= mine.id)))
    FROM public.participations mine
   WHERE mine.status = 'waitlisted'::public.participation_status
     AND (mine.customer_id = (SELECT auth.uid())
          OR mine.gamer_id = (SELECT auth.uid()));
$$;

COMMENT ON FUNCTION public.get_my_waitlist_positions() IS 'Every waitlist position the caller is party to (purchasing parent or the gamer), in one snapshot. SECURITY DEFINER to count past the caller''s RLS; returns only their own participation ids and an integer each.';

-- 2. Give up a waitlist spot the caller purchased.
CREATE FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid        UUID;
  v_product_id UUID;
  v_status     public.participation_status;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('kind', 'not_found');
  END IF;

  -- Keyed to the purchasing parent rather than to the row's existence: a row
  -- belonging to someone else is answered identically to one that never
  -- existed, so a probe learns nothing from which id it aims at.
  SELECT product_id, status
    INTO v_product_id, v_status
    FROM public.participations
   WHERE id = p_participation_id
     AND customer_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'not_found');
  END IF;

  -- Serialize against concurrent joins, promotions and cancels on this product,
  -- the same gate every other waitlist transition takes.
  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- Re-read under the lock. An admin promotion can land between the ownership
  -- read above and the lock; deleting then would throw away a seat the family
  -- now holds, which is emphatically not what the parent confirmed.
  SELECT status
    INTO v_status
    FROM public.participations
   WHERE id = p_participation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'not_found');
  END IF;

  IF v_status <> 'waitlisted'::public.participation_status THEN
    RETURN jsonb_build_object('kind', 'noop', 'status', v_status::text);
  END IF;

  -- The ownership predicate is repeated on the DELETE so the statement that
  -- actually mutates carries the authorization itself, rather than inheriting
  -- it from a SELECT several statements up.
  DELETE FROM public.participations
   WHERE id = p_participation_id
     AND customer_id = v_uid;

  RETURN jsonb_build_object(
    'kind', 'left',
    'participation_id', p_participation_id,
    'product_id', v_product_id
  );
END;
$$;

COMMENT ON FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) IS 'Give up a waitlist spot. Authorized to the purchasing parent (customer_id = auth.uid()); refuses any row that is not still waitlisted, under the product gate lock. Deletes the row, matching cancel_participation.';

-- Grants. Both are called from the browser by a parent (and the position read
-- by a gamer too), so `authenticated`; service_role for admin-client callers
-- and the db tests.
REVOKE ALL ON FUNCTION public.get_my_waitlist_positions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_waitlist_positions() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_waitlist_positions() TO service_role;

REVOKE ALL ON FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) TO service_role;
