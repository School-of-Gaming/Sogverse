--
-- Name: send_seat_offer(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_seat_offer(p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product        public.products;
  v_product_id     uuid;
  v_status         public.participation_status;
  v_sent_at        timestamptz;
  v_customer_id    uuid;
  v_participant_id uuid;
  v_group_count    integer;
BEGIN
  SELECT product_id INTO v_product_id
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found' USING ERRCODE = 'P0002';
  END IF;

  -- The product gate lock, the same one every other waitlist transition takes.
  -- It serializes two admins pressing Invite on the same row at once, which is
  -- what makes the live-offer test below decide the replay rather than racing.
  SELECT * INTO v_product FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- Re-read under the lock: a promotion or a leave can land between the two.
  SELECT status, seat_offer_sent_at, customer_id, participant_id
    INTO v_status, v_sent_at, v_customer_id, v_participant_id
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found' USING ERRCODE = 'P0002';
  END IF;

  -- Already moved on. Not an error: the admin is looking at a snapshot, and the
  -- panel refetches rather than arguing.
  IF v_status <> 'waitlisted'::public.participation_status THEN
    RETURN jsonb_build_object('kind', 'noop', 'status', v_status::text);
  END IF;

  -- A seat offer says "come and join us", with no invoice attached and nothing
  -- for the family to agree to beyond turning up. On a paid product that
  -- sentence would be false — accepting would seat them with no subscription
  -- behind the seat — so the offer exists only where a seat costs the family
  -- nothing: free products, and the municipality clubs we invoice the
  -- municipality for.
  --
  -- Asked through `public.is_no_charge` rather than spelled out as an IN-list,
  -- so the two-versus-paid question has ONE spelling in this database:
  -- widening the no-charge set must not leave this gate behind. None of the
  -- other seat-offer functions needs the helper (`respond_seat_offer`
  -- deliberately never reads billing mode at all — see the header — and the
  -- dashboard's live-offer read asks about offers, not about price).
  IF NOT public.is_no_charge(v_product.billing_mode) THEN
    RAISE EXCEPTION 'seat offers are only made on no-charge products'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Accepting has to place the child somewhere, and the family is never asked
  -- to choose. One group is the only arrangement where the answer is
  -- unambiguous, so it is the only arrangement that may be offered — an admin
  -- with two groups makes the placement decision themselves, by dragging.
  SELECT count(*) INTO v_group_count
    FROM public.product_groups
   WHERE product_id = v_product_id;
  IF v_group_count <> 1 THEN
    RAISE EXCEPTION 'product % has % groups; a seat offer needs exactly one',
                    v_product_id, v_group_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- A live offer already stands. Answer with the stamp that is actually on the
  -- row and flag the replay: `idempotent` is the only thing telling a
  -- double-click apart from a first send, and the mail keys on it — exactly the
  -- signal `join_waitlist` returns for the same reason. Note what it does NOT
  -- do: it does not refresh the deadline. A family looking at a mail with a
  -- date on it must not have that date moved under them by an admin pressing a
  -- button twice.
  IF v_sent_at IS NOT NULL AND v_sent_at + interval '5 days' > now() THEN
    RETURN jsonb_build_object(
      'kind',             'offered',
      'participation_id', p_participation_id,
      'product_id',       v_product_id,
      'customer_id',      v_customer_id,
      'participant_id',   v_participant_id,
      'sent_at',          v_sent_at,
      'idempotent',       TRUE
    );
  END IF;

  -- No offer, or an expired one. An expired offer is re-offerable outright: the
  -- family did not answer, the seat is still open, and asking again is the
  -- whole point. The old notification stamp goes with it, so a second silence
  -- notifies staff a second time.
  --
  -- date_trunc('milliseconds', …) — see the header. The token is signed over
  -- this instant and compared back through a JavaScript Date.
  UPDATE public.participations
     SET seat_offer_sent_at             = date_trunc('milliseconds', now()),
         seat_offer_expiry_notified_at  = NULL
   WHERE id = p_participation_id
  RETURNING seat_offer_sent_at INTO v_sent_at;

  RETURN jsonb_build_object(
    'kind',             'offered',
    'participation_id', p_participation_id,
    'product_id',       v_product_id,
    'customer_id',      v_customer_id,
    'participant_id',   v_participant_id,
    'sent_at',          v_sent_at,
    'idempotent',       FALSE
  );
END;
$$;


--
-- Name: FUNCTION send_seat_offer(p_participation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.send_seat_offer(p_participation_id uuid) IS 'Offer an open seat to one waitlisted family, under the product gate lock. Refuses anything but a no-charge product (free or external_contract) and anything but exactly one group — accepting has to place the child, and the family is never asked to choose. Stamps seat_offer_sent_at with now() truncated to MILLISECONDS, which is load-bearing: the emailed token is signed over that exact instant and compared back through a JavaScript Date, which cannot hold microseconds. Returns the stored stamp (never the caller''s idea of it) plus idempotent — false only on the call that wrote a stamp, true when a LIVE offer was already standing. The mail keys on idempotent = false, the same signal join_waitlist returns for the same reason; a replay deliberately does not refresh the deadline, because a family reading a date in their inbox must not have it moved. An EXPIRED offer is re-offerable and clears the old expiry-notification stamp with it. No EXECUTE grant to authenticated: the admin route calls it through the service-role client, having established the admin''s identity itself.';


--
-- Name: FUNCTION send_seat_offer(p_participation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.send_seat_offer(p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_seat_offer(p_participation_id uuid) TO service_role;


