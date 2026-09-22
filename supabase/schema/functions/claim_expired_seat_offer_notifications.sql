--
-- Name: claim_expired_seat_offer_notifications(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_expired_seat_offer_notifications(p_participation_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_claimed jsonb;
BEGIN
  -- One statement, and that is the design. The UPDATE both selects the rows to
  -- notify about and marks them notified, so the set it returns is the set this
  -- caller owns: a concurrent sweep re-evaluates
  -- `seat_offer_expiry_notified_at IS NULL` after this one commits and finds
  -- nothing. Exactly-once by construction, with no advisory lock and nothing
  -- held across the Brevo call.
  --
  -- There is no cron job. Expiry is observed rather than scheduled — an admin
  -- opening the dashboard or the groups panel runs this, and so does a family
  -- clicking a link that has already run out, which is itself an observation.
  -- The cost of that is latency (staff hear about a silent family the next time
  -- somebody looks) and the benefit is that nothing has to be provisioned,
  -- monitored or reasoned about at 3am.
  --
  -- THE SCOPE ARGUMENT, AND WHY IT IS NOT DECORATION
  --
  -- NULL is the platform-wide sweep, and it is what the ADMIN surfaces pass:
  -- an admin opening the dashboard or a groups panel is entitled to observe
  -- every lapsed offer, and a global claim is the whole point of a sweep on
  -- mount. A non-NULL id claims THAT ROW AND NOTHING ELSE, and it is what every
  -- family-triggered observation passes.
  --
  -- The split is a security boundary rather than an optimisation. The emailed
  -- link is a signed token that names exactly one participation and never
  -- expires as a signature — the five-day window is checked against the row,
  -- not against the token's age — so an old leaked link is a credential that
  -- goes on working as a trigger forever. Unscoped, that made it a permanent,
  -- unthrottled trigger for a platform-wide write and a fan-out of staff mail
  -- about families the clicker has nothing to do with. Scoped, the worst a
  -- leaked link can do is claim the notification for the one row it already
  -- names. The in-app answer passes its own id for the same reason: a
  -- credential that names one row may only claim that row, whatever kind of
  -- credential it is.
  --
  -- SILENCE COSTS THE PLACE IN LINE, AND IT IS SPENT HERE
  --
  -- The claim is also where the family goes to the back of the queue. An offer
  -- that ran out unanswered is a turn that came up and was not taken, and
  -- holding the position through it would mean the same family is asked first
  -- again next time while everybody behind them waits a second round for an
  -- answer that never comes.
  --
  -- `clock_timestamp()`, NOT `now()`, and that is the 00117 rule rather than a
  -- preference: `waitlisted_at` is the key that ORDERS ROWS AGAINST EACH OTHER,
  -- and `now()` is frozen at transaction start — so a platform-wide sweep
  -- claiming three lapsed offers in one statement would stamp all three
  -- identically and leave their new order to the `id` tiebreaker rather than to
  -- anything meaningful. `seat_offer_expiry_notified_at` beside it keeps
  -- `now()` for the opposite reason: it is a deadline-shaped record of when we
  -- told staff, compared against nothing but itself.
  --
  -- The two offer stamps are deliberately LEFT ALONE. `seat_offer_sent_at`
  -- surviving is what the emailed token's compare-and-swap still matches
  -- against — a late decline has to keep working, and the landing page tells an
  -- expired link apart from a used one by exactly that value — and the notified
  -- stamp is what makes this claim exactly-once. A re-offer replaces both, so
  -- the row is still re-offerable and a second silence notifies again.
  WITH claimed AS (
    UPDATE public.participations p
       SET seat_offer_expiry_notified_at = now(),
           waitlisted_at                 = clock_timestamp()
     WHERE p.status = 'waitlisted'::public.participation_status
       AND p.seat_offer_sent_at IS NOT NULL
       AND p.seat_offer_sent_at + interval '5 days' <= now()
       AND p.seat_offer_expiry_notified_at IS NULL
       AND (p_participation_id IS NULL OR p.id = p_participation_id)
    RETURNING p.id, p.product_id, p.customer_id, p.participant_id, p.seat_offer_sent_at
  )
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'participation_id', c.id,
               'product_id',       c.product_id,
               'customer_id',      c.customer_id,
               'participant_id',   c.participant_id,
               'sent_at',          c.seat_offer_sent_at
             )
             ORDER BY c.seat_offer_sent_at, c.id
           ),
           '[]'::jsonb
         )
    INTO v_claimed
    FROM claimed c;

  RETURN v_claimed;
END;
$$;


--
-- Name: FUNCTION claim_expired_seat_offer_notifications(p_participation_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.claim_expired_seat_offer_notifications(p_participation_id uuid) IS 'Claim seat offers that have run out unanswered and have not been reported to staff, and return what the mails need. One data-modifying CTE does both halves, which is what makes the notification exactly-once under concurrency: a second sweep re-evaluates seat_offer_expiry_notified_at IS NULL after the first commits and claims nothing, with no advisory lock and nothing held across the send. TWO MODES, and the argument is a security boundary rather than an optimisation. p_participation_id NULL sweeps the whole platform and is what the ADMIN surfaces pass — an admin opening the dashboard or a groups panel is entitled to observe every lapsed offer. A non-NULL id claims that row and nothing else, and is what every FAMILY-triggered observation passes: the emailed link is a signed token naming exactly one participation whose signature never expires, so unscoped it was a permanent unthrottled trigger for a platform-wide write; scoped, the worst a leaked link can do is claim the notification for the row it already names. The in-app answer passes its own id on the same rule — a credential that names one row may only claim that row. There is deliberately no cron job — expiry is OBSERVED rather than scheduled. SILENCE COSTS THE PLACE IN LINE: the same statement re-stamps waitlisted_at with clock_timestamp(), moving each claimed family to the back of the queue, because a turn that came up and was not taken must not be offered first again while everybody behind waits another round. clock_timestamp() rather than now(), the rule for every cross-transaction ordering key — waitlisted_at orders rows against each other, and a sweep claiming several rows in one frozen transaction time would stamp them all identically. The two offer stamps are left alone: seat_offer_sent_at is what the emailed token still compares against (a late decline keeps working, and the landing page tells an expired link from a used one by that value) and the notified stamp is what makes this claim exactly-once. The claimed rows stay waitlisted, so the offer is still re-offerable and a second silence notifies again. Service-role only; the route establishes who is calling.';


--
-- Name: FUNCTION claim_expired_seat_offer_notifications(p_participation_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_expired_seat_offer_notifications(p_participation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_expired_seat_offer_notifications(p_participation_id uuid) TO service_role;


