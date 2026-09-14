-- A gamer leaving an online session keeps the answers they gave on the way out.
--
-- WHY
--
-- The leave-and-ended feedback screen already exists and already asks five
-- statements and offers a note; its Done throws every answer away and
-- navigates. Every session that runs before this table exists is a session
-- whose readings are lost, and a child who writes a note into a box that keeps
-- nothing is the outcome the investigation named as worse than not asking.
-- This migration is the place the screen saves to, and nothing else — reading
-- the answers back (a gedu view, an admin view, trends) is deliberately later
-- work, which is why no index beyond the key exists yet.
--
-- WHY THE KEY IS (group, participant, session_opens_at) AND NOT A SESSION ROW
--
-- `group_sessions` is materialised lazily by staff-only callers, so a
-- participant-written row that needed one would either manufacture phantom
-- sessions in staff feeds or refuse a legitimate answer. In-call chat solved
-- exactly this problem by keying its channel on the group plus the window
-- instant, and the voice token response already hands every joiner that same
-- instant — so the three columns below are a join key a later reader can line
-- up against chat, attendance and anything else keyed the same way, and the
-- row never depends on a session row existing.
--
-- WHY THERE IS NO FUNCTION AND NO ROUTE
--
-- The child writes their own row through RLS, as in-call chat's clients do for
-- their reads. A self-scoping RPC was drafted and taken apart: the only
-- server-side window derivation is keyed by date, returns one slot per weekday
-- and reads the CURRENT schedule, so it would refuse legitimate feedback on a
-- product with two slots in one day and after any schedule edit, and it does
-- not carry the join margin the open instant carries. Chat validates its window
-- because a FAMILY read bound depends on it; a feedback row's key bounds
-- nothing, so the check would have guarded only against a gamer mis-keying
-- their own row — at the cost of a function, a spine entry and a third copy of
-- the schedule arithmetic.
--
-- WHY THE QUESTIONS ARE NOT IN THE SCHEMA
--
-- `answers` is a jsonb object of item key -> level. No enum, no check
-- enumerating the keys, no column per question: adding or removing a statement
-- is an edit to the typed catalogue in the feature directory plus message
-- strings, with no migration and no type regeneration. The constraints below
-- bound the SHAPE and nothing else, and a later reader ignores keys the
-- catalogue no longer holds.

CREATE TABLE public.session_feedback (
  group_id         uuid NOT NULL
                     REFERENCES public.product_groups(id) ON DELETE CASCADE,
  participant_id   uuid NOT NULL
                     REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_opens_at timestamptz NOT NULL,
  answers          jsonb NOT NULL DEFAULT '{}'::jsonb,
  note             text NOT NULL DEFAULT '',
  exit_reason      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- The three columns ARE the identity: one row per child, per group, per
  -- session window, and the upsert the screen performs conflicts on exactly
  -- this. A surrogate id would add a second index to a table whose only access
  -- path is this key — the child's prefill read and the child's write both go
  -- through it — so the natural key is the primary key.
  PRIMARY KEY (group_id, participant_id, session_opens_at),

  -- The shape of `answers`, in one constraint and expressed without a
  -- subquery (a CHECK may not contain one), so every clause is an ordinary
  -- immutable expression:
  --   * a JSON object, never an array, a scalar or a JSON null;
  --   * at most 32 entries — jsonb_path_query_array over `$.keyvalue()` yields
  --     one array element per member, and lax mode makes that an empty array
  --     rather than an error for anything that is not an object;
  --   * every value an integer from 1 to 5 — stated as "no member matches the
  --     BAD predicate", because an OR of clauses is what makes a wrong TYPE
  --     (where the numeric comparisons are merely unknown) still count as bad.
  --     `@.floor() != @` is the integrality half: 3.5 is refused, 3 is not.
  -- Keys are deliberately unconstrained.
  CONSTRAINT chk_session_feedback_answers_shape CHECK (
    jsonb_typeof(answers) = 'object'
    AND jsonb_array_length(
          jsonb_path_query_array(answers, '$.keyvalue()'::jsonpath)
        ) <= 32
    AND NOT (
      answers @? '$.* ? (@.type() != "number" || @ < 1 || @ > 5 || @.floor() != @)'::jsonpath
    )
  ),

  -- The cap the constraint owns, as the chat body's does, so the client cannot
  -- re-measure it differently. The same number lives as a constant beside the
  -- catalogue for the composer's own limit.
  CONSTRAINT chk_session_feedback_note_length CHECK (char_length(note) <= 2000),

  -- Which exit path the child left by. Nullable rather than NOT NULL: a row
  -- whose writer genuinely does not know says so, instead of picking one of
  -- the two and making a later reader believe it.
  CONSTRAINT chk_session_feedback_exit_reason CHECK (
    exit_reason IS NULL OR exit_reason IN ('left', 'ended')
  )
);

COMMENT ON TABLE public.session_feedback IS
  'What ONE CHILD answered on the way out of ONE online session — the five-ish '
  'statements of the leave/ended feedback screen plus an optional note. NOT '
  '`feedback_submissions`, which is the help card''s free-text box anybody may '
  'send from anywhere about anything; the two names sit side by side forever, '
  'and this is the one keyed to a session. One row per (group, participant, '
  'session window), written and read by the child themselves through RLS — no '
  'function, no route. THE LAST DONE WINS: a child who drops out, rejoins and '
  'leaves again updates the row they already have, including emptying it, '
  'which is an update with an empty object and an empty note and never a '
  'delete. A first-time Done with nothing on screen writes no row at all, '
  'because the response rate''s denominator is the sessions themselves. Both '
  'foreign keys CASCADE, so a family closing its account takes its child''s '
  'feedback with it, which is what the privacy page promises about retention.';

COMMENT ON COLUMN public.session_feedback.session_opens_at IS
  'The instant the session window opened, CLIENT-ASSERTED: it arrives from the '
  'voice token response the room already holds and nothing here validates it. '
  'That is safe because this column BOUNDS NOTHING — it is a join key, and a '
  'forged value can only mis-key the forger''s own row, which the policies '
  'have already confined to them. Contrast chat_channels.session_opens_at, '
  'which carries the same name and the opposite trust: it is server-derived '
  'because it bounds what a FAMILY may read. Two columns with one name and '
  'opposite provenance have to be told apart at the column, not from memory.';

COMMENT ON COLUMN public.session_feedback.answers IS
  'Item key -> level, for the answered items only; `{}` is a legal stored '
  'value and is what an emptied form writes. Keys are the catalogue''s stable '
  'text identifiers and are deliberately unconstrained, so adding or removing '
  'a statement is a code edit with no migration; a reader ignores keys the '
  'catalogue no longer holds. Only the shape is checked.';

COMMENT ON COLUMN public.session_feedback.exit_reason IS
  '`left` (the child pressed Leave) or `ended` (Daily closed the room), kept '
  'because it is only knowable at write time — the page knows which path it is '
  'on and no later reader could reconstruct it. `ended` includes any '
  'post-join disconnect, a failed network among them; separating those is a '
  'reader''s problem and deliberately not solved here.';

CREATE TRIGGER session_feedback_updated_at
  BEFORE UPDATE ON public.session_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.session_feedback ENABLE ROW LEVEL SECURITY;

-- The predicate, three times over: the caller IS the participant named on the
-- row, AND the caller holds an ACTIVE PARTICIPATION in the group — the seat
-- check the voice token route makes for a gamer, reusing the existing
-- `has_active_participation_in_group` rather than writing a second definition
-- of "active participation in a group". Deliberately NOT the voice-room
-- membership predicate the chat and zone policies use: that one admits
-- assigned gedus and admins, who would then be able to write session feedback
-- about themselves. Both halves are needed — the actor half alone would let a
-- non-member key a row to a group they have never been in, and the target half
-- alone would let a seat-holder write a row in somebody else's name.
CREATE POLICY session_feedback_select
  ON public.session_feedback
  FOR SELECT
  TO authenticated
  USING (
    participant_id = (SELECT auth.uid())
    AND (SELECT public.has_active_participation_in_group(group_id))
  );

CREATE POLICY session_feedback_insert
  ON public.session_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (
    participant_id = (SELECT auth.uid())
    AND (SELECT public.has_active_participation_in_group(group_id))
  );

-- USING and WITH CHECK carry the same predicate, which is what stops an
-- existing row being re-keyed to another group or another child on the way
-- through: USING decides which rows the statement can see, WITH CHECK decides
-- what they are allowed to become.
CREATE POLICY session_feedback_update
  ON public.session_feedback
  FOR UPDATE
  TO authenticated
  USING (
    participant_id = (SELECT auth.uid())
    AND (SELECT public.has_active_participation_in_group(group_id))
  )
  WITH CHECK (
    participant_id = (SELECT auth.uid())
    AND (SELECT public.has_active_participation_in_group(group_id))
  );

-- No DELETE policy and no DELETE grant: withdrawing is an emptied form, which
-- is an ordinary update. Rows leave only by CASCADE.
--
-- `authenticated` gets exactly the three privileges the policies authorize;
-- `service_role` gets the full set, as the chat tables do and as every table
-- here does — it is the role the DB suite's admin client and the readers that
-- come later act as. Nothing for `anon`: a row is a child's own words.
GRANT SELECT, INSERT, UPDATE ON TABLE public.session_feedback TO authenticated;
GRANT ALL ON TABLE public.session_feedback TO service_role;
