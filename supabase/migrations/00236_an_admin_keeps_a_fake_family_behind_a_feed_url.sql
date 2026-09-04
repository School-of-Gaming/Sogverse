-- An admin keeps a fake family behind a calendar-feed URL.
--
-- WHY THIS IS A TABLE AND NOT COMPONENT STATE
--
-- The admin testing card can already mint a feed URL for a real customer and
-- show what the document says. What it cannot do is answer the question the
-- feature actually turns on: *what does a subscribed calendar do when the data
-- changes* — a gamer joins a second club, a camp's dates move, a seat is
-- cancelled mid-term. Answering it means editing the data and then waiting for
-- Google, Apple or Outlook to poll again.
--
-- Those polls come from the vendors' own servers, minutes to hours later, with
-- no session and no browser involved. So the edited family has to be readable
-- by a request that arrives long after the admin closed the tab — which rules
-- out component state, `localStorage`, and anything encoded into the URL (the
-- URL is a credential a client stores forever; re-issuing it on every edit
-- would mean re-subscribing on every edit). It has to be a row.
--
-- WHY IT IS A DOCUMENT AND NOT A SCHEMA
--
-- The rows describe a family that does not exist: fake gamers, fake products,
-- fake seats. Modelling them as real `profiles`/`products`/`participations`
-- would put invented rows into the tables every other feature reads, joins and
-- counts, and every one of those features would have to learn to exclude them.
-- One jsonb document per admin keeps the whole fiction inside a table nothing
-- else looks at, and its shape is owned by a zod schema on both ends of the
-- write — which is the right place for it, because the shape follows what the
-- feed exploration wants to try rather than what the platform stores.
--
-- ONE ROW PER ADMIN
--
-- `owner_id` is UNIQUE. An admin has one sandbox, always — the card reads it on
-- open, creates it from the default on first read, and saves over it. A second
-- one would need a picker, a name and a notion of which one a feed URL means,
-- for a tool whose whole job is "edit this, watch that".

CREATE TABLE public.calendar_feed_sandboxes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL UNIQUE
               REFERENCES public.profiles(id) ON DELETE CASCADE,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_calendar_feed_sandboxes_definition_object
    CHECK (jsonb_typeof(definition) = 'object')
);

COMMENT ON TABLE public.calendar_feed_sandboxes IS
  'One admin''s editable fake family, standing behind a calendar-feed URL so '
  'the feed can be verified in isolation: edit the gamers, products, sessions '
  'and seats, save, and watch a subscribed calendar change on its next poll. '
  'It exists because a subscribed feed is polled by a vendor''s servers minutes '
  'to hours after the edit, with no session and no browser, so the edited '
  'family has to be readable from the database rather than held in a page. '
  'Nothing family-facing reads this table and no real family is described by '
  'it — a sandbox feed discloses only invented names. One row per admin '
  '(owner_id is UNIQUE); the row is created on first read of the testing card '
  'and saved over thereafter.';

COMMENT ON COLUMN public.calendar_feed_sandboxes.owner_id IS
  'The admin whose sandbox this is, and the whole of the row''s authorization: '
  'the RLS policy requires both that the caller is an admin and that they are '
  'this owner, so one admin never reads or edits another''s. Always a profile '
  'with role `admin` in practice — the policy is what enforces that rather '
  'than a CHECK, because a role is a mutable property of a profile and a CHECK '
  'would freeze it at insert time. ON DELETE CASCADE: a scratchpad belonging '
  'to a deleted account is not a record worth keeping.';

COMMENT ON COLUMN public.calendar_feed_sandboxes.definition IS
  'The fake family, as one JSON object: the parent, their gamers, the products '
  'those gamers hold seats on, the weekly slots of each product, and the seats '
  'themselves. Deliberately opaque to the database beyond being an object — '
  'the shape is owned by a zod schema the API route parses on write and the '
  'feed route parses on read, because it follows what the feed exploration '
  'wants to try rather than what the platform stores, and it will move faster '
  'than a migration would. The CHECK is the one structural guarantee: a scalar '
  'or an array here could never be a family.';

COMMENT ON COLUMN public.calendar_feed_sandboxes.updated_at IS
  'When the definition was last saved, stamped by the shared touch trigger. '
  'What the card shows to explain why a subscribed calendar has not caught up '
  'yet: the feed serves this row, and a client shows it after its own poll.';

CREATE TRIGGER calendar_feed_sandboxes_updated_at
  BEFORE UPDATE ON public.calendar_feed_sandboxes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.calendar_feed_sandboxes ENABLE ROW LEVEL SECURITY;

-- One FOR ALL policy, because the four commands have exactly one answer here:
-- an admin, acting on their own row. Both halves are stated in USING and in
-- WITH CHECK — the actor (is an admin at all) and the target (this row is
-- theirs) — so neither a non-admin reaching the grant nor an admin aiming at a
-- colleague's row gets past it, on a read or on a write. The `(SELECT …)`
-- wrappers are the standing form here: they make each call an InitPlan
-- evaluated once per statement rather than once per row.
CREATE POLICY admins_manage_own_calendar_feed_sandbox
  ON public.calendar_feed_sandboxes
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()) AND owner_id = (SELECT auth.uid()))
  WITH CHECK ((SELECT public.is_admin()) AND owner_id = (SELECT auth.uid()));

-- The admin's own session client does every write — there is a caller, and the
-- policy above is what authorizes them, so the four privileges are granted
-- rather than hidden behind an RPC. The feed route is the opposite case and
-- reads a sandbox with the service-role client, because a calendar app polling
-- the URL has no session at all.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.calendar_feed_sandboxes TO authenticated;
GRANT ALL ON TABLE public.calendar_feed_sandboxes TO service_role;
