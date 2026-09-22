--
-- Name: promote_from_waitlist(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promote_from_waitlist(p_participation_id uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id  UUID;
  v_status      public.participation_status;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id, status INTO v_product_id, v_status
    FROM public.participations
    WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found' USING ERRCODE = 'P0002';
  END IF;

  -- Serialize against concurrent joins/cancels/promotions on this product.
  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- Idempotent / wrong-state: report current status without mutating.
  IF v_status <> 'waitlisted' THEN
    RETURN jsonb_build_object('kind', 'noop', 'status', v_status::text);
  END IF;

  -- A drop target group must belong to this product (NULL = unassigned inbox).
  IF p_group_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.product_groups
        WHERE id = p_group_id AND product_id = v_product_id
     ) THEN
    RAISE EXCEPTION 'group % is not in product %', p_group_id, v_product_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Give them a seat. No seat-count gate by design: promoting from a full
  -- waitlist is a deliberate admin capacity override. waitlisted_at cleared so
  -- they leave the waitlist ordering. The uq_participations_active_or_waitlisted
  -- index already guaranteed no other in-set row exists for this (product,gamer).
  --
  -- The two offer stamps go with it (00207). An admin dragging a row that
  -- carries a live offer is answering it on the family's behalf — granting
  -- exactly the seat the offer asked about — so the offer is over, and the
  -- emailed link stops validating on its own because it no longer matches. The
  -- clear is unconditional rather than guarded: the CHECK forbids an offer
  -- stamp on a non-waitlisted row, so leaving one behind would fail this very
  -- UPDATE.
  UPDATE public.participations
     SET status = 'active',
         group_id = p_group_id,
         waitlisted_at = NULL,
         seat_offer_sent_at = NULL,
         seat_offer_expiry_notified_at = NULL
   WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind', 'promoted',
    'participation_id', p_participation_id,
    'product_id', v_product_id,
    'group_id', p_group_id
  );
END;
$$;


--
-- Name: FUNCTION promote_from_waitlist(p_participation_id uuid, p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.promote_from_waitlist(p_participation_id uuid, p_group_id uuid) IS 'Admin-gated promotion of a waitlisted participation into a seat, under the product gate lock. No seat-count gate by design — promoting from a full waitlist is a deliberate capacity override. Clears waitlisted_at so the row leaves the queue ordering, and since 00207 clears the two seat-offer stamps with it: an admin dragging an invited row is honouring that offer by hand, which ends it, and the emailed link stops validating on its own because it no longer matches the row. The clear is unconditional because the CHECK forbids an offer stamp on a non-waitlisted row.';


--
-- Name: FUNCTION promote_from_waitlist(p_participation_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.promote_from_waitlist(p_participation_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.promote_from_waitlist(p_participation_id uuid, p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.promote_from_waitlist(p_participation_id uuid, p_group_id uuid) TO service_role;


