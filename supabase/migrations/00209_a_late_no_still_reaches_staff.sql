-- A late no still reaches staff, unless silence already did.
--
-- WHY
--
-- 00208 let a decline through after the deadline and then decided, on the flag
-- it added, whether staff hear about it: an in-window no is mailed, a late one
-- is not. The argument for the second half was that a late no lands after the
-- no-response mail has already gone out, so a second mail would raise a family
-- an admin has finished dealing with.
--
-- THE HOLE IS THAT THE FIRST MAIL IS NOT GUARANTEED TO HAVE GONE
--
-- Seat-offer expiry is OBSERVED rather than scheduled. There is deliberately no
-- cron job: `claim_expired_seat_offer_notifications` runs when somebody opens a
-- page that would care, so the no-response mail goes out the first time anybody
-- looks. If nobody looked between the fifth day and the family's late answer,
-- nobody looked at all, and `seat_offer_expiry_notified_at` is still NULL.
--
-- The decline then DELETEs the row — and the row is the only evidence that an
-- offer was ever outstanding. No later sweep can claim what is gone, so no mail
-- can fire afterwards either. 00208's rule therefore had one reachable state in
-- which staff learn LESS from an answer than they would have learned from
-- silence: the family said no, the seat is free, and nobody is ever told. That
-- is exactly backwards, and it is the state a family who answers on the sixth
-- day walks straight into.
--
-- WHAT CHANGES, AND ONLY THIS
--
-- The declined result gains `already_notified` beside `within_window`: whether
-- the row's `seat_offer_expiry_notified_at` was set at the moment we read it,
-- read BEFORE the DELETE takes the column with it. The routes then mail on
-- `within_window OR NOT already_notified`, which skips the mail only where the
-- no-response mail DEMONSTRABLY went, rather than on a theory about what an
-- admin has probably seen by now.
--
-- The two flags are not redundant and neither implies the other. `within_window`
-- says the answer beat the deadline; `already_notified` says somebody has
-- observed the lapse since. An in-window decline is always news (nothing has
-- been claimed yet, so the second flag is false anyway), and a late one is news
-- exactly when nobody swept it. The route reads them together because the pair
-- is what "has anybody been told about this offer?" actually asks.
--
-- The read is deliberately NOT locked against a concurrent sweep. This
-- transaction holds the product gate lock, not a lock on the participation, so
-- a sweep claiming this row between our read and our DELETE would leave us
-- mailing about an offer it has just mailed about. That race is one duplicate
-- staff mail in the window between two statements, and it fails in the
-- direction we want: the failure this migration exists to remove is silence,
-- and a second mail is recoverable by a human reading it while a missing one is
-- not recoverable at all.
--
-- WHAT IS DELIBERATELY LEFT ALONE
--
-- `claim_expired_seat_offer_notifications` is untouched and stays exactly as
-- 00208 wrote it — the queue cost, the scope predicate and the exactly-once
-- claim all still live there. This file replaces `respond_seat_offer` and
-- nothing else, so the end-state block below asserts only that function.
--
-- Its authorization does not move. A recreated function comes back
-- PUBLIC-executable, which is how a service-role-only writer briefly became
-- callable by `anon` during 00172, so the REVOKE and the GRANT are restated
-- here rather than assumed.
--
-- WHY THIS IS A NEW FILE RATHER THAN AN EDIT TO 00208
--
-- 00208 is applied history. An edited migration is silently skipped by
-- `db push` on any database that already recorded it, so the change would land
-- in CI's from-scratch build and nowhere else. The body below is therefore
-- 00208's, carried forward whole with the edits described here — which also
-- means this file, not that one, is now the last word on `respond_seat_offer`,
-- and the end-state block re-asserts what 00207 and 00208 pinned about it so a
-- replacement cannot quietly drop one.
--
-- ONE STALE COMMENT IS CORRECTED ON THE WAY THROUGH
--
-- 00208's body said the public landing route "maps everything but
-- accepted/declined/expired to one generic `invalid`". That has not been true
-- since the landing page and the respond route started sharing one
-- classification: a refused compare-and-swap is re-read against the row, and
-- every consumed shape — accepted, promoted, declined, withdrawn, superseded —
-- answers `used`. The single case that still resolves to the generic `invalid`
-- is the one this guard produces: a row still holding this exact offer inside
-- its window, refused because the product was cancelled or deleted. The
-- corrected comment now says that, and it says it where the guard is.

-- ---------------------------------------------------------------------------
-- respond_seat_offer — a late no still reaches staff
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
  v_product_id        uuid;
  v_product_status    public.product_status;
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
  -- open" case already produces — deliberately not a new kind. THIS IS ALSO THE
  -- ONE REFUSAL THAT STAYS GENERIC ALL THE WAY OUT. A `stale` answer is re-read
  -- against the row by the caller, and every shape that means the offer was
  -- consumed — accepted, promoted, declined, withdrawn, superseded — resolves
  -- to `used`. A row still holding this exact offer inside its window cannot be
  -- any of those, so it is this guard that refused, and it resolves to the
  -- generic `invalid` instead: a distinguishable answer would let an
  -- unauthenticated caller ask which products have been cancelled.
  IF NOT FOUND OR v_product_status = 'cancelled'::public.product_status THEN
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

COMMENT ON FUNCTION public.respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamptz, p_accept boolean) IS 'A family''s answer to a seat offer, under the product gate lock. Compare-and-swap on p_offer_sent_at against the stored stamp: every way an offer ends moves that value, so a used link, a stale tab and a superseded offer all come back ''stale'' with no revocation table anywhere. The five-day window is re-checked here rather than trusted from the token, because the in-app path (a parent pressing Accept in My SOG) carries no token. THE WINDOW BINDS ACCEPT ALONE. A DECLINE succeeds for as long as the row exists, late or not: the deadline is there to stop a seat being claimed after we have offered it elsewhere, and none of that reasoning reaches a family giving a place back. THE DECLINED RESULT CARRIES TWO FLAGS AND THEY ANSWER DIFFERENT QUESTIONS. within_window says the answer beat the deadline. already_notified says seat_offer_expiry_notified_at was set when we read it — read before the DELETE, because the DELETE takes the column with it and after that nothing can tell whether staff were ever told this offer went unanswered. The caller mails on within_window OR NOT already_notified, which skips the mail only where the no-response mail demonstrably went: expiry here is OBSERVED rather than scheduled, so an offer nobody looked at between its fifth day and a late answer was never reported, and treating lateness alone as proof of notification made staff learn less from an answer than from silence. The already_notified read is deliberately not locked against a concurrent sweep — this transaction holds the product gate lock, not the participation row — so the worst case is one duplicate staff mail, which is the recoverable direction. THE PRODUCT IS RE-CHECKED BY ID ON THE LOCK: a MISSING or ''cancelled'' product answers ''stale'' and grants nothing. That is the boundary of this function''s grandfathering — the TERMS the offer went out on survive an admin''s edit (the billing mode is deliberately not re-read), but the product''s own existence and standing are not terms, and the one fact an honoured invite always requires is that the product it names still exists and stands. A product that has merely run out of dates is NOT guarded: it still exists and nothing has been withdrawn. That guard is also the one refusal that stays generic all the way out to the reader: every other ''stale'' resolves to ''used'' when the caller re-reads the row, and only a row still holding this exact live offer resolves to ''invalid'', because a distinguishable answer would let an unauthenticated caller ask which products have been cancelled. ACCEPT activates the seat and places it in the product''s single group, resolved again at answer time — if the product no longer has exactly one group the seat is still granted and lands unassigned, because a placement question is ours and not a reason to withdraw an invitation. There is no seat-count gate, deliberately: the same capacity override promote_from_waitlist makes, with a stronger claim behind it, so a product that refilled while the family was deciding goes one over. DECLINE hard-deletes the row, matching leave_my_waitlist_spot, and returns the four identifiers the staff mail names because they cannot be read afterwards. No EXECUTE grant to authenticated: the public landing route has no session to guard on — the signed token is the authorization — and the in-app route establishes the parent''s ownership before calling.';

REVOKE EXECUTE ON FUNCTION public.respond_seat_offer(uuid, timestamptz, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_seat_offer(uuid, timestamptz, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- Assert the end state this migration claims
-- ---------------------------------------------------------------------------
--
-- (a) and (b) are this file's own claims. The rest re-assert what 00207 and
-- 00208 pinned about this same body: a CREATE OR REPLACE is the last word on a
-- function, so an invariant asserted only in the file that first wrote it is an
-- invariant a later replacement can drop in silence.

DO $assert$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'respond_seat_offer';

  -- (a) The declined result reports whether staff had already been told. Losing
  -- this is silent in the worst possible way: every test of a decline still
  -- passes, the row is still freed, and the one case it governs — a family
  -- answering late on an offer nobody ever swept — goes to nobody at all.
  IF position('''already_notified''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'respond_seat_offer no longer reports whether staff had already been told about this lapsed offer';
  END IF;

  -- (b) And it is read BEFORE the row is deleted, which is the whole mechanism
  -- rather than a detail of style: the DELETE takes
  -- `seat_offer_expiry_notified_at` with it, so a read moved after it could
  -- only ever answer "no row". Asserted positionally because a reordering is
  -- exactly the shape a later tidy-up takes.
  IF position('seat_offer_expiry_notified_at IS NOT NULL' IN v_src) = 0
     OR position('seat_offer_expiry_notified_at IS NOT NULL' IN v_src)
        > position('DELETE FROM public.participations' IN v_src) THEN
    RAISE EXCEPTION 'respond_seat_offer no longer reads the expiry-notified stamp before deleting the row that holds it';
  END IF;

  -- (c) 00208's asymmetry, re-asserted. Both halves fail silently when lost: a
  -- body that went back to refusing every answer past the deadline would leave
  -- a family unable to give a seat back with every accept test still green, and
  -- a decline that stopped carrying `within_window` would make the route mail
  -- staff about an answer they are already holding.
  IF position('p_accept AND NOT v_within_window' IN v_src) = 0
     OR position('''within_window''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'respond_seat_offer no longer lets a late decline through, or no longer reports whether the answer was in time';
  END IF;

  -- (d) The window arithmetic is still spelled the way every other reader
  -- spells it. This is the SQL half of the lockstep with SEAT_OFFER_WINDOW_DAYS
  -- in `src/lib/constants/seat-offer.ts`; a rewrite that changed one function's
  -- interval and not the others would make an offer live for one reader and
  -- expired for another.
  IF position('interval ''5 days''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'respond_seat_offer lost its five-day window literal';
  END IF;

  -- (e) 00207's guard, re-asserted. The answer still checks the product by id:
  -- the TERMS an offer went out on are grandfathered, the product's own
  -- existence and standing are not, and an invitation to a cancelled club is an
  -- invitation to nothing. Losing it is silent — every caller goes on working
  -- and a family is quietly seated into a club that is not happening.
  IF position('NOT FOUND OR v_product_status = ''cancelled''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'respond_seat_offer no longer refuses a missing or cancelled product — an invite would outlive the product it names';
  END IF;

  -- (f) 00207's other half, re-asserted NEGATIVELY because it is the half a
  -- helpful rewrite breaks. The offer went out saying the seat costs nothing,
  -- so a product flipped to paid mid-window is still honoured; a later hand
  -- tidying "every no-charge gate" onto the shared predicate would take a seat
  -- away from a family at the worst possible moment — after we asked and they
  -- said yes.
  IF position('public.is_no_charge(' IN v_src) > 0
     OR position('billing_mode' IN v_src) > 0 THEN
    RAISE EXCEPTION 'respond_seat_offer reads the product''s billing mode — the offer''s terms are grandfathered on purpose and an accepted invite must always be honoured';
  END IF;

  -- (g) Still exactly one function of that name. A leftover overload would
  -- still be reachable and would still grant seats.
  IF (SELECT count(*) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'respond_seat_offer') <> 1 THEN
    RAISE EXCEPTION 'respond_seat_offer is not the single function it must be';
  END IF;

  -- (h) The grants came back as they went in. A recreated function is
  -- PUBLIC-executable again until it is re-revoked, and this is a SECURITY
  -- DEFINER writer that no session role may ever reach: it grants a seat from a
  -- token.
  IF NOT has_function_privilege('service_role', 'public.respond_seat_offer(uuid, timestamptz, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'respond_seat_offer is missing its service_role EXECUTE grant';
  END IF;

  IF has_function_privilege('authenticated', 'public.respond_seat_offer(uuid, timestamptz, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.respond_seat_offer(uuid, timestamptz, boolean)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'respond_seat_offer is callable by a session role — the REVOKE FROM PUBLIC did not take';
  END IF;
END
$assert$;
