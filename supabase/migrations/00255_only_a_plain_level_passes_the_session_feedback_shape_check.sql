-- A session feedback answer has to BE a level, not merely contain one.
--
-- WHY
--
-- `00254` bounded the shape of `session_feedback.answers` with, among other
-- clauses, "no member matches the BAD predicate":
--
--   NOT (answers @? '$.* ? (@.type() != "number" || @ < 1 || @ > 5
--                           || @.floor() != @)')
--
-- That jsonpath carries no mode word, so it runs in the SQL/JSON default, LAX,
-- and lax mode AUTO-UNWRAPS an array wherever a step or a filter wants a
-- scalar. So a member that is an array is never judged as an array: `{"learned":
-- [3]}` unwraps to the number 3, which is a perfectly good level, matches
-- nothing BAD and is stored; `{"learned": []}` unwraps to nothing at all, so
-- the filter has no item to judge and it is stored too. Both are values no
-- reader of this column can render, admitted by a constraint written to keep
-- exactly them out.
--
-- WHY STRICT MODE IS THE WHOLE FIX
--
-- In STRICT mode the wildcard yields each member as it actually is, with no
-- unwrapping, so `@.type()` answers for the member rather than for something
-- extracted from it: `"array"` for `[3]` and for `[]`, `"object"` for
-- `{"a": 1}`, `"null"` for a JSON null, `"boolean"` for `true`. Every one of
-- them fails `@.type() != "number"` — that is, matches BAD — and is refused.
-- A genuine number is unaffected: its type is `number` and the three numeric
-- comparisons decide it exactly as before.
--
-- WHY THE NEGATIVE FORM SURVIVES THE MODE CHANGE
--
-- Stating it negatively is safe only if no BAD member can go unjudged, because
-- `@?` deliberately suppresses errors (missing field, unexpected item type,
-- numeric) and a suppressed member would read as "nothing bad here". Nothing
-- here can be suppressed: `.type()` is defined on every JSON item and never
-- errors, and it is the FIRST disjunct, so for every non-number member the `||`
-- is already true and the comparisons that could error are never what decides.
-- For a number member none of them can error. So the negative form is exact in
-- strict mode, and it stays the clause that is readable as the rule it encodes
-- — "no member is anything other than an integer from 1 to 5".
--
-- The one thing strict mode would change for the worse is what happens when
-- `answers` is not an object at all: `strict $.*` on an array or a scalar is a
-- structural error. `@?` suppresses precisely that error and answers false, so
-- the clause stays well-behaved whatever order the planner evaluates the AND
-- in, and the `jsonb_typeof` clause below is what actually refuses those.
--
-- WHAT IS RE-ASSERTED
--
-- A constraint may not be edited in place, so this drops `00254`'s and adds the
-- constraint of the same name back. A replacement re-asserts every invariant it
-- supersedes, re-derived rather than copied: `answers` is a JSON object; it
-- holds at most 32 entries, counted through `$.keyvalue()` in LAX mode so that a
-- non-object yields an empty array instead of an error; and every value is an
-- integer from 1 to 5, `@.floor() != @` being the integrality half that refuses
-- 3.5 and admits 3. Keys stay deliberately unconstrained — adding or removing a
-- statement is a code edit with no migration, which is the freedom this
-- constraint bounds rather than the thing it checks.
--
-- Nothing else about the table changes: the note cap, the exit reason, the key,
-- the policies and the grants are all still `00254`'s.

ALTER TABLE public.session_feedback
  DROP CONSTRAINT chk_session_feedback_answers_shape;

ALTER TABLE public.session_feedback
  ADD CONSTRAINT chk_session_feedback_answers_shape CHECK (
    jsonb_typeof(answers) = 'object'
    AND jsonb_array_length(
          jsonb_path_query_array(answers, 'lax $.keyvalue()'::jsonpath)
        ) <= 32
    AND NOT (
      answers @? 'strict $.* ? (@.type() != "number" || @ < 1 || @ > 5 || @.floor() != @)'::jsonpath
    )
  );

COMMENT ON CONSTRAINT chk_session_feedback_answers_shape
  ON public.session_feedback IS
  'The shape of `answers`, and only the shape: a JSON object, at most 32 '
  'entries, every value an integer from 1 to 5. The value clause is jsonpath '
  'in STRICT mode on purpose — lax mode auto-unwraps arrays, so `{"k": [3]}` '
  'and `{"k": []}` both slipped past it as levels. Keys are deliberately '
  'unconstrained: a statement is added or retired in the code catalogue with '
  'no migration, and this constraint is the bound on that freedom.';
