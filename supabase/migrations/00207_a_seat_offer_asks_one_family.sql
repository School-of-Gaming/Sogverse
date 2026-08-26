-- A seat offer asks one waitlisted family whether they can still come.
--
-- WHY
--
-- A no-charge club loses a family mid-term and a seat opens. Today an admin
-- drag-promotes whoever is next in line, which grants a seat to a family who
-- may have found something else months ago — and the seat is then held by
-- somebody who never turns up, while the family behind them waits. The offer
-- inverts it: we ask, and the family answers yes or no within a stated window.
--
-- THE SHAPE
--
-- An offer is not a row. It is two nullable stamps on the waitlisted
-- participation, and everything else about it is DERIVED:
--
--   * `seat_offer_sent_at`             — when the offer went out. NULL means no
--                                        offer has ever been made on this row,
--                                        or the last one was answered.
--   * `seat_offer_expiry_notified_at`  — when staff were told this offer ran
--                                        out unanswered. Orthogonal to the two
--                                        states below: it records a
--                                        notification, not the offer's standing.
--
-- From the first stamp:
--
--   LIVE     `seat_offer_sent_at + interval '5 days' >  now()`
--   EXPIRED  `seat_offer_sent_at + interval '5 days' <= now()`
--
-- Nothing stores "offered" as a status, and that is deliberate. A stored state
-- has to be swept back out when the window closes, which is a cron job we do
-- not have and do not want; a derived one is simply true or false whenever
-- anybody asks. The emailed link's expiry is the same arithmetic done in
-- TypeScript (`SEAT_OFFER_WINDOW_DAYS` in `src/lib/constants/seat-offer.ts`),
-- and THAT CONSTANT AND THE `interval '5 days'` LITERALS IN THIS FILE ARE IN
-- LOCKSTEP — moving one without the other makes a link that outlives its own
-- offer, or dies before it. The comment at the other end names this file back.
--
-- WHY THE STAMP IS TRUNCATED TO MILLISECONDS
--
-- `respond_seat_offer` is a compare-and-swap on the exact stamp: the emailed
-- token is signed over it, and a token whose value no longer matches the row is
-- how an answered, superseded or re-issued offer stops working with no
-- revocation table anywhere. That equality has to survive a round trip through
-- JavaScript, whose `Date` holds MILLISECONDS while `now()` holds microseconds.
-- A raw `now()` stamp is therefore unmatchable from a link: the token carries
-- `1756...123` and the row holds `...123456`. `date_trunc('milliseconds', …)`
-- is what makes the two representable in the same number, and it is the one
-- line in this file that looks cosmetic and is not.
--
-- WHY `now()` RATHER THAN `clock_timestamp()`
--
-- The repo's rule (supabase/CLAUDE.md) reserves `clock_timestamp()` for stamps
-- that ORDER ROWS AGAINST EACH OTHER across concurrent transactions —
-- `waitlisted_at` is one, because two joins serialized on the product lock must
-- not tie. This stamp orders nothing. It is a deadline, read only against
-- `now()` on the same row, and two offers stamped in the same microsecond would
-- be two independent deadlines rather than a contested rank.
--
-- WHAT IS SERVICE-ROLE ONLY, AND WHY ALL THREE ARE
--
-- None of the three new functions is granted to `authenticated`. The reason is
-- forced by the middle one: `respond_seat_offer` is reached from a PUBLIC
-- landing page where the reader may be signed out, or signed in as somebody
-- else on a shared family device — the signed token is the whole of the
-- authorization, and there is no `auth.uid()` for a guard primitive to read.
-- Once one of them has to be service-role, the other two follow it rather than
-- splitting the feature across two authorization models: the routes that call
-- them are role-gated in the application, which is where an admin's identity
-- and a parent's ownership are actually established.
--
-- MULTIPLE OFFERS ARE ALLOWED
--
-- Nothing here counts offers against seats. An admin with three seats open and
-- eight people queueing may offer all eight; the accepted ones are honoured and
-- the rest expire. An accepted offer is ALWAYS honoured, even if the product
-- refilled while the family was deciding — same deliberate capacity override
-- `promote_from_waitlist` already makes, and for a stronger reason: we asked.
--
-- WHAT AN ANSWER RE-RESOLVES, AND WHAT IT KNOWINGLY DOES NOT
--
-- `respond_seat_offer` re-reads the product's GROUP COUNT at answer time rather
-- than trusting the one `send_seat_offer` saw: if the product no longer has
-- exactly one group the seat is still granted and lands unassigned, because a
-- placement question is ours and is not a reason to withdraw an invitation.
--
-- It deliberately does NOT re-check BILLING MODE. A product flipped from
-- no-charge to paid while a family was deciding still honours the free seat
-- they accept — the offer went out saying the seat cost them nothing, and an
-- accepted invite is always honoured. It is also exactly what a billing-mode
-- flip does everywhere else: the flip is unguarded in both directions and
-- grandfathers existing participants (free enrollees on a product that turns
-- paid keep their seats unbilled), because no path in the subscription
-- lifecycle reads the product's billing mode. Re-checking here would make this
-- the one place a family loses something to an admin's edit, and it would do it
-- at the worst possible moment — after we asked and they said yes. The window
-- is five days, so the exposure is at most five days of one unbilled seat on a
-- product an admin has just re-priced.
--
-- The two conditions are therefore not symmetrical on purpose: the group count
-- decides WHERE an accepted seat lands and so has to be current, while the
-- billing mode would decide WHETHER to honour the answer at all, and that
-- question was settled when the offer was sent.

-- ---------------------------------------------------------------------------
-- 1. The two stamps
-- ---------------------------------------------------------------------------

ALTER TABLE public.participations
  ADD COLUMN IF NOT EXISTS seat_offer_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS seat_offer_expiry_notified_at timestamptz;

COMMENT ON COLUMN public.participations.seat_offer_sent_at IS 'When a seat offer was last sent to this waitlisted family, truncated to milliseconds. NULL on every row that has never been offered a seat and on every row whose offer has been answered — accepting clears it, declining deletes the row, and re-offering after expiry replaces it. Only ever set on a waitlisted row (chk_participations_offer_only_when_waitlisted), which is what lets every status transition treat "clear the offer" as unconditional. Whether the offer is LIVE is derived from this and nothing else: seat_offer_sent_at + interval ''5 days'' > now(). The millisecond truncation is load-bearing rather than cosmetic — the emailed token is signed over this exact instant and compared back through JavaScript, whose Date cannot represent microseconds.';

COMMENT ON COLUMN public.participations.seat_offer_expiry_notified_at IS 'When staff were emailed that this offer ran out with no answer. Orthogonal to whether the offer is live or expired: it records that a notification happened, not the offer''s standing. Claimed atomically by claim_expired_seat_offer_notifications, whose UPDATE ... WHERE seat_offer_expiry_notified_at IS NULL is what makes the mail exactly-once under concurrency with no lock held across the send. Cleared whenever a fresh offer is stamped, so a re-offer that expires again notifies again.';

-- Offer stamps belong to a waitlisted seat and to nothing else. This is what
-- lets `promote_from_waitlist` (and anything else that moves a row out of the
-- queue) clear them unconditionally instead of asking first — and it is what
-- makes "the stamp matches" imply "the row is still waitlisted" inside
-- `respond_seat_offer`.
ALTER TABLE public.participations
  DROP CONSTRAINT IF EXISTS chk_participations_offer_only_when_waitlisted;
ALTER TABLE public.participations
  ADD CONSTRAINT chk_participations_offer_only_when_waitlisted
  CHECK (seat_offer_sent_at IS NULL
         OR status = 'waitlisted'::public.participation_status);

-- A notification is about an offer, so there is no notifying without one.
ALTER TABLE public.participations
  DROP CONSTRAINT IF EXISTS chk_participations_offer_notice_needs_offer;
ALTER TABLE public.participations
  ADD CONSTRAINT chk_participations_offer_notice_needs_offer
  CHECK (seat_offer_expiry_notified_at IS NULL
         OR seat_offer_sent_at IS NOT NULL);

-- A partial index over a deliberate SUPERSET of the sweep's predicate. The
-- sweep also filters on status and on the five-day time bound; neither is in
-- the index condition, on purpose. The status is implied — a CHECK forbids an
-- offer stamp on anything but a waitlisted row, so every row this index holds
-- is already waitlisted — and the time bound is a moving one, which an index
-- predicate cannot be: baking `now()` into it is not allowed and baking a fixed
-- instant into it would make the index wrong the moment it was built. What is
-- left are the two stable halves, and they are the ones that do the work.
-- Offers are rare and short-lived, so this holds a handful of rows out of the
-- whole table and the claim never has to look at the rest.
CREATE INDEX IF NOT EXISTS idx_participations_unnotified_seat_offers
  ON public.participations (seat_offer_sent_at)
  WHERE seat_offer_sent_at IS NOT NULL
    AND seat_offer_expiry_notified_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. send_seat_offer — the admin's invite
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_seat_offer(p_participation_id uuid) RETURNS jsonb
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
  IF v_product.billing_mode NOT IN ('free'::public.billing_mode,
                                    'external_contract'::public.billing_mode) THEN
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

COMMENT ON FUNCTION public.send_seat_offer(p_participation_id uuid) IS 'Offer an open seat to one waitlisted family, under the product gate lock. Refuses anything but a no-charge product (free or external_contract) and anything but exactly one group — accepting has to place the child, and the family is never asked to choose. Stamps seat_offer_sent_at with now() truncated to MILLISECONDS, which is load-bearing: the emailed token is signed over that exact instant and compared back through a JavaScript Date, which cannot hold microseconds. Returns the stored stamp (never the caller''s idea of it) plus idempotent — false only on the call that wrote a stamp, true when a LIVE offer was already standing. The mail keys on idempotent = false, the same signal join_waitlist returns for the same reason; a replay deliberately does not refresh the deadline, because a family reading a date in their inbox must not have it moved. An EXPIRED offer is re-offerable and clears the old expiry-notification stamp with it. No EXECUTE grant to authenticated: the admin route calls it through the service-role client, having established the admin''s identity itself.';

REVOKE EXECUTE ON FUNCTION public.send_seat_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_seat_offer(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. respond_seat_offer — the family's answer
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
  v_product_id     uuid;
  v_status         public.participation_status;
  v_sent_at        timestamptz;
  v_customer_id    uuid;
  v_participant_id uuid;
  v_group_id       uuid;
  v_group_count    integer;
BEGIN
  SELECT product_id INTO v_product_id
    FROM public.participations
   WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('kind', 'not_found');
  END IF;

  -- The same gate lock, so an admin drag-promoting this very row and a parent
  -- pressing Accept cannot both write it.
  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

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
  IF v_sent_at + interval '5 days' <= now() THEN
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
  DELETE FROM public.participations WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind',             'declined',
    'participation_id', p_participation_id,
    'product_id',       v_product_id,
    'customer_id',      v_customer_id,
    'participant_id',   v_participant_id
  );
END;
$$;

COMMENT ON FUNCTION public.respond_seat_offer(p_participation_id uuid, p_offer_sent_at timestamptz, p_accept boolean) IS 'A family''s answer to a seat offer, under the product gate lock. Compare-and-swap on p_offer_sent_at against the stored stamp: every way an offer ends moves that value, so a used link, a stale tab and a superseded offer all come back ''stale'' with no revocation table anywhere. The five-day window is re-checked here rather than trusted from the token, because the in-app path (a parent pressing Accept in My SOG) carries no token. ACCEPT activates the seat and places it in the product''s single group, resolved again at answer time — if the product no longer has exactly one group the seat is still granted and lands unassigned, because a placement question is ours and not a reason to withdraw an invitation. There is no seat-count gate, deliberately: the same capacity override promote_from_waitlist makes, with a stronger claim behind it, so a product that refilled while the family was deciding goes one over. DECLINE hard-deletes the row, matching leave_my_waitlist_spot, and returns the four identifiers the staff mail names because they cannot be read afterwards. No EXECUTE grant to authenticated: the public landing route has no session to guard on — the signed token is the authorization — and the in-app route establishes the parent''s ownership before calling.';

REVOKE EXECUTE ON FUNCTION public.respond_seat_offer(uuid, timestamptz, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_seat_offer(uuid, timestamptz, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. claim_expired_seat_offer_notifications — the lazy sweep
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_expired_seat_offer_notifications() RETURNS jsonb
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
  WITH claimed AS (
    UPDATE public.participations p
       SET seat_offer_expiry_notified_at = now()
     WHERE p.status = 'waitlisted'::public.participation_status
       AND p.seat_offer_sent_at IS NOT NULL
       AND p.seat_offer_sent_at + interval '5 days' <= now()
       AND p.seat_offer_expiry_notified_at IS NULL
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

COMMENT ON FUNCTION public.claim_expired_seat_offer_notifications() IS 'Claim every seat offer that has run out unanswered and has not been reported to staff, and return what the mails need. One data-modifying CTE does both halves, which is what makes the notification exactly-once under concurrency: a second sweep re-evaluates seat_offer_expiry_notified_at IS NULL after the first commits and claims nothing, with no advisory lock and nothing held across the send. There is deliberately no cron job — expiry is OBSERVED rather than scheduled, by an admin opening a page or by a family clicking a link that has already lapsed. The claimed rows stay waitlisted with their stamp intact, so the offer is still re-offerable and a second silence notifies again. Service-role only; the admin sweep route establishes who is calling.';

REVOKE EXECUTE ON FUNCTION public.claim_expired_seat_offer_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_expired_seat_offer_notifications() TO service_role;

-- ---------------------------------------------------------------------------
-- 5. promote_from_waitlist — a drag is an admin honouring the offer by hand
-- ---------------------------------------------------------------------------
--
-- Body copied from supabase/schema.sql (untouched by this branch, so the
-- snapshot is current) and carried forward verbatim apart from the two cleared
-- columns and the comment that explains them. An admin dragging an invited row
-- into a group is granting the seat the offer asked about, so the offer is
-- over — and leaving the stamp behind would break
-- chk_participations_offer_only_when_waitlisted the moment the status changed.

CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_participation_id uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
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

COMMENT ON FUNCTION public.promote_from_waitlist(p_participation_id uuid, p_group_id uuid) IS 'Admin-gated promotion of a waitlisted participation into a seat, under the product gate lock. No seat-count gate by design — promoting from a full waitlist is a deliberate capacity override. Clears waitlisted_at so the row leaves the queue ordering, and since 00207 clears the two seat-offer stamps with it: an admin dragging an invited row is honouring that offer by hand, which ends it, and the emailed link stops validating on its own because it no longer matches the row. The clear is unconditional because the CHECK forbids an offer stamp on a non-waitlisted row.';

REVOKE EXECUTE ON FUNCTION public.promote_from_waitlist(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_from_waitlist(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_from_waitlist(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. get_product_groups_with_details — the panel reads offer state
-- ---------------------------------------------------------------------------
--
-- Body copied from supabase/schema.sql and carried forward verbatim apart from
-- the two new fields, which are added to ALL THREE arms from the same
-- expression — the parity 00203 established for the staff-only flair, for the
-- same reason: one expression is what keeps three shapes one shape, and the
-- shared zod schema on the other side would refuse a key that appeared on only
-- one arm. On the grouped and unassigned arms both come back NULL, and that is
-- the truth rather than a gap: the CHECK forbids an offer stamp on anything but
-- a waitlisted row.

CREATE OR REPLACE FUNCTION public.get_product_groups_with_details(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_groups     JSONB;
  v_unassigned JSONB;
  v_waitlist   JSONB;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(g ORDER BY g->>'created_at', g->>'id'), '[]'::jsonb)
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name,
                     'email',      gp.email
                   )
                   ORDER BY ga.created_at, gp.id
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'participations', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',                             p.id,
                     'participant_id',                 p.participant_id,
                     'participant_first_name',         gmp.first_name,
                     'participant_date_of_birth',      gprof.date_of_birth,
                     'participant_gender',             gprof.gender,
                     'participant_minecraft_username', mca.minecraft_username,
                     'participant_minecraft_uuid',     mca.minecraft_uuid,
                     -- The Roblox pair, on the same terms as the Minecraft one
                     -- next to it: both are LEFT-joined, both are null on a
                     -- person who has never given that platform a handle, and
                     -- neither implies the other. The chip shows whichever the
                     -- product's topic is about.
                     'participant_roblox_username',    rba.roblox_username,
                     'participant_roblox_user_id',     rba.roblox_user_id,
                     -- The contact behind a CHILD's seat, which is what these
                     -- two describe — not the participant. Hence `parent_`
                     -- rather than `participant_parent_`: one prefix per
                     -- subject, and parent_email next door already set it.
                     'parent_first_name',              parent.first_name,
                     'parent_last_name',               parent.last_name,
                     -- An adult seat has no linked parent to name, so the chip
                     -- shows an address instead. NULL on every child row: a
                     -- gamer profile's email is the synthetic
                     -- @gamer.sogverse.internal handle, not a mailbox. The role
                     -- check (00177) makes "adult seat" the ROLE, not the id
                     -- equality alone — a transposed id yields NULL, not a leak.
                     'participant_email',
                       CASE WHEN p.participant_id = p.customer_id
                             AND gmp.role = 'customer'
                            THEN gmp.email END,
                     'status',                         p.status,
                     'signed_up_at',                   p.signed_up_at,
                     -- The demote/remove dialogs' condition, resolved
                     -- server-side so the panel needs no round trip per chip.
                     -- The join below excludes dead subscriptions, so this is
                     -- "live", not "ever existed".
                     'has_live_subscription',          (fs.id IS NOT NULL),
                     -- The promote dialog's condition (00167): money once
                     -- arrived for this seat.
                     'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL),
                     -- The staff-only flair (00203), identical in all three
                     -- arms. The groups PANEL draws neither mark — a chip there
                     -- is a drag handle — so these ride for shape parity across
                     -- the three roster readers, not for a reader of this one.
                     'group_joined_at',                p.group_joined_at,
                     'note',                           gn.note,
                     'note_updated_by_first_name',     ned.first_name,
                     -- The seat-offer stamps (00207), identical in all three
                     -- arms for the same reason. NULL here and on the
                     -- unassigned arm by construction — the CHECK forbids an
                     -- offer stamp on anything but a waitlisted row — and read
                     -- for real only on the waitlist arm, where the card draws
                     -- the offer's standing. Whether an offer is LIVE is
                     -- derived from sent_at on the reader's side, against the
                     -- same five-day window this file states everywhere else.
                     'seat_offer_sent_at',             p.seat_offer_sent_at,
                     'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
                   )
                   ORDER BY p.updated_at, p.id
                 )
            FROM participations p
            JOIN profiles gmp ON gmp.id = p.participant_id
            LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
            LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
            -- user_id is this table's primary key, so this cannot fan the row
            -- out any more than the Minecraft join above it can.
            LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
            -- participation_id is UNIQUE here, so this cannot fan the row out.
            -- The status predicate lives in the JOIN rather than a WHERE so a
            -- dead subscription simply fails to match and leaves fs.id NULL,
            -- instead of dropping the participation from the snapshot.
            LEFT JOIN family_subscriptions fs
                   ON fs.participation_id = p.id
                  AND fs.status <> 'cancelled'
            -- Keyed on exactly (group_id, participant_id), so this cannot fan
            -- the row out; profiles.id behind it is a primary key.
            LEFT JOIN public.gamer_group_notes gn
                   ON gn.group_id       = p.group_id
                  AND gn.participant_id = p.participant_id
            LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
            LEFT JOIN LATERAL (
              SELECT pp.first_name, pp.last_name
                FROM parent_gamer pgm
                JOIN profiles pp ON pp.id = pgm.parent_id
               WHERE pgm.gamer_id = p.participant_id
               ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
               LIMIT 1
            ) parent ON true
           WHERE p.group_id = pg.id
             AND p.status = 'active'
        ), '[]'::jsonb)
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                             p.id,
             'participant_id',                 p.participant_id,
             'participant_first_name',         gmp.first_name,
             'participant_date_of_birth',      gprof.date_of_birth,
             'participant_gender',             gprof.gender,
             'participant_minecraft_username', mca.minecraft_username,
             'participant_minecraft_uuid',     mca.minecraft_uuid,
             'participant_roblox_username',    rba.roblox_username,
             'participant_roblox_user_id',     rba.roblox_user_id,
             'parent_first_name',              parent.first_name,
             'parent_last_name',               parent.last_name,
             'participant_email',
               CASE WHEN p.participant_id = p.customer_id
                     AND gmp.role = 'customer'
                    THEN gmp.email END,
             'status',                         p.status,
             'signed_up_at',                   p.signed_up_at,
             'has_live_subscription',          (fs.id IS NOT NULL),
             'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL),
             -- Group-less by definition, so the join matches nothing and all
             -- three come back NULL. That is the truth rather than a gap: a
             -- seat in no group is new to nothing and has no note filed under
             -- any group. Keeping the expression identical is what keeps this
             -- arm the same shape as the other two.
             'group_joined_at',                p.group_joined_at,
             'note',                           gn.note,
             'note_updated_by_first_name',     ned.first_name,
             -- NULL here too, and by a constraint rather than by a join that
             -- misses: an ACTIVE seat cannot carry an offer stamp at all.
             'seat_offer_sent_at',             p.seat_offer_sent_at,
             'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
           )
           ORDER BY p.updated_at, p.id
         ), '[]'::jsonb)
    INTO v_unassigned
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.participant_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
    LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
    LEFT JOIN public.gamer_group_notes gn
           ON gn.group_id       = p.group_id
          AND gn.participant_id = p.participant_id
    LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.participant_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.group_id IS NULL
     AND p.status = 'active';

  -- Waitlist: same detail shape as `unassigned`, but ordered by the derived
  -- waitlist key (waitlisted_at, id). Position is the array index + 1, computed
  -- client-side — never stored. waitlisted_at drives ORDER BY but is omitted
  -- from the object so the row shape stays identical to a group/unassigned chip.
  --
  -- has_live_subscription is a REAL READ here as of 00170. It used to be a
  -- constant FALSE, resting on "demote_to_waitlist refuses a subscribed row, so
  -- this cannot exist". It can: the webhook inserts family_subscriptions after a
  -- Stripe round trip without taking the product gate lock, so a demote landing
  -- in that window creates exactly this row — and the manual sub-adoption
  -- process writes one directly. A snapshot asserting FALSE about a seat that
  -- has money behind it is the panel being lied to, so the branch reads the
  -- same join as the other two.
  --
  -- has_payment_marker remains a real read and remains the branch where it
  -- decides something: demotion leaves the Checkout Session id in place, so a
  -- family that paid and was later demoted is distinguishable here from one
  -- that only ever queued.
  --
  -- The two seat-offer stamps (00207) are the same story one step further on:
  -- this is the ONLY arm where either can be non-NULL, and the waitlist card is
  -- the only reader of them. They ride on the other two arms for shape parity.
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',                             p.id,
             'participant_id',                 p.participant_id,
             'participant_first_name',         gmp.first_name,
             'participant_date_of_birth',      gprof.date_of_birth,
             'participant_gender',             gprof.gender,
             'participant_minecraft_username', mca.minecraft_username,
             'participant_minecraft_uuid',     mca.minecraft_uuid,
             'participant_roblox_username',    rba.roblox_username,
             'participant_roblox_user_id',     rba.roblox_user_id,
             'parent_first_name',              parent.first_name,
             'parent_last_name',               parent.last_name,
             'participant_email',
               CASE WHEN p.participant_id = p.customer_id
                     AND gmp.role = 'customer'
                    THEN gmp.email END,
             'status',                         p.status,
             'signed_up_at',                   p.signed_up_at,
             'has_live_subscription',          (fs.id IS NOT NULL),
             'has_payment_marker',             (p.stripe_checkout_session_id IS NOT NULL),
             -- A waitlisted seat holds no group either, so these are NULL for
             -- the same reason as the arm above. The note RPC does admit a
             -- waitlisted TARGET — a note about somebody queueing for the group
             -- is coherent — but such a row is reached through the group's own
             -- roster, not through this arm.
             'group_joined_at',                p.group_joined_at,
             'note',                           gn.note,
             'note_updated_by_first_name',     ned.first_name,
             'seat_offer_sent_at',             p.seat_offer_sent_at,
             'seat_offer_expiry_notified_at',  p.seat_offer_expiry_notified_at
           )
           ORDER BY p.waitlisted_at, p.id
         ), '[]'::jsonb)
    INTO v_waitlist
    FROM participations p
    JOIN profiles gmp ON gmp.id = p.participant_id
    LEFT JOIN gamer_profiles gprof ON gprof.user_id = p.participant_id
    LEFT JOIN minecraft_accounts mca ON mca.user_id = p.participant_id
    LEFT JOIN roblox_accounts rba ON rba.user_id = p.participant_id
    LEFT JOIN family_subscriptions fs
           ON fs.participation_id = p.id
          AND fs.status <> 'cancelled'
    LEFT JOIN public.gamer_group_notes gn
           ON gn.group_id       = p.group_id
          AND gn.participant_id = p.participant_id
    LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
    LEFT JOIN LATERAL (
      SELECT pp.first_name, pp.last_name
        FROM parent_gamer pgm
        JOIN profiles pp ON pp.id = pgm.parent_id
       WHERE pgm.gamer_id = p.participant_id
       ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
       LIMIT 1
    ) parent ON true
   WHERE p.product_id = p_product_id
     AND p.status = 'waitlisted';

  RETURN jsonb_build_object(
    'product_id', p_product_id,
    'groups',     v_groups,
    'unassigned', v_unassigned,
    'waitlist',   v_waitlist
  );
END;
$$;

COMMENT ON FUNCTION public.get_product_groups_with_details(p_product_id uuid) IS 'Admin-gated snapshot behind the product Groups panel: groups with their gedus and active members, the unassigned actives, and the waitlist in derived (waitlisted_at, id) order. Every participation object carries the same fields, including the two the panel''s refusal dialogs are keyed to: has_live_subscription (a real read on ALL THREE branches since 00170 — a LEFT JOIN to family_subscriptions excluding status ''cancelled'', so it means live rather than ever-existed) and has_payment_marker (a real read of stripe_checkout_session_id — money once arrived for this seat, which demotion does not clear). Both are resolved here so the panel decides a drag from one snapshot rather than asking per chip. Since 00175 the person keys are participant_* (whoever holds the seat) and the contact behind a child''s seat is parent_first_name/parent_last_name; an adult seat names none of those and carries participant_email — its own address — instead. Since 00195 each chip also carries participant_roblox_username/participant_roblox_user_id beside the Minecraft pair, so the panel can show whichever identity the product''s topic is about; the topic itself is NOT emitted here, because the page already holds the product row. Since 00203 all three branches also carry the staff-only flair — group_joined_at, note and note_updated_by_first_name — from one identical LEFT JOIN, which comes back NULL on the two group-less branches because that is the truth and because one expression is what keeps the three shapes one shape. The groups panel draws neither mark, and no admin surface reads either of them from THIS document today — the group details page renders both and reads them off get_gedu_group_feed, the copy a note write invalidates — so all three fields ride here for shape parity across the three roster readers rather than for a reader of this one. Since 00207 all three branches also carry seat_offer_sent_at and seat_offer_expiry_notified_at, on exactly the same terms: only the WAITLIST branch can hold a non-NULL value (a CHECK forbids an offer stamp on any other status) and only the waitlist card reads them, but the expression is identical in all three so the shape stays one shape. Whether an offer is LIVE is derived on the reader''s side from sent_at plus the five-day window.';

REVOKE EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_groups_with_details(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. get_admin_dashboard — the waitlist flag stops nagging once we have asked
-- ---------------------------------------------------------------------------
--
-- Body copied from supabase/schema.sql, carried forward verbatim apart from the
-- waitlist LATERAL. The `waitlist` attention item used to fire on "seats open
-- and people queueing", which is a statement about the product; what an
-- attention queue is for is "there is something for an admin to DO". Once every
-- open seat has a live offer against it there is nothing to do but wait, so the
-- condition now compares open seats against the number of live offers, and the
-- item disappears. A decline or an expiry drops the live count and raises it
-- again on its own — which is the whole reason the count is derived rather than
-- stored.
--
-- The count rides in the emitted object too, so the page can word the line as
-- "4 waitlisted · 2 seats open · 1 invited". What that buys is the REDUCED
-- urgency of an item that is still on the list: an admin reading it can see
-- that one of the two open seats has already been asked about, and that only
-- the other one wants them. It explains nothing about a product that has
-- LEFT the list — a product with no attention item emits no object at all, so
-- there is no line anywhere carrying the count that would account for its
-- absence. That is accepted: the vanished product is the case where there is
-- genuinely nothing to do.

CREATE OR REPLACE FUNCTION public.get_admin_dashboard() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_users     jsonb;
  v_queue     jsonb;
  v_attention jsonb;
  v_schedule  jsonb;
BEGIN
  PERFORM public.assert_admin();

  -- ---------------------------------------------------------------------------
  -- 1. The users strip: one tile per role, always all of them.
  --
  -- Driven by `enum_range` rather than by what `profiles` happens to contain, so
  -- a role with no accounts renders a zero tile instead of vanishing — and a
  -- role added to the enum later arrives here without an edit.
  --
  -- Two stats are NULL rather than 0, and the difference is the point. A gamer's
  -- address is a synthetic @gamer.sogverse.internal handle nobody will ever click
  -- a link in, so "0 verified" would report a problem that does not exist; NULL
  -- means the stat has no meaning for that role. `certified` is the same shape
  -- for the same reason — only an educator can be certified.
  -- ---------------------------------------------------------------------------
  SELECT jsonb_agg(
           jsonb_build_object(
             'role',      r.role_name,
             'total',     COALESCE(c.total, 0),
             'verified',  CASE WHEN r.role_name = 'gamer' THEN NULL
                               ELSE COALESCE(c.verified, 0) END,
             'certified', CASE WHEN r.role_name = 'gedu' THEN COALESCE(c.certified, 0)
                               ELSE NULL END
           )
           ORDER BY r.ord
         )
    INTO v_users
    FROM unnest(enum_range(NULL::public.user_role))
           WITH ORDINALITY AS r(role_name, ord)
    LEFT JOIN (
      SELECT pr.role,
             count(*)                                                 AS total,
             count(*) FILTER (WHERE pr.email_verified_at IS NOT NULL)  AS verified,
             count(*) FILTER (WHERE gp.certified)                      AS certified
        FROM public.profiles pr
        LEFT JOIN public.gedu_profiles gp ON gp.user_id = pr.id
       GROUP BY pr.role
    ) c ON c.role = r.role_name;

  -- ---------------------------------------------------------------------------
  -- 2. The certification queue: educators waiting on an admin's decision.
  --
  -- An INNER JOIN, deliberately. A gedu with no `gedu_profiles` row is a data
  -- error, and a LEFT JOIN would read that missing row as `certified = false` —
  -- putting a broken account in a queue whose only action (certify) writes to the
  -- row that is not there. Missing means excluded; the queue is for accounts that
  -- exist and are waiting.
  --
  -- `contract_accepted_at` (00201) is the candidate's standing against the
  -- CURRENT contract version, or NULL. It informs the certification decision and
  -- does not gate it — an unsigned candidate is still certifiable, and the admin
  -- is the one who decides what to make of the gap.
  --
  -- Standing is judged on the BASE version (00202): a version string is
  -- `<base>/<language>` and the languages of one version are the same agreement,
  -- so signing either makes a candidate current. min() because a candidate may
  -- hold both languages' rows — the first signature is the moment they agreed,
  -- and a scalar subquery would error rather than answer.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',         pr.id,
               'first_name', pr.first_name,
               'last_name',  pr.last_name,
               'created_at', pr.created_at,
               'contract_accepted_at', (
                 SELECT min(ca.accepted_at)
                   FROM public.gedu_contract_acceptances ca
                  WHERE ca.gedu_id = pr.id
                    AND split_part(ca.contract_version, '/', 1) = (
                          SELECT split_part(v.version, '/', 1)
                            FROM public.gedu_contract_versions v
                           ORDER BY v.created_at DESC, v.version DESC
                           LIMIT 1
                        )
               )
             )
             ORDER BY pr.created_at, pr.id
           ),
           '[]'::jsonb
         )
    INTO v_queue
    FROM public.profiles pr
    JOIN public.gedu_profiles gp ON gp.user_id = pr.id
   WHERE pr.role = 'gedu'
     AND gp.certified = false;

  -- ---------------------------------------------------------------------------
  -- 3. The attention queue: live products with at least one thing wrong.
  --
  -- Five kinds of wrong, and each is stated as the fact rather than as a sentence
  -- — the page words them, because the wording is translated copy.
  --
  --   * `unassigned_count`  — active seats sitting in no group. A child enrolled
  --                           and nobody looking after them is the worst of these.
  --   * `groups_without_gedu` — a group with members and no educator assigned. An
  --                           EMPTY group is not flagged: an admin building the
  --                           term's groups ahead of time has not made a mistake.
  --   * `waitlist`          — people queueing while seats stand open AND those
  --                           seats have not all been offered to somebody. Only
  --                           meaningful on a capped product with the queue
  --                           switched on. NULL when there is nothing to say.
  --   * `missing_gedu_fee`  — NULL, not zero. Zero is a volunteer session, which
  --                           is a decision somebody made; NULL is a blank field.
  --                           The assistant fee is never flagged — NULL there
  --                           means "no assistant", which is the ordinary case.
  --   * `missing_municipality_fee` — municipality clubs only; the CHECK already
  --                           forbids the column elsewhere.
  --
  -- A product with none of them is not in the list at all.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(a.doc ORDER BY a.product_id), '[]'::jsonb)
    INTO v_attention
    FROM (
      WITH candidate AS (
        SELECT p.*
          FROM public.products p
         WHERE p.status <> 'cancelled'
           AND public.effective_status(p.id) IN ('pending', 'running')
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',                  c.id,
               'product_type',        c.product_type,
               'translations',        tr.items,
               'unassigned_count',    ua.n,
               'groups_without_gedu', gw.items,
               'waitlist',
                 CASE WHEN wl.open_seats IS NOT NULL
                      THEN jsonb_build_object(
                             'waitlist_count',   wl.waitlist_count,
                             'open_seats',       wl.open_seats,
                             -- How many of those open seats already have a
                             -- family thinking about them (00207). Emitted so
                             -- the page can say why the number of open seats
                             -- and the size of the queue do not by themselves
                             -- explain the flag.
                             'live_offer_count', wl.live_offer_count
                           )
                 END,
               'missing_gedu_fee', (c.primary_gedu_fee_cents IS NULL),
               'missing_municipality_fee',
                 (c.product_type = 'municipality_club'
                  AND c.municipality_fee_cents IS NULL)
             ) AS doc
        FROM candidate c
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('locale', pt.locale, 'name', pt.name)
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) tr
        CROSS JOIN LATERAL (
          SELECT count(*) AS n
            FROM public.participations pa
           WHERE pa.product_id = c.id
             AND pa.status = 'active'
             AND pa.group_id IS NULL
        ) ua
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('id', g.id, 'name', g.name)
                            ORDER BY g.name, g.id
                          )
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                      AND EXISTS (
                            SELECT 1 FROM public.participations pa
                             WHERE pa.group_id = g.id AND pa.status = 'active'
                          )
                      AND NOT EXISTS (
                            SELECT 1 FROM public.gedu_group_assignments ga
                             WHERE ga.group_id = g.id
                          )
                 ), '[]'::jsonb) AS items
        ) gw
        -- The waitlist flag asks "is there something for an admin to do here",
        -- not "is this product in an interesting state" (00207). An open seat
        -- that has already been offered to a family is being dealt with, so it
        -- is subtracted before the comparison; a product whose every open seat
        -- carries a live offer drops out of the queue entirely. When that family
        -- declines, or the five days run out, the live count falls and the flag
        -- comes back on its own — which is exactly why the count is derived
        -- from the stamp rather than stored anywhere.
        LEFT JOIN LATERAL (
          SELECT psc.waitlist_count,
                 c.seat_count - psc.active_count AS open_seats,
                 lo.n                            AS live_offer_count
            FROM public.product_seat_counts psc
            CROSS JOIN LATERAL (
              SELECT count(*)::integer AS n
                FROM public.participations po
               WHERE po.product_id = c.id
                 AND po.status = 'waitlisted'
                 AND po.seat_offer_sent_at IS NOT NULL
                 AND po.seat_offer_sent_at + interval '5 days' > now()
            ) lo
           WHERE psc.product_id = c.id
             AND c.waitlist_enabled
             AND psc.waitlist_count > 0
             AND c.seat_count IS NOT NULL
             AND psc.active_count < c.seat_count
             AND (c.seat_count - psc.active_count) > lo.n
        ) wl ON true
       WHERE ua.n > 0
          OR jsonb_array_length(gw.items) > 0
          OR wl.open_seats IS NOT NULL
          OR c.primary_gedu_fee_cents IS NULL
          OR (c.product_type = 'municipality_club'
              AND c.municipality_fee_cents IS NULL)
    ) a;

  -- ---------------------------------------------------------------------------
  -- 4. The schedule set: the calendar facts the page resolves weeks from.
  --
  -- Slots carry the weekday exactly as the column stores it (0 = Monday) and the
  -- start time as a bare HH:MM wall clock in the product's own zone — the admin
  -- schedule is deliberately read in the zone it was authored in.
  --
  -- Holidays are bounded to the same window as the products themselves: a
  -- calendar can hold years of dates and only the ones a visible week could land
  -- on mean anything here.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(s.doc ORDER BY s.product_id), '[]'::jsonb)
    INTO v_schedule
    FROM (
      WITH candidate AS (
        SELECT p.*, w.window_start, w.window_end
          FROM public.products p
          CROSS JOIN LATERAL (
            SELECT (now() AT TIME ZONE p.timezone)::date - 30 AS window_start,
                   ((now() AT TIME ZONE p.timezone)::date
                     + INTERVAL '4 months')::date             AS window_end
          ) w
         WHERE p.status NOT IN ('cancelled', 'completed')
           AND (
                 public.effective_status(p.id) IN ('pending', 'running')
              OR (p.end_date IS NOT NULL
                  AND p.end_date >= w.window_start
                  AND p.end_date <  w.window_end)
               )
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',             c.id,
               'product_type',   c.product_type,
               'translations',   tr.items,
               'timezone',       c.timezone,
               'start_date',     c.start_date,
               'end_date',       c.end_date,
               'seat_count',     c.seat_count,
               'active_count',   COALESCE(psc.active_count, 0),
               'waitlist_count', COALESCE(psc.waitlist_count, 0),
               'schedule_slots', sl.items,
               'holidays',       hol.items
             ) AS doc
        FROM candidate c
        LEFT JOIN public.product_seat_counts psc ON psc.product_id = c.id
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('locale', pt.locale, 'name', pt.name)
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) tr
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'weekday',          ss.weekday,
                              'start_time',       to_char(ss.start_time, 'HH24:MI'),
                              'duration_minutes', ss.duration_minutes
                            )
                            ORDER BY ss.weekday, ss.start_time
                          )
                     FROM public.schedule_slots ss
                    WHERE ss.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) sl
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(DISTINCT ch.date ORDER BY ch.date)
                     FROM public.product_holiday_calendars phc
                     JOIN public.calendar_holidays ch
                       ON ch.calendar_id = phc.calendar_id
                    WHERE phc.product_id = c.id
                      AND ch.date >= c.window_start
                      AND ch.date <  c.window_end
                 ), '[]'::jsonb) AS items
        ) hol
    ) s;

  RETURN jsonb_build_object(
    'users',              v_users,
    'certification_queue', v_queue,
    'attention_products', v_attention,
    'schedule_products',  v_schedule
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_dashboard() IS 'The whole admin dashboard in one document: per-role user counts (email-verified and, for gedus, certified — both NULL where the stat has no meaning for the role), the uncertified-gedu queue, live products carrying at least one ops issue, and the calendar facts the schedule and coming-up feed resolve weeks from. Admin-only, guard-first on assert_admin. Since 00201 each queue candidate also carries contract_accepted_at — when they accepted the current gedu contract, or NULL — which informs the certification decision without gating it; since 00202 that standing is judged on the version''s BASE, so either equally binding language of the current version counts, and a candidate holding both carries the earlier of the two signatures. Since 00207 the waitlist attention item asks whether there is something for an admin to DO rather than what state the product is in: an open seat that already carries a live seat offer is subtracted, so a product whose every open seat has been offered drops out of the queue, and a decline or an expiry raises it again on its own. The count rides in the emitted object as live_offer_count so the page can explain the absence. Both product sections ask effective_status() rather than products.status, and every date window is computed in the product''s own timezone. Product names are shipped as the whole product_translations array because which one to read is a property of the reader, exactly as every other admin surface treats them.';

REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard() TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Assert the end state this migration claims
-- ---------------------------------------------------------------------------

DO $assert$
DECLARE
  v_src text;
BEGIN
  -- (a) The columns and their constraints exist.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'participations'
       AND column_name IN ('seat_offer_sent_at', 'seat_offer_expiry_notified_at')
     GROUP BY table_name HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'participations is missing a seat-offer stamp column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.participations'::regclass
       AND conname = 'chk_participations_offer_only_when_waitlisted'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.participations'::regclass
       AND conname = 'chk_participations_offer_notice_needs_offer'
  ) THEN
    RAISE EXCEPTION 'a seat-offer CHECK constraint did not take';
  END IF;

  -- (b) The window literal is spelled identically in every function that reads
  -- it. This is the SQL half of the lockstep with SEAT_OFFER_WINDOW_DAYS; a
  -- rewrite that changed one function's interval and not the others would make
  -- an offer live for one reader and expired for another.
  FOR v_src IN
    SELECT p.prosrc
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('send_seat_offer', 'respond_seat_offer',
                         'claim_expired_seat_offer_notifications',
                         'get_admin_dashboard')
  LOOP
    IF position('interval ''5 days''' IN v_src) = 0 THEN
      RAISE EXCEPTION 'a seat-offer reader lost its five-day window literal';
    END IF;
  END LOOP;

  -- (c) The stamp is truncated to milliseconds, or every emailed link is
  -- unmatchable. The one line in this file that looks cosmetic and is not.
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'send_seat_offer';
  IF position('date_trunc(''milliseconds''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'send_seat_offer stamps sub-millisecond precision — no emailed token could ever match it';
  END IF;

  -- (d) The two recreated readers kept the fields this migration added, and
  -- promote_from_waitlist still clears the offer.
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'promote_from_waitlist';
  IF position('seat_offer_sent_at = NULL' IN v_src) = 0 THEN
    RAISE EXCEPTION 'promote_from_waitlist no longer clears the seat offer — the CHECK would refuse the promotion';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_product_groups_with_details';
  IF (length(v_src) - length(replace(v_src, '''seat_offer_sent_at''', ''))) / length('''seat_offer_sent_at''') <> 3 THEN
    RAISE EXCEPTION 'get_product_groups_with_details does not emit seat_offer_sent_at on all three arms';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_admin_dashboard';
  IF position('live_offer_count' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_admin_dashboard lost live_offer_count while being retyped';
  END IF;

  -- (e) The grants are what this file says they are. The three new functions
  -- are service-role only; the two recreated ones came back as they went in.
  IF NOT has_function_privilege('service_role', 'public.send_seat_offer(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.respond_seat_offer(uuid, timestamptz, boolean)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.claim_expired_seat_offer_notifications()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'a seat-offer function is missing its service_role EXECUTE grant';
  END IF;

  IF has_function_privilege('authenticated', 'public.send_seat_offer(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.send_seat_offer(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.respond_seat_offer(uuid, timestamptz, boolean)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.respond_seat_offer(uuid, timestamptz, boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.claim_expired_seat_offer_notifications()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.claim_expired_seat_offer_notifications()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'a seat-offer function is callable by a session role — the REVOKE FROM PUBLIC did not take';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.promote_from_waitlist(uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_product_groups_with_details(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_admin_dashboard()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'a recreated function lost its authenticated EXECUTE grant';
  END IF;

  IF has_function_privilege('anon', 'public.promote_from_waitlist(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_product_groups_with_details(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_admin_dashboard()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'a recreated function is executable by anon — the REVOKE FROM PUBLIC did not take';
  END IF;
END
$assert$;
