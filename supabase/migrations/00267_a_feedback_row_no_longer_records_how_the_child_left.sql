-- A feedback row no longer records how the child left.
--
-- WHY
--
-- 00254 added `session_feedback.exit_reason` — `left` when the child pressed
-- Leave, `ended` when the room closed under everyone — on the reasoning that
-- it is only knowable at write time. 00266 then made it NOT NULL so the Lynx
-- partner API's `/feedback` could publish it as one of two words.
--
-- Nobody reads it. No surface of the app shows it, no report counts it, and
-- the partner it was published for never asked for it (owner decision,
-- 2026-09-17). A column every writer has to fill and no reader uses is a cost
-- with nothing on the other side: the voice page carries state to compute it,
-- the service and its tests carry a type for it, and the partner contract
-- carries a promise about it. The feedback system has not reached production
-- and the partner API has no real consumer yet, so the column and every use
-- of it go now, rather than after something starts depending on it.
--
-- The values go with it. With the feedback system not yet in production, the
-- only ones that exist are staging's.
--
-- 00266 is already applied and is never amended, so this is a new migration.
-- Dropping the column drops its CHECK with it (a single-column constraint goes
-- with its column); the constraint is dropped by name first anyway, so the
-- statement says what it removes rather than leaving it implied.

ALTER TABLE public.session_feedback
  DROP CONSTRAINT chk_session_feedback_exit_reason;

ALTER TABLE public.session_feedback
  DROP COLUMN exit_reason;

-- The end state, asserted against the catalog: neither the column nor its
-- constraint exists. A from-scratch build that reached a different state — a
-- later migration re-adding either — fails here rather than shipping a column
-- the code no longer writes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_attribute a
     WHERE a.attrelid = 'public.session_feedback'::regclass
       AND a.attname = 'exit_reason'
       AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'session_feedback.exit_reason still exists';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_constraint c
     WHERE c.conrelid = 'public.session_feedback'::regclass
       AND c.conname = 'chk_session_feedback_exit_reason'
  ) THEN
    RAISE EXCEPTION 'chk_session_feedback_exit_reason still exists';
  END IF;
END
$$;
