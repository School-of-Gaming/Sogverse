-- A chat channel is keyed by its session window.
--
-- The persisted-chat surface in src/components/chat/ has been fixture-only: it
-- renders at /preview/chat/session against mock data while the voice rooms run
-- an ephemeral Daily app-message chat with no history and no moderation. This
-- migration is the storage half of the wire-up — four tables, one enum, the
-- membership predicate the RLS policies compose from, and the realtime
-- publication entries. The guarded RPCs that write these tables land in the
-- migration beside this one; nothing here grants a write to anybody.
--
-- WHY A CHANNEL AND NOT A COLUMN ON group_sessions
--
-- Anchoring a chat log to `group_sessions` was the first shape and was rejected
-- twice. `ensure_group_session` is service_role-only with NO guard in its own
-- body — it is safe today purely because every caller is a staff-gated RPC — so
-- a participant-callable chat RPC reaching it would be the first non-staff path
-- into it and would manufacture phantom session rows: blank cards in the gedu
-- and admin feeds, a permanent `created_by` naming a child, and unclearable
-- "report owed" badges after a schedule edit. `group_sessions` is also keyed by
-- (group, product-local DATE), which a per-window chat would strain the moment a
-- group runs two sessions in one day.
--
-- So a channel carries its own window instants, and carries them as a SNAPSHOT.
-- The key is (group_id, session_opens_at) — the same key
-- voice_private_zone_occupants uses, for the same "a room is keyed by its
-- session window" reason, and the same instant the voice token route hands the
-- client as `sessionOpensAt`. Staff tooling that wants to relate a chat log to a
-- session report joins on (group_id, date of session_opens_at in the product's
-- timezone). There is deliberately NO foreign key to group_sessions.
--
-- Both instants are derived SERVER-SIDE by `ensure_chat_channel` and are never
-- accepted from a client: they feed the family read bound below, so a
-- client-supplied value would let a member mint themselves an arbitrary read
-- window over a group's whole chat history.
--
-- WHY THE READ BOUND EXISTS AT ALL
--
-- The app never shows old chat — each session window has its own channel and the
-- room is only joinable inside its window — so the bound looks redundant from the
-- UI. It is not: the RLS SELECT policy is the REAL read boundary, because
-- Realtime's postgres_changes respects RLS and therefore the subscriber reads
-- these tables directly, which means any group member's own logged-in account
-- can query PostgREST for them. Without the bound that path returns every past
-- session's log, including chat from before that member joined the group.
--
-- WHY THERE ARE NO WRITE GRANTS AND NO WRITE POLICIES
--
-- Every write goes through a guarded SECURITY DEFINER RPC (Model D in
-- docs/architecture/db-authorization.md): `authenticated` holds SELECT and
-- nothing else on all four tables, and there is no INSERT/UPDATE/DELETE policy
-- for the RPCs to hide behind. `anon` holds nothing at all. The db test suite
-- fabricates rows the RPCs cannot produce — an expired channel, for the
-- time-bound test — through its established direct connection.

-- ---------------------------------------------------------------------------
-- 1. The channel type
-- ---------------------------------------------------------------------------
--
-- One value today. A future DM or staff channel is an enum value plus a branch
-- in the membership predicate below — one thin table and one enum, not a
-- framework.

CREATE TYPE public.chat_channel_type AS ENUM ('group_session');

COMMENT ON TYPE public.chat_channel_type IS
  'What a chat channel IS, and therefore which membership rule answers "who can '
  'read it". `group_session` is the chat of one scheduled voice-room session '
  'window. The seam a later direct-message or staff channel extends: add a '
  'value here and a branch to is_chat_channel_member / '
  'is_chat_channel_moderator, and every table, policy and RPC below is '
  'unchanged.';

-- ---------------------------------------------------------------------------
-- 2. Channels
-- ---------------------------------------------------------------------------

CREATE TABLE public.chat_channels (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type             public.chat_channel_type NOT NULL,
  group_id         uuid NOT NULL
                     REFERENCES public.product_groups(id) ON DELETE CASCADE,
  session_opens_at timestamptz NOT NULL,
  session_ends_at  timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_channels_group_window_key
    UNIQUE (group_id, session_opens_at),
  CONSTRAINT chk_chat_channels_window_order
    CHECK (session_ends_at > session_opens_at)
);

COMMENT ON TABLE public.chat_channels IS
  'One chat log''s identity. For a `group_session` channel that is one product '
  'group''s one session window, keyed by (group_id, session_opens_at) — the '
  'same key voice_private_zone_occupants carries, and the same instant the '
  'voice token route hands a joiner as `sessionOpensAt`, so a room and its chat '
  'agree on which window they are. Materialized idempotently by '
  'ensure_chat_channel and by nothing else. Deliberately NOT related to '
  'group_sessions by a foreign key: that table''s ensure function is unguarded '
  'behind staff-only callers, and a participant-callable RPC reaching it would '
  'manufacture phantom session rows in staff feeds.';

COMMENT ON COLUMN public.chat_channels.session_opens_at IS
  'When the room opens — the session start MINUS the voice join margin, i.e. '
  'exactly the voice token route''s `windowOpensAt`. SERVER-DERIVED, never '
  'accepted from a caller, and snapshotted rather than re-derived: a schedule '
  'edit moves future windows and leaves this log where it happened. Half of the '
  'row''s natural key.';

COMMENT ON COLUMN public.chat_channels.session_ends_at IS
  'When the room closes — session end PLUS the voice leave margin, i.e. the '
  'token route''s `windowClosesAt`. Server-derived and snapshotted like its '
  'partner. This is the instant the FAMILY read bound is measured from (see '
  'is_chat_channel_member); staff have no time bound, because after-the-fact '
  'review is the point of keeping the rows.';

CREATE INDEX chat_channels_group_window_idx
  ON public.chat_channels (group_id, session_opens_at DESC);

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Messages
-- ---------------------------------------------------------------------------

CREATE TABLE public.chat_messages (
  -- CLIENT-SUPPLIED, deliberately: the optimistic echo puts the sender's
  -- message on screen before anything acknowledges it, and reconciles the
  -- pending bubble to `sent` BY IDENTITY when the realtime INSERT (or the RPC
  -- return) lands. A server-generated id would leave the echo nothing to
  -- reconcile against and force a duplicate-and-swap.
  id                  uuid PRIMARY KEY,
  channel_id          uuid NOT NULL
                        REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  sender_id           uuid NOT NULL
                        REFERENCES public.profiles(id) ON DELETE CASCADE,
  body                text,
  image_width         integer,
  image_height        integer,
  reply_to_message_id uuid
                        REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  -- clock_timestamp() rather than now(): this is the log's ORDERING KEY and it
  -- is compared across concurrent transactions, where a transaction-start stamp
  -- can tie or invert against the order the sends actually arrived in. The id
  -- is the sub-tick tiebreaker, exactly as it is for session photos.
  created_at          timestamptz NOT NULL DEFAULT clock_timestamp(),
  edited_at           timestamptz,
  hidden_at           timestamptz,
  hidden_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- TEXT XOR ONE IMAGE. The composer stages images and the send FANS OUT: one
  -- image-only message per picture, then one text message. That is what removes
  -- captions, an attachment child table, and the question of what a caption on
  -- the third of five pictures means. An empty body is not "text present" — the
  -- composer cannot produce one and a blank bubble is not a message.
  --
  -- Both arms open with an explicit IS NULL / IS NOT NULL on `body` rather than
  -- leaning on the btrim comparison: `btrim(NULL) <> ''` is NULL, and a CHECK
  -- passes on NULL — so the shorter spelling would have admitted a row with
  -- neither a body nor an image.
  CONSTRAINT chk_chat_messages_text_xor_image CHECK (
    (body IS NOT NULL AND btrim(body) <> ''
       AND image_width IS NULL AND image_height IS NULL)
    OR (body IS NULL
       AND image_width IS NOT NULL AND image_height IS NOT NULL)
  ),

  -- THE CHARACTER CAP, MEASURED ON THE DISPLAY FORM.
  --
  -- A mention rides inside the body as `@[Name](id)` but a writer only ever
  -- sees `@Name`, and the cap is a promise about the sentence they are writing.
  -- So the cap is applied to the body with its mention tokens flattened back to
  -- `@Name` — about forty characters shorter per mention. A flat cap on the
  -- STORED string is forbidden and this constraint is why: it would refuse
  -- exactly the drafts that name the most people, which is the one failure the
  -- constant's header in src/lib/constants/chat.ts rules out.
  --
  -- 500 is MAX_CHAT_MESSAGE_LENGTH, honestly duplicated: SQL cannot see a
  -- TypeScript constant, and this constraint OWNS the cap — the send RPC does
  -- not re-measure, so there is no second number to drift from it.
  --
  -- The pattern is the SQL twin of the token regex in
  -- src/components/chat/chat-body.ts. regexp_replace with four arguments is
  -- IMMUTABLE, which is what makes this a legal CHECK.
  CONSTRAINT chk_chat_messages_display_length CHECK (
    body IS NULL
    OR char_length(
         regexp_replace(
           body,
           '@\[([^][]{1,64})\]\(([0-9a-fA-F-]{36})\)',
           '@\1',
           'g'
         )
       ) <= 500
  ),

  -- Dimensions are SERVER-MEASURED (the upload route re-encodes through sharp
  -- and passes what it measured), so these are a sanity bound rather than a
  -- restatement of anything a client claims. 4096 is the session-photo number —
  -- one set of image limits platform-wide — and what it defends is layout
  -- arithmetic: every thumbnail box in the log is computed from these two
  -- numbers and nothing measures a decoded image, so an implausible pair would
  -- be a layout bomb in every viewer's log rather than a mis-sized box in one.
  CONSTRAINT chk_chat_messages_image_width CHECK (
    image_width IS NULL OR (image_width > 0 AND image_width <= 4096)
  ),
  CONSTRAINT chk_chat_messages_image_height CHECK (
    image_height IS NULL OR (image_height > 0 AND image_height <= 4096)
  )
);

COMMENT ON TABLE public.chat_messages IS
  'One message. Text XOR one image, never both — the composer fans a burst out '
  'into one image-only row per picture plus one text row. Removal is a SOFT '
  'delete (hidden_at/hidden_by) and nothing else: the row and the bytes survive, '
  'the reader''s place is kept by a tombstone that holds the row''s spot, and a '
  'moderator keeps reading the original, which is the moment the record matters '
  'most. Rows are never physically deleted — v1 has no retention mechanism, by '
  'decision — except by CASCADE when the channel, its group or the sender''s '
  'own account goes. Written only by send_chat_message, '
  'send_chat_image_message, edit_chat_message, hide_chat_message and '
  'restore_chat_message; `authenticated` holds SELECT and nothing more.';

COMMENT ON COLUMN public.chat_messages.id IS
  'Client-supplied, so the optimistic echo reconciles by identity. A hostile '
  'caller can therefore choose the id of their own message and nothing else — '
  'the primary key refuses a collision and every other column is stamped by the '
  'RPC.';

COMMENT ON COLUMN public.chat_messages.body IS
  'The message text, or NULL on an image row. Mentions ride INSIDE it as '
  '`@[Name](id)` rather than in a join table: the name so a body read anywhere '
  'at all still says who was meant, the id so the highlight keys on an account '
  'rather than on a string anybody could type. The send and edit RPCs validate '
  'every token''s id against the channel roster, and the display-length CHECK '
  'measures the flattened form.';

COMMENT ON COLUMN public.chat_messages.image_width IS
  'The stored image''s pixel width on an image row, NULL on a text row. '
  'SERVER-MEASURED by the upload route''s re-encode — a client-claimed number '
  'never reaches this column — and the sole input to the thumbnail''s box '
  'geometry, because nothing measures a decoded image in a scrolling log.';

COMMENT ON COLUMN public.chat_messages.image_height IS
  'The stored image''s pixel height. See `image_width` — same provenance, same '
  'sanity bound, and both are NULL or both are set by the XOR constraint.';

COMMENT ON COLUMN public.chat_messages.hidden_by IS
  'Who removed this message — the sender themselves, or a moderator. AUDIT '
  'ONLY: nothing in the UI reads it and the tombstone is identical either way, '
  'so a room is never told which of the two happened. It exists for the psql '
  'review path (docs/runbooks/remote-supabase-psql.md), where "who removed '
  'this" has to be answerable. Cleared again by restore_chat_message, because '
  'after a restore nothing was removed. ON DELETE SET NULL, so a departed '
  'moderator leaves the removal recorded without the name.';

-- The history read is "the latest 200 of this channel, newest first"; every
-- renderer then orders by (created_at, id). One index carries both directions.
CREATE INDEX chat_messages_channel_order_idx
  ON public.chat_messages (channel_id, created_at, id);

-- The roster's third clause — "everyone who has a message in this channel" — is
-- a DISTINCT over senders within one channel, which the ordering index above
-- cannot answer.
CREATE INDEX chat_messages_channel_sender_idx
  ON public.chat_messages (channel_id, sender_id);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Reactions
-- ---------------------------------------------------------------------------

CREATE TABLE public.chat_reactions (
  message_id uuid NOT NULL
               REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL
               REFERENCES public.profiles(id) ON DELETE CASCADE,
  code       text NOT NULL,
  -- DENORMALIZED ON PURPOSE, and load-bearing rather than convenient: a
  -- postgres_changes filter is ONE column. Without a channel_id here every
  -- reaction in the project fans out to every subscriber in it, and a channel's
  -- reactions could only be read by listing its messages in a 200-element IN.
  -- Stamped from the MESSAGE row by toggle_chat_reaction, never from the caller.
  channel_id uuid NOT NULL
               REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, sender_id, code),
  -- Mirrors CHAT_REACTION_CODES in src/lib/constants/chat.ts, in its order.
  -- The DB stores the CODE and never the emoji: `messages/` may not hold emoji,
  -- so a reaction's glyph is code and its name is a translated string, and
  -- neither of them belongs in a column. There is deliberately no enum type —
  -- the owner's final pick is a constants edit plus one migration altering this
  -- CHECK, and the contracts zod schema derives from the constant rather than
  -- from generated `Constants`.
  CONSTRAINT chk_chat_reactions_code CHECK (
    code IN ('thumbs_up', 'heart', 'laugh', 'surprised', 'celebrate', 'thinking')
  )
);

COMMENT ON TABLE public.chat_reactions IS
  'One person''s one reaction to one message, unique on (message, sender, code) '
  'and toggled by toggle_chat_reaction. Carries REPLICA IDENTITY FULL because '
  'un-reacting is a DELETE and a channel_id-filtered postgres_changes '
  'subscription can only receive a DELETE whose OLD row carries the filter '
  'column — the messages and locks tables are never deleted (soft delete and '
  'unlock are UPDATEs) and keep the default identity.';

COMMENT ON COLUMN public.chat_reactions.channel_id IS
  'The channel of this reaction''s message. Denormalized so a realtime '
  'subscription can filter on one column and so the RLS policy is a direct '
  'membership question rather than a join. Stamped from the message row inside '
  'toggle_chat_reaction and never taken from the caller, which is what stops a '
  'reaction being filed under a channel its message is not in.';

CREATE INDEX chat_reactions_channel_idx
  ON public.chat_reactions (channel_id);

-- Required for the un-reaction DELETE to replicate usefully. See the table
-- comment: the filter column has to be present in the OLD row.
ALTER TABLE public.chat_reactions REPLICA IDENTITY FULL;

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. Locks
-- ---------------------------------------------------------------------------

CREATE TABLE public.chat_channel_locks (
  channel_id uuid NOT NULL
               REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL
               REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- NULL means "not locked". UNLOCKING IS AN UPDATE TO NULL, NEVER A DELETE, so
  -- both directions of the switch replicate as UPDATEs and this table needs no
  -- REPLICA IDENTITY change.
  locked_at  timestamptz,
  locked_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

COMMENT ON TABLE public.chat_channel_locks IS
  'Who a moderator has silenced in a channel, and by whom. A lock takes away '
  'everything that writes — sending, editing, replying and reacting — and '
  'leaves exactly one thing: deleting your own message, because taking back '
  'something you regret is what a locked member most plausibly still wants and '
  'refusing it would make the lock a punishment rather than a control. A locked '
  'member keeps READING. Unlock sets locked_at back to NULL and never deletes '
  'the row, so the switch replicates in both directions. Read policy is the one '
  'exception on these four tables: own row plus moderators, because a '
  'channel-wide read would broadcast live to every child that a gedu had '
  'silenced a particular child.';

COMMENT ON COLUMN public.chat_channel_locks.locked_by IS
  'The moderator who last set this row''s state, lock or unlock alike. Audit '
  'only — nothing renders it. ON DELETE SET NULL, so a departed gedu leaves the '
  'act recorded without the name.';

ALTER TABLE public.chat_channel_locks ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. The membership predicates
-- ---------------------------------------------------------------------------
--
-- One per-type predicate answers "who can see this channel", and for a
-- `group_session` channel it COMPOSES the two predicates the voice tables
-- already ship rather than restating their branches:
--
--   is_voice_group_member(g)    — admin, OR an active participation in the
--                                 group (a gamer's seat and a parent's own seat
--                                 are one query), OR a gedu assigned to the
--                                 product.
--   is_voice_group_moderator(g) — admin, OR a gedu assigned to the product.
--
-- THE GRACE IS CHAT'S OWN NUMBER, AS A SQL LITERAL. The voice window margins
-- are TypeScript constants SQL cannot see, and a security boundary silently
-- drifting from an app constant is worse than an honestly duplicated one — the
-- same ruling docs/architecture/db-authorization.md records for the occupancy
-- prune. One hour, chosen against two facts: session_ends_at is ALREADY the
-- window close (session end plus the voice leave margin), and the voice token's
-- own post-window grace past that instant is 60 seconds — so an hour is
-- comfortably past every way the room can still be winding down. It has to be
-- comfortable rather than tight because React Query refetches on window focus:
-- a parent who re-focuses the tab a minute past a tight bound would watch the
-- log blank in front of them.
--
-- SECURITY DEFINER is what makes the chat_channels policy below non-recursive:
-- this function reads chat_channels as its owner, so the policy that calls it
-- is not re-entered. COALESCE keeps the answer a TOTAL boolean — an unknown
-- channel id is `false`, not NULL — because a NULL-capable predicate is a trap
-- for any consumer that is not a USING clause.

CREATE FUNCTION public.is_chat_channel_member(p_channel_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $$
  SELECT COALESCE((
    SELECT
      CASE c.type
        WHEN 'group_session'::public.chat_channel_type THEN
          public.is_voice_group_member(c.group_id)
          AND (
            -- Staff read without a time bound: after-the-fact review is the
            -- whole point of keeping the rows.
            public.is_voice_group_moderator(c.group_id)
            -- A family participant reads around this channel's own window.
            OR now() < c.session_ends_at + interval '1 hour'
          )
      END
      FROM public.chat_channels c
     WHERE c.id = p_channel_id
  ), false);
$$;

COMMENT ON FUNCTION public.is_chat_channel_member(p_channel_id uuid) IS
  'Who may READ this channel — the predicate every chat RLS policy and every '
  'chat RPC guard composes from, and the seam a later channel type extends by '
  'adding a branch. For a group_session channel: the voice room''s own '
  'membership predicate, plus a time bound that applies to FAMILY participants '
  'only. The bound is not belt-and-braces — postgres_changes respects RLS, so '
  'the subscriber reads these tables directly and any member''s own account can '
  'query PostgREST for them; without it that path returns every past session''s '
  'log, including chat from before that member joined the group. The one hour '
  'is chat''s own number, duplicated on purpose rather than derived from the '
  'TypeScript voice margins SQL cannot see. Total boolean: an unknown id is '
  'false, never NULL.';

CREATE FUNCTION public.is_chat_channel_moderator(p_channel_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $$
  SELECT COALESCE((
    SELECT
      CASE c.type
        WHEN 'group_session'::public.chat_channel_type THEN
          public.is_voice_group_moderator(c.group_id)
      END
      FROM public.chat_channels c
     WHERE c.id = p_channel_id
  ), false);
$$;

COMMENT ON FUNCTION public.is_chat_channel_moderator(p_channel_id uuid) IS
  'Whether the caller moderates this channel — a POSITIVE allow-list (admin, or '
  'a gedu assigned to the product), never an exclusion. The voice room learned '
  'that the expensive way: a "not a gamer" test would have handed moderation to '
  'parents the day parent seats shipped, and a parent in a chat is a '
  'participant with no moderator powers, exactly like a child. Consumed by the '
  'lock-row read policy and by the hide/restore/lock RPC guards. Total boolean.';

REVOKE EXECUTE ON FUNCTION public.is_chat_channel_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_channel_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chat_channel_member(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.is_chat_channel_moderator(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_channel_moderator(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chat_channel_moderator(uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Read policies
-- ---------------------------------------------------------------------------
--
-- SELECT and nothing else, on all four tables. These are GENUINE policies
-- rather than paperwork: Realtime's postgres_changes evaluates them for every
-- subscriber, so they are what decides whether a payload is delivered at all.
--
-- The predicate takes the row's own column as an argument, so `(SELECT p(col))`
-- would be a correlated subplan rather than an InitPlan — it is wrapped anyway
-- for one shape across every policy in the database, per §2 of
-- docs/architecture/db-authorization.md, without expecting the InitPlan payoff.

CREATE POLICY chat_channels_select ON public.chat_channels
  FOR SELECT TO authenticated
  USING ((SELECT public.is_chat_channel_member(chat_channels.id)));

CREATE POLICY chat_messages_select ON public.chat_messages
  FOR SELECT TO authenticated
  USING ((SELECT public.is_chat_channel_member(chat_messages.channel_id)));

CREATE POLICY chat_reactions_select ON public.chat_reactions
  FOR SELECT TO authenticated
  USING ((SELECT public.is_chat_channel_member(chat_reactions.channel_id)));

-- The exception. A lock is readable by the person it lands on and by the
-- channel's moderators, and by nobody else: a channel-wide read would announce
-- live to every child in the room that a gedu had silenced a particular child,
-- and the UI needs no more than this — the lock switch is moderator-gated, and
-- a locked viewer needs only their own state to draw the composer's notice.
CREATE POLICY chat_channel_locks_select ON public.chat_channel_locks
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_chat_channel_member(chat_channel_locks.channel_id))
    AND (
      chat_channel_locks.user_id = (SELECT auth.uid())
      OR (SELECT public.is_chat_channel_moderator(chat_channel_locks.channel_id))
    )
  );

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------
--
-- SELECT for `authenticated`, everything for `service_role`, nothing at all for
-- `anon`. No write grant reaches a client role on any of these tables, which is
-- what makes the guarded RPCs the only way in and what makes a stray .insert()
-- fail closed rather than land a row.

GRANT SELECT ON TABLE public.chat_channels      TO authenticated;
GRANT SELECT ON TABLE public.chat_messages      TO authenticated;
GRANT SELECT ON TABLE public.chat_reactions     TO authenticated;
GRANT SELECT ON TABLE public.chat_channel_locks TO authenticated;

GRANT ALL ON TABLE public.chat_channels      TO service_role;
GRANT ALL ON TABLE public.chat_messages      TO service_role;
GRANT ALL ON TABLE public.chat_reactions     TO service_role;
GRANT ALL ON TABLE public.chat_channel_locks TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Realtime
-- ---------------------------------------------------------------------------
--
-- Three tables, three statements — ALTER PUBLICATION takes one table per line.
-- chat_channels is NOT replicated: a channel is materialized once, on mount, by
-- the container that is about to subscribe, so there is no change to it anybody
-- needs to hear about.
--
-- PUBLICATION MEMBERSHIP APPEARS NOWHERE IN schema.sql AND IS ASSERTED BY NO
-- EXISTING CHECK. A table missing from it degrades silently and totally —
-- everyone's own optimistic echo still works, and nothing else ever arrives —
-- which is why the schema step carries a db test asserting exactly these three
-- memberships and the intended replica identities.

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channel_locks;
