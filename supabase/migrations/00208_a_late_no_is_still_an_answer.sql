-- A late no is still an answer, and silence costs the place in line.
--
-- WHY
--
-- 00207 gave a waitlisted family five days to answer a seat offer, and treated
-- the deadline as one rule governing both answers. Living with it surfaced two
-- separate mistakes in that, and this migration fixes them in the two functions
-- that hold them. Nothing else about the offer changes: the stamps, the token's
-- compare-and-swap, the grants and the product guard are all as 00207 left
-- them, and both bodies below are that file's, carried forward with the two
-- edits described here.
--
-- 1. THE WINDOW BINDS ACCEPT, NOT DECLINE
--
-- The deadline exists to stop a seat being CLAIMED after we have given up
-- waiting and offered it to somebody else. None of that reasoning reaches a
-- family giving a place back. Refusing a late decline meant the database
-- insisting a family keep a spot they had just told us they did not want,
-- purely because they answered on the sixth day — and it meant the one piece of
-- information we most want (they are not coming) was the one we threw away.
--
-- So `respond_seat_offer` reads the window once into a flag and tests it only
-- on the accept side. A DECLINE now succeeds for as long as the row exists and
-- the stamp still matches, which is what makes the emailed link's "no, thank
-- you" and the in-app lapsed card's decline button both keep working after the
-- deadline.
--
-- The declined result carries `within_window` because the ROUTE has to tell the
-- two apart even though the family does not. An in-window decline is news an
-- admin is waiting for and mails them; a late one arrives after the no-response
-- mail has already gone out and after the admin has moved on, so it frees the
-- row quietly and mails nobody. That flag is computed here rather than by the
-- caller because this transaction is the only place the stored stamp and the
-- clock are read together under the product gate lock.
--
-- 2. SILENCE COSTS THE PLACE IN LINE
--
-- An offer that ran out unanswered is a turn that came up and was not taken.
-- Under 00207 it cost the family nothing: they kept their position, so the next
-- seat to open was offered to the same silent family first while everybody
-- behind them waited another full window for an answer that never came. The
-- queue could not make progress past a family who had stopped reading their
-- mail.
--
-- `claim_expired_seat_offer_notifications` is where that is now spent. The
-- statement that claims the notification also re-stamps `waitlisted_at`, moving
-- each claimed family to the back of the queue.
--
-- The cost lands AT THE OBSERVATION, not at the five-day instant. There is
-- deliberately no cron job behind seat offers — expiry is noticed when somebody
-- opens a page that would care — so the re-stamp happens the first time anybody
-- looks. That is a day or two of grace on the family's side and it is the
-- honest description of the mechanism rather than an approximation of one.
--
-- `clock_timestamp()` rather than `now()`, and that is the 00117 rule rather
-- than a preference: `waitlisted_at` is the key that ORDERS ROWS AGAINST EACH
-- OTHER, and `now()` is frozen at transaction start, so a platform-wide sweep
-- claiming three lapsed offers in one statement would stamp all three
-- identically and hand their new order to the `id` tiebreaker.
-- `seat_offer_expiry_notified_at` beside it keeps `now()` for the opposite
-- reason: it records when we told staff and is compared against nothing.
--
-- WHAT IS DELIBERATELY LEFT ALONE
--
-- Both offer stamps survive the claim. `seat_offer_sent_at` is what the emailed
-- token's compare-and-swap still matches against — a late decline has to keep
-- working, and the landing page tells an expired link apart from an already-used
-- one by exactly that value — and the notified stamp is what makes the claim
-- exactly-once under concurrency. A re-offer replaces both, so a claimed row is
-- still re-offerable and a second silence notifies again.
--
-- Neither function's authorization moves. Both are recreated, so both re-state
-- `REVOKE EXECUTE … FROM PUBLIC` and their `service_role` grant: a recreated
-- function comes back PUBLIC-executable, which is how a service-role-only
-- writer briefly became callable by `anon` during 00172.
--
-- WHY THIS IS A NEW FILE RATHER THAN AN EDIT TO 00207
--
-- 00207 is applied history. An edited migration is silently skipped by
-- `db push` on any database that already recorded it, so the change would land
-- in CI's from-scratch build and nowhere else. The two bodies below are
-- therefore copied from 00207 and carried forward whole — which also means this
-- file, not that one, is now the last word on them, and the end-state block at
-- the bottom re-asserts the invariants 00207 pinned so a replacement cannot
-- quietly drop one.

-- ---------------------------------------------------------------------------
-- 1. respond_seat_offer — the window binds accept, not decline
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.respond_seat_offer(
  p_participation_id uuid,
  p_offer_sent_at    timestamptz,
  p_accept           boolean
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id      uuid;
  v_product_status  public.product_status;
  v_status          public.participation_status;
  v_sent_at         timestamptz;
  v_customer_id     uuid;
  v_participant_id  uuid;
  v_group_id        uuid;
  v_group_count     integer;
  v_within_window   boolean;
BEGIN
  SELECT product_id INTO v_product_id
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'not_found');
  END IF;

  -- The same gate lock, so an admin drag-promoting this very row and a parent
  -- pressing Accept cannot both write it. The status rides back on the lock
  -- rather than being read in a second statement, because the answer has to be
  -- the one the lock is holding still.
  SELECT status INTO v_product_status
    FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- THE ONE FACT AN HONOURED INVITE ALWAYS REQUIRES: the product still exists
  -- and still stands. Everything else about the offer is grandfathered (see the
  -- header) — the terms it went out on survive an admin's edit, because we
  -- asked and they said yes. The product itself is not one of those terms. An
  -- invitation to a club that has been cancelled is an invitation to nothing,
  -- and seating a family into it would be worse than refusing them.
  --
  -- NOT FOUND is reachable even though the participation was found a statement
  -- ago: participations.product_id cascades on delete, so a product dropped
  -- between the two takes the row with it and this lock finds nothing.
  --
  -- Both answer `stale`, which is the outcome every other "this is no longer
  -- open" case already produces — deliberately not a new kind. The public
  -- landing route maps everything but accepted/declined/expired to one generic
  -- `invalid`, and a distinguishable answer here would let an unauthenticated
  -- caller ask which products have been cancelled.
  IF NOT FOUND OR v_product_status = 'cancelled'::public.product_status THEN
    RETURN jsonb_build_object('kind', 'stale');
  END IF;

  SELECT status, seat_offer_sent_at, customer_id, participant_id
    INTO v_status, v_sent_at, v_customer_id, v_participant_id
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
  -- The flag rides back on the DECLINE result because the ROUTE has to tell the
  -- two apart even though the family does not: an in-window decline is news an
  -- admin is waiting for and mails them, while a late one arrives after the
  -- no-response mail has already gone and after they have moved on, so it
  -- frees the row quietly. That distinction lives here rather than being
  -- recomputed by the caller because this transaction is the only place the
  -- stamp and the clock are read together under the lock.
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
  -- whole of the asymmetry above. `within_window` is what tells the caller
  -- which of the two it just did.
  DELETE FROM public.participations WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind',             'declined',
    'participation_id', p_participation_id,
    'product_id',       v_product_id,
    'customer_id',      v_customer_id,
    'participant_id',   v_participant_id,
    'within_window',    v_within_window
  );
END;
$$;

COMMENT ON FUNCTION public.respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamptz, p_accept boolean) IS 'A family''s answer to a seat offer, under the product gate lock. Compare-and-swap on p_offer_sent_at against the stored stamp: every way an offer ends moves that value, so a used link, a stale tab and a superseded offer all come back ''stale'' with no revocation table anywhere. The five-day window is re-checked here rather than trusted from the token, because the in-app path (a parent pressing Accept in My SOG) carries no token. THE WINDOW BINDS ACCEPT ALONE. A DECLINE succeeds for as long as the row exists, late or not: the deadline is there to stop a seat being claimed after we have offered it elsewhere, and none of that reasoning reaches a family giving a place back. The declined result therefore carries within_window, which is the caller''s only way to tell the two apart — an in-window decline is news an admin is waiting for and mails them, while a late one lands after the no-response mail has already gone and frees the row quietly. THE PRODUCT IS RE-CHECKED BY ID ON THE LOCK: a MISSING or ''cancelled'' product answers ''stale'' and grants nothing. That is the boundary of this function''s grandfathering — the TERMS the offer went out on survive an admin''s edit (the billing mode is deliberately not re-read), but the product''s own existence and standing are not terms, and the one fact an honoured invite always requires is that the product it names still exists and stands. A product that has merely run out of dates is NOT guarded: it still exists and nothing has been withdrawn. ACCEPT activates the seat and places it in the product''s single group, resolved again at answer time — if the product no longer has exactly one group the seat is still granted and lands unassigned, because a placement question is ours and not a reason to withdraw an invitation. There is no seat-count gate, deliberately: the same capacity override promote_from_waitlist makes, with a stronger claim behind it, so a product that refilled while the family was deciding goes one over. DECLINE hard-deletes the row, matching leave_my_waitlist_spot, and returns the four identifiers the staff mail names because they cannot be read afterwards. No EXECUTE grant to authenticated: the public landing route has no session to guard on — the signed token is the authorization — and the in-app route establishes the parent''s ownership before calling.';

REVOKE EXECUTE ON FUNCTION public.respond_seat_offer(uuid, timestamptz, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_seat_offer(uuid, timestamptz, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. claim_expired_seat_offer_notifications — silence costs the place in line
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_expired_seat_offer_notifications(
  p_participation_id uuid DEFAULT NULL
) RETURNS jsonb
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

COMMENT ON FUNCTION public.claim_expired_seat_offer_notifications(p_participation_id uuid) IS 'Claim seat offers that have run out unanswered and have not been reported to staff, and return what the mails need. One data-modifying CTE does both halves, which is what makes the notification exactly-once under concurrency: a second sweep re-evaluates seat_offer_expiry_notified_at IS NULL after the first commits and claims nothing, with no advisory lock and nothing held across the send. TWO MODES, and the argument is a security boundary rather than an optimisation. p_participation_id NULL sweeps the whole platform and is what the ADMIN surfaces pass — an admin opening the dashboard or a groups panel is entitled to observe every lapsed offer. A non-NULL id claims that row and nothing else, and is what every FAMILY-triggered observation passes: the emailed link is a signed token naming exactly one participation whose signature never expires, so unscoped it was a permanent unthrottled trigger for a platform-wide write; scoped, the worst a leaked link can do is claim the notification for the row it already names. The in-app answer passes its own id on the same rule — a credential that names one row may only claim that row. There is deliberately no cron job — expiry is OBSERVED rather than scheduled. SILENCE COSTS THE PLACE IN LINE: the same statement re-stamps waitlisted_at with clock_timestamp(), moving each claimed family to the back of the queue, because a turn that came up and was not taken must not be offered first again while everybody behind waits another round. clock_timestamp() rather than now() on the 00117 rule — waitlisted_at orders rows against each other, and a sweep claiming several rows in one frozen transaction time would stamp them all identically. The two offer stamps are left alone: seat_offer_sent_at is what the emailed token still compares against (a late decline keeps working, and the landing page tells an expired link from a used one by that value) and the notified stamp is what makes this claim exactly-once. The claimed rows stay waitlisted, so the offer is still re-offerable and a second silence notifies again. Service-role only; the route establishes who is calling.';

REVOKE EXECUTE ON FUNCTION public.claim_expired_seat_offer_notifications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_expired_seat_offer_notifications(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Assert the end state this migration claims
-- ---------------------------------------------------------------------------
--
-- The first two blocks are this file's own claims. The rest re-assert what
-- 00207 pinned about these same two bodies: a CREATE OR REPLACE is the last
-- word on a function, so an invariant asserted only in the file that first
-- wrote it is an invariant a later replacement can drop in silence.

DO $assert$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'respond_seat_offer';

  -- (a) The window binds ACCEPT alone, and a late decline still reports its own
  -- lateness. Both halves fail silently when lost: a body that went back to
  -- refusing every answer past the deadline would leave a family unable to give
  -- a seat back with every accept test still green, and a decline that stopped
  -- carrying `within_window` would make the route mail staff about an answer
  -- they stopped waiting for days ago.
  IF position('p_accept AND NOT v_within_window' IN v_src) = 0
     OR position('''within_window''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'respond_seat_offer no longer lets a late decline through, or no longer reports whether the answer was in time';
  END IF;

  -- (b) The window arithmetic is still spelled the way every other reader
  -- spells it. This is the SQL half of the lockstep with SEAT_OFFER_WINDOW_DAYS
  -- in `src/lib/constants/seat-offer.ts`; a rewrite that changed one function's
  -- interval and not the others would make an offer live for one reader and
  -- expired for another.
  IF position('interval ''5 days''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'respond_seat_offer lost its five-day window literal';
  END IF;

  -- (c) 00207's guard, re-asserted. The answer still checks the product by id:
  -- the TERMS an offer went out on are grandfathered, the product's own
  -- existence and standing are not, and an invitation to a cancelled club is an
  -- invitation to nothing. Losing it is silent — every caller goes on working
  -- and a family is quietly seated into a club that is not happening.
  IF position('NOT FOUND OR v_product_status = ''cancelled''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'respond_seat_offer no longer refuses a missing or cancelled product — an invite would outlive the product it names';
  END IF;

  -- (d) 00207's other half, re-asserted NEGATIVELY because it is the half a
  -- helpful rewrite breaks. The offer went out saying the seat costs nothing,
  -- so a product flipped to paid mid-window is still honoured; a later hand
  -- tidying "every no-charge gate" onto the shared predicate would take a seat
  -- away from a family at the worst possible moment — after we asked and they
  -- said yes.
  IF position('public.is_no_charge(' IN v_src) > 0
     OR position('billing_mode' IN v_src) > 0 THEN
    RAISE EXCEPTION 'respond_seat_offer reads the product''s billing mode — the offer''s terms are grandfathered on purpose and an accepted invite must always be honoured';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'claim_expired_seat_offer_notifications';

  -- (e) The queue cost, and the stamp it is written with. Losing the re-stamp
  -- is silent — every mail still goes out and the family simply keeps a turn
  -- they did not take — and downgrading it to `now()` is silent too, until a
  -- sweep claims two rows at once and hands their new order to the tiebreaker.
  IF position('waitlisted_at' IN v_src) = 0
     OR position('clock_timestamp()' IN v_src) = 0 THEN
    RAISE EXCEPTION 'claim_expired_seat_offer_notifications no longer re-stamps waitlisted_at with clock_timestamp() — an unanswered offer would cost the family nothing, or several claimed in one sweep would tie';
  END IF;

  -- (f) 00207's scope predicate, re-asserted. The emailed link is a signed
  -- token naming exactly one participation whose signature never expires, so
  -- unscoped this was a permanent unthrottled trigger for a platform-wide write
  -- and a fan-out of staff mail about families the clicker has nothing to do
  -- with. Losing it is silent in exactly the same way.
  IF position('p_participation_id IS NULL OR p.id = p_participation_id' IN v_src) = 0 THEN
    RAISE EXCEPTION 'claim_expired_seat_offer_notifications lost its scope predicate';
  END IF;

  IF position('interval ''5 days''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'claim_expired_seat_offer_notifications lost its five-day window literal';
  END IF;

  -- (g) Still exactly one function of that name, taking exactly one argument.
  -- A leftover overload would still be reachable and would still sweep the
  -- whole platform.
  IF (SELECT count(*) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'claim_expired_seat_offer_notifications') <> 1 THEN
    RAISE EXCEPTION 'claim_expired_seat_offer_notifications is not the single function it must be';
  END IF;

  -- (h) The grants came back as they went in. A recreated function is
  -- PUBLIC-executable again until it is re-revoked, and both of these are
  -- SECURITY DEFINER writers that no session role may ever reach: one grants a
  -- seat from a token, the other writes across the whole platform.
  IF NOT has_function_privilege('service_role', 'public.respond_seat_offer(uuid, timestamptz, boolean)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.claim_expired_seat_offer_notifications(uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'a recreated seat-offer function is missing its service_role EXECUTE grant';
  END IF;

  IF has_function_privilege('authenticated', 'public.respond_seat_offer(uuid, timestamptz, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.respond_seat_offer(uuid, timestamptz, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_expired_seat_offer_notifications(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.claim_expired_seat_offer_notifications(uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'a recreated seat-offer function is callable by a session role — the REVOKE FROM PUBLIC did not take';
  END IF;
END
$assert$;
