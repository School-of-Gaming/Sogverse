-- A seat ends instead of disappearing.
--
-- WHAT THIS CHANGES
--
-- 1. `participation_status` loses `completed`, which no code ever wrote (a seat
--    on a finished product is derived from the product's dates; any row holding
--    it becomes `active`), and gains
--    `ended`: a seat that was held and is not any more. PostgreSQL cannot drop
--    an enum value, so the type is recreated, and with it every object that
--    names it in a definition: the column, its two CHECKs, its three partial
--    indexes, the two status triggers and participation_state().
-- 2. `participations` gains `ended_at` and `end_reason`, both set exactly when
--    the status is `ended`. An ended seat keeps its group_id: the family goes on
--    reading the group's feed and reports up to the day the seat ended.
-- 3. The partial unique index over a participant's place on a product covers
--    active and waitlisted rows only, so a family that left can enrol again.
-- 4. `is_live_seat()` names the one status that holds a seat now.

-- ---------------------------------------------------------------------------
-- 1. The status type
-- ---------------------------------------------------------------------------

-- No code ever wrote `completed`, but a hand-made row can hold it (staging had
-- one, a camp seat from before this change; production had none). Such a seat
-- was held to the end of its product, which is exactly what an `active` seat on
-- a product whose dates have passed now means, so it becomes one.
UPDATE public.participations SET status = 'active' WHERE status::text = 'completed';

DROP TRIGGER participations_klaviyo_changed ON public.participations;
DROP TRIGGER trg_participations_refresh_counts_upd ON public.participations;
DROP INDEX public.idx_participations_active;
DROP INDEX public.idx_participations_waitlisted;
DROP INDEX public.uq_participations_active_or_waitlisted;
ALTER TABLE public.participations
  DROP CONSTRAINT chk_participations_offer_only_when_waitlisted,
  DROP CONSTRAINT chk_participations_waitlisted_has_timestamp;
DROP FUNCTION public.participation_state(public.participation_status, uuid);

ALTER TYPE public.participation_status RENAME TO participation_status_retired;

CREATE TYPE public.participation_status AS ENUM (
  'reserving',
  'active',
  'waitlisted',
  'ended'
);

COMMENT ON TYPE public.participation_status IS 'Where a participation stands. active: it holds a seat now. waitlisted: a place in line, not a seat; leaving the line deletes the row. ended: it held a seat and does not any more, kept so who was in which club, when, and why they left survives, with ended_at and end_reason saying when and why (end_participation is the one writer). Whether the product itself has finished is derived from its dates and never stored here. ''reserving'' is RETIRED (2026-08): paid participations are created at payment confirmation, so nothing writes it; it stays listed because rows written before then may carry it.';

ALTER TABLE public.participations
  ALTER COLUMN status TYPE public.participation_status
  USING status::text::public.participation_status;

DROP TYPE public.participation_status_retired;

ALTER TABLE public.participations
  ADD CONSTRAINT chk_participations_offer_only_when_waitlisted
    CHECK (seat_offer_sent_at IS NULL OR status = 'waitlisted'),
  ADD CONSTRAINT chk_participations_waitlisted_has_timestamp
    CHECK (status <> 'waitlisted' OR waitlisted_at IS NOT NULL);

CREATE INDEX idx_participations_active
  ON public.participations USING btree (product_id)
  WHERE status = 'active';

CREATE INDEX idx_participations_waitlisted
  ON public.participations USING btree (product_id, waitlisted_at)
  WHERE status = 'waitlisted';

-- Ended rows are outside it on purpose: a family that left can enrol again.
CREATE UNIQUE INDEX uq_participations_active_or_waitlisted
  ON public.participations USING btree (product_id, participant_id)
  WHERE status IN ('active', 'waitlisted');

CREATE TRIGGER participations_klaviyo_changed
  AFTER UPDATE OF status, product_id, seat_offer_sent_at ON public.participations
  FOR EACH ROW
  WHEN (old.status IS DISTINCT FROM new.status
        OR old.product_id IS DISTINCT FROM new.product_id
        OR old.seat_offer_sent_at IS DISTINCT FROM new.seat_offer_sent_at)
  EXECUTE FUNCTION public.klaviyo_participation_changed();

CREATE TRIGGER trg_participations_refresh_counts_upd
  AFTER UPDATE OF status, product_id ON public.participations
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_product_seat_counts();

CREATE FUNCTION public.participation_state(p_status public.participation_status, p_group_id uuid) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT CASE
    WHEN p_status = 'waitlisted' THEN 'waitlisted'
    WHEN p_group_id IS NULL      THEN 'unassigned'
    ELSE 'assigned'
  END;
$$;

REVOKE ALL ON FUNCTION public.participation_state(public.participation_status, uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.participation_state(public.participation_status, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. When and why a seat ended
-- ---------------------------------------------------------------------------

CREATE TYPE public.participation_end_reason AS ENUM (
  'subscription_cancelled',
  'admin_removed'
);

COMMENT ON TYPE public.participation_end_reason IS 'Why a seat ended. subscription_cancelled: its Stripe subscription was deleted (customer.subscription.deleted), whether the family cancelled in the portal or Stripe gave up on the payments. admin_removed: an admin took the seat away (admin_remove_participation).';

ALTER TABLE public.participations
  ADD COLUMN ended_at timestamp with time zone,
  ADD COLUMN end_reason public.participation_end_reason,
  ADD CONSTRAINT chk_participations_ended_iff_ended_at
    CHECK ((status = 'ended') = (ended_at IS NOT NULL)),
  ADD CONSTRAINT chk_participations_ended_iff_end_reason
    CHECK ((status = 'ended') = (end_reason IS NOT NULL));

COMMENT ON COLUMN public.participations.ended_at IS 'When the seat ended, set by end_participation; NULL exactly when the status is not ended (chk_participations_ended_iff_ended_at). An ended seat keeps its group_id and group_joined_at, so its family reads the group''s feed and reports up to this instant, or to the end of the period its subscription had paid for when that is later.';

COMMENT ON COLUMN public.participations.end_reason IS 'Why the seat ended, set with ended_at by end_participation; NULL exactly when the status is not ended (chk_participations_ended_iff_end_reason).';

COMMENT ON TABLE public.participations IS 'One row per seat on a product, held now or held once: who holds it, who pays for it, which group they sit in and what state the seat is in. A seat that ends is kept with status ended (end_participation), never deleted, so the history of who was in which club survives; only a waitlisted row, which never held a seat, is deleted when it leaves the line, and trg_participations_guard_delete refuses any other delete outside an erasure. Some of its columns are settled by triggers rather than by any caller, and are therefore invisible at the call site: updated_at is touched on every write, a group_id naming a group of another product is rejected by trg_validate_participations_group, and group_joined_at is stamped by trg_participations_stamp_group_joined_at whenever group_id is set, changed or cleared — group_id has at least five writers, including the ON DELETE SET NULL cascade from product_groups, which is why the stamp lives in a trigger and not in an RPC. Do not set group_joined_at by hand: chk_participations_group_joined_at_iff_group refuses a stamp out of step with group_id.';

-- ---------------------------------------------------------------------------
-- 3. Which status holds a seat now
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.is_live_seat(p_status public.participation_status) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT p_status = 'active'::public.participation_status;
$$;

COMMENT ON FUNCTION public.is_live_seat(p_status public.participation_status) IS 'Whether a participation in this status holds a seat now: active, and nothing else. waitlisted is a place in line, ended held a seat once, and reserving is retired. A reader that means "who is in the club" asks this rather than listing statuses of its own.';

REVOKE ALL ON FUNCTION public.is_live_seat(public.participation_status) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_live_seat(public.participation_status) TO service_role;
