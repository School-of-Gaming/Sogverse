--
-- Name: respond_seat_offer(uuid, timestamp with time zone, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamp with time zone, p_accept boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id        uuid;
  v_locked_product_id uuid;
  v_status            public.participation_status;
  v_sent_at           timestamptz;
  v_customer_id       uuid;
  v_participant_id    uuid;
  v_group_id          uuid;
  v_group_count       integer;
  v_within_window     boolean;
  v_already_notified  boolean;
BEGIN
  SELECT product_id INTO v_product_id
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'not_found');
  END IF;

  -- The same gate lock, so an admin drag-promoting this very row and a parent
  -- pressing Accept cannot both write it. The id is selected rather than any
  -- column of interest because the lock is the whole point of the statement:
  -- there is no stored status to carry back, the product's lifecycle being
  -- derived from dates nobody is racing us to write.
  SELECT id INTO v_locked_product_id
    FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- THE ONE FACT AN HONOURED INVITE ALWAYS REQUIRES: the product still exists.
  -- Everything else about the offer is grandfathered (see the header) — the
  -- terms it went out on survive an admin's edit, because we asked and they said
  -- yes. The product's own existence is not one of those terms: an invitation to
  -- something that is gone is an invitation to nothing.
  --
  -- NOT FOUND is reachable even though the participation was found a statement
  -- ago: participations.product_id cascades on delete, so a product dropped
  -- between the two takes the row with it and this lock finds nothing.
  --
  -- It answers `stale`, which is the outcome every other "this is no longer
  -- open" case already produces — deliberately not a new kind. THIS IS ALSO THE
  -- ONE REFUSAL THAT STAYS GENERIC ALL THE WAY OUT. A `stale` answer is re-read
  -- against the row by the caller, and every shape that means the offer was
  -- consumed — accepted, promoted, declined, withdrawn, superseded — resolves
  -- to `used`. A row still holding this exact offer inside its window cannot be
  -- any of those, so it is this guard that refused, and it resolves to the
  -- generic `invalid` instead.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'stale');
  END IF;

  -- The notified stamp is read HERE, in the same statement as the identifiers
  -- and for the same reason: the DELETE below takes the column with it, and
  -- after that nothing can tell whether staff were ever told this offer went
  -- unanswered. See the header for why the answer matters and why this read is
  -- deliberately unlocked.
  SELECT status,
         seat_offer_sent_at,
         customer_id,
         participant_id,
         seat_offer_expiry_notified_at IS NOT NULL
    INTO v_status, v_sent_at, v_customer_id, v_participant_id, v_already_notified
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'not_found');
  END IF;

  -- The compare-and-swap, and the whole of this feature's replay protection.
  -- Every way an offer ends moves this value: accepting clears it, declining
  -- deletes the row, re-offering replaces it. So a link, a stale tab and a
  -- second click all fail here rather than in a revocation table that does not
  -- exist. `IS DISTINCT FROM` because a NULL stamp must compare unequal to
  -- everything rather than swallow the test three-valued.
  --
  -- The status test below can only fire if the CHECK constraint has been
  -- broken, since an offer stamp cannot survive on a non-waitlisted row. It is
  -- here because a silent seat grant would be the failure mode otherwise.
  IF v_sent_at IS NULL
     OR v_sent_at IS DISTINCT FROM p_offer_sent_at
     OR v_status <> 'waitlisted'::public.participation_status THEN
    RETURN jsonb_build_object('kind', 'stale');
  END IF;

  -- The window is enforced HERE and not only in the token, because the in-app
  -- path carries no token at all: a parent pressing Accept on their My SOG card
  -- names a participation and nothing else.
  --
  -- THE WINDOW BINDS ACCEPT AND NOTHING ELSE, AND THAT ASYMMETRY IS THE POINT
  --
  -- The deadline exists to stop a seat being claimed after we have given up
  -- waiting and offered it to somebody else. Nothing about that reasoning
  -- reaches a DECLINE: a family saying "we cannot come" is giving something
  -- back, and there is no hour of the day when we would rather not know. A
  -- refusal there would be the database insisting a family keep a place they
  -- have just told us they do not want, purely because they answered late.
  --
  -- So the window is read once into a flag and tested only on the accept side.
  -- The flag rides back on the DECLINE result because the ROUTE has to tell an
  -- answer that beat the deadline from one that did not, even though the family
  -- does not. It is computed here rather than by the caller because this
  -- transaction is the only place the stamp and the clock are read together
  -- under the lock.
  v_within_window := v_sent_at + interval '5 days' > now();

  IF p_accept AND NOT v_within_window THEN
    RETURN jsonb_build_object(
      'kind',             'expired',
      'participation_id', p_participation_id,
      'product_id',       v_product_id
    );
  END IF;

  IF p_accept THEN
    -- The single group, resolved again at answer time rather than trusted from
    -- send time: an admin may have added or removed one while the family was
    -- deciding. If the answer is no longer unambiguous the seat is STILL
    -- granted and simply lands unassigned — we asked, they said yes, and a
    -- placement question is ours to sort out, not a reason to refuse them.
    SELECT count(*) INTO v_group_count
      FROM public.product_groups
     WHERE product_id = v_product_id;

    IF v_group_count = 1 THEN
      SELECT id INTO v_group_id
        FROM public.product_groups
       WHERE product_id = v_product_id;
    ELSE
      v_group_id := NULL;
    END IF;

    -- No seat-count gate, deliberately — the same capacity override
    -- promote_from_waitlist makes, with a stronger claim behind it: this seat
    -- was offered by name and accepted. A product that refilled in the meantime
    -- goes one over rather than taking back an invitation.
    UPDATE public.participations
       SET status                        = 'active'::public.participation_status,
           group_id                      = v_group_id,
           waitlisted_at                 = NULL,
           seat_offer_sent_at            = NULL,
           seat_offer_expiry_notified_at = NULL
     WHERE id = p_participation_id;

    RETURN jsonb_build_object(
      'kind',             'accepted',
      'participation_id', p_participation_id,
      'product_id',       v_product_id,
      'group_id',         v_group_id,
      'customer_id',      v_customer_id,
      'participant_id',   v_participant_id
    );
  END IF;

  -- Declining gives up the place in line, exactly as leave_my_waitlist_spot
  -- does — a family who cannot come has no queue position to keep warm, and the
  -- staff mail this triggers is what turns their answer into the next family's
  -- invitation. The identifiers are read above, before the row is gone, because
  -- the mail names all four.
  --
  -- Reachable after the window has closed as well as inside it, which is the
  -- whole of the asymmetry above. The two flags below are what tell the caller
  -- which of the two it just did AND whether anybody has already been told this
  -- offer lapsed — and after this statement neither question has an answer left
  -- anywhere, because the row that held both is gone.
  DELETE FROM public.participations WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind',             'declined',
    'participation_id', p_participation_id,
    'product_id',       v_product_id,
    'customer_id',      v_customer_id,
    'participant_id',   v_participant_id,
    'within_window',    v_within_window,
    'already_notified', v_already_notified
  );
END;
$$;


--
-- Name: FUNCTION respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamp with time zone, p_accept boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamp with time zone, p_accept boolean) IS 'A family''s answer to a seat offer, under the product gate lock. Compare-and-swap on p_offer_sent_at against the stored stamp: every way an offer ends moves that value, so a used link, a stale tab and a superseded offer all come back ''stale'' with no revocation table anywhere. The five-day window is re-checked here rather than trusted from the token, because the in-app path (a parent pressing Accept in My SOG) carries no token. THE WINDOW BINDS ACCEPT ALONE. A DECLINE succeeds for as long as the row exists, late or not: the deadline is there to stop a seat being claimed after we have offered it elsewhere, and none of that reasoning reaches a family giving a place back. THE DECLINED RESULT CARRIES TWO FLAGS AND THEY ANSWER DIFFERENT QUESTIONS. within_window says the answer beat the deadline. already_notified says seat_offer_expiry_notified_at was set when we read it — read before the DELETE, because the DELETE takes the column with it and after that nothing can tell whether staff were ever told this offer went unanswered. The caller mails on within_window OR NOT already_notified, which skips the mail only where the no-response mail demonstrably went: expiry here is OBSERVED rather than scheduled, so an offer nobody looked at between its fifth day and a late answer was never reported, and treating lateness alone as proof of notification made staff learn less from an answer than from silence. The already_notified read is deliberately not locked against a concurrent sweep — this transaction holds the product gate lock, not the participation row — so the worst case is one duplicate staff mail, which is the recoverable direction. THE PRODUCT IS RE-CHECKED BY ID ON THE LOCK: a MISSING product answers ''stale'' and grants nothing. That is the boundary of this function''s grandfathering — the TERMS the offer went out on survive an admin''s edit (the billing mode is deliberately not re-read), but the product''s own existence is not a term, and the one fact an honoured invite always requires is that the product it names still exists. A product that has merely run out of dates is NOT guarded: it still exists and nothing has been withdrawn. Existence is the whole of the test, there being no stored status to refuse on — a product''s lifecycle is derived from its dates. That guard is also the one refusal that stays generic all the way out to the reader: every other ''stale'' resolves to ''used'' when the caller re-reads the row, and only a row still holding this exact live offer resolves to ''invalid''. ACCEPT activates the seat and places it in the product''s single group, resolved again at answer time — if the product no longer has exactly one group the seat is still granted and lands unassigned, because a placement question is ours and not a reason to withdraw an invitation. There is no seat-count gate, deliberately: the same capacity override promote_from_waitlist makes, with a stronger claim behind it, so a product that refilled while the family was deciding goes one over. DECLINE hard-deletes the row, matching leave_my_waitlist_spot, and returns the four identifiers the staff mail names because they cannot be read afterwards. No EXECUTE grant to authenticated: the public landing route has no session to guard on — the signed token is the authorization — and the in-app route establishes the parent''s ownership before calling.';


--
-- Name: FUNCTION respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamp with time zone, p_accept boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamp with time zone, p_accept boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamp with time zone, p_accept boolean) TO service_role;


