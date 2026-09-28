--
-- Name: leave_my_waitlist_spot(uuid); Type: FUNCTION; Schema: public; Owner: -
--

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


--
-- Name: FUNCTION leave_my_waitlist_spot(p_participation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) IS 'Give up a waitlist spot. Authorized to the purchasing parent (customer_id = auth.uid()); refuses any row that is not still waitlisted, under the product gate lock. Deletes the row, matching cancel_participation.';


--
-- Name: FUNCTION leave_my_waitlist_spot(p_participation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.leave_my_waitlist_spot(p_participation_id uuid) TO service_role;


