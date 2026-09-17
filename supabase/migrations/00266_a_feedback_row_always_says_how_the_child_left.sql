-- A feedback row always says how the child left.
--
-- WHY
--
-- 00254 left `session_feedback.exit_reason` nullable on purpose: "a row whose
-- writer genuinely does not know says so, instead of picking one of the two".
-- No such writer ever arrived. The table has exactly one writer — the voice
-- session page's Done, through the session-feedback service — and it always
-- knows which path it is on: its input type makes the reason a required
-- `left` | `ended`, so a NULL has never been written and cannot be written by
-- the code that exists.
--
-- A nullable column nobody writes NULL into is still a question every reader
-- has to answer. The Lynx partner API's `/feedback` is the first reader, and
-- its published contract names `exit_reason` as one of two words, never null.
-- Leaving the column nullable would make that reader invent a handling for a
-- state that cannot occur — and the house rule for such a state is that it
-- fails loudly at the schema rather than being guessed at downstream. So the
-- schema now says what the writer already guarantees.
--
-- `SET NOT NULL` refuses to run if any row holds a NULL, which is the loud
-- failure wanted: were one ever to exist, this migration stops on it rather
-- than papering over it with an invented reason.
--
-- The CHECK keeps its value list and loses its NULL arm, which the NOT NULL
-- has made dead: a constraint that still reads "or null" would tell the next
-- reader a null is a legal value when the column refuses one.

ALTER TABLE public.session_feedback
  ALTER COLUMN exit_reason SET NOT NULL;

ALTER TABLE public.session_feedback
  DROP CONSTRAINT chk_session_feedback_exit_reason;

ALTER TABLE public.session_feedback
  ADD CONSTRAINT chk_session_feedback_exit_reason CHECK (
    exit_reason IN ('left', 'ended')
  );

COMMENT ON COLUMN public.session_feedback.exit_reason IS
  '`left` (the child pressed Leave) or `ended` (Daily closed the room), kept '
  'because it is only knowable at write time — the page knows which path it is '
  'on and no later reader could reconstruct it. NOT NULL (00266): the one '
  'writer always knows which path it took, and the partner API reports the '
  'value as one of the two words, never null. `ended` includes any post-join '
  'disconnect, a failed network among them; separating those is a reader''s '
  'problem and deliberately not solved here.';

-- The end state, asserted: the column refuses NULL, and the constraint no
-- longer admits one. Stated against the catalog rather than trusted to the
-- statements above, so a from-scratch build that reached a different state —
-- a later migration re-adding the NULL arm under the same name, say — fails
-- here instead of shipping a contract the partner API cannot keep.
DO $$
DECLARE
  v_nullable   boolean;
  v_check_expr text;
BEGIN
  SELECT NOT a.attnotnull
    INTO v_nullable
    FROM pg_attribute a
   WHERE a.attrelid = 'public.session_feedback'::regclass
     AND a.attname = 'exit_reason';

  IF v_nullable IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'session_feedback.exit_reason is still nullable';
  END IF;

  SELECT pg_get_constraintdef(c.oid)
    INTO v_check_expr
    FROM pg_constraint c
   WHERE c.conrelid = 'public.session_feedback'::regclass
     AND c.conname = 'chk_session_feedback_exit_reason';

  IF v_check_expr IS NULL THEN
    RAISE EXCEPTION 'chk_session_feedback_exit_reason is missing';
  END IF;

  IF v_check_expr ILIKE '%NULL%' THEN
    RAISE EXCEPTION 'chk_session_feedback_exit_reason still admits NULL: %',
      v_check_expr;
  END IF;
END
$$;
