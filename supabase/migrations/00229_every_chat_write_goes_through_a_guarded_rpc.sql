-- Every chat write goes through a guarded RPC.
--
-- 00228 created the chat tables with SELECT grants and read policies and
-- nothing else. This migration is the write half: nine RPCs, plus two internal
-- helpers they share. `authenticated` holds no INSERT, UPDATE or DELETE on any
-- chat table, so these functions are the only way in — Model D of
-- docs/architecture/db-authorization.md, where the grant lockdown stands behind
-- the guard rather than beside it.
--
-- THE GUARDS MIRROR src/components/chat/capabilities.ts, EXACTLY.
--
-- That module is the spec, not a convenience: it is the single place the
-- composer and the message menu ask what they may OFFER, and a UI offering what
-- the server refuses (or refusing what the server offers) is the defect the
-- pairing exists to prevent. The rules it encodes and these bodies re-impose:
--
--   * Moderator is a POSITIVE allow-list — admin, or a gedu assigned to the
--     product. Never "not a gamer": the voice room learned that the expensive
--     way, and a parent in a chat is a participant with no moderator powers,
--     exactly like a child.
--   * Per-person moderation acts are SYMMETRIC. Any moderator may hide or
--     restore ANY message, a fellow gedu's and an admin's included. There is no
--     mod-vs-mod test in hide_chat_message and its absence is a decision:
--     removing a message acts on one thing that was said, in front of the
--     people who saw it, and a rule exempting staff would make the one message
--     nobody could take down the one a moderator is standing next to.
--   * The LOCK is the asymmetric class, because it is a judgement about a
--     person rather than a message. set_chat_lock refuses a target whose role
--     moderates — between colleagues that is not moderation, it is one member
--     of staff silencing another in front of children they are both
--     responsible for.
--   * A lock takes away everything that writes — sending, editing, replying,
--     reacting — EXCEPT hiding your own message. hide_chat_message therefore
--     carries no lock check at all: the own-message path must survive a lock,
--     and the moderator path cannot be locked because a moderator cannot be.
--
-- ONE NAMED REFUSAL: SQLSTATE P0024, "locked".
--
-- Every other refusal here is generic and lands on the components' existing
-- failed-bubble-plus-retry, because the UI — driven by capabilities.ts — cannot
-- produce them, so a named code would buy a branch nobody can see. A lock is
-- different: the lock's own realtime arrival disables the composer and a send
-- refused by a lock RACES it, so the client has to tell that refusal apart and
-- must NOT offer a retry for it. P0024 is the next free code in this repo's own
-- series (P0021–P0023 are taken; P0000–P0004 are PL/pgSQL's own), and it
-- follows the session-photo cap's precedent of giving a refusal a code exactly
-- when the UI answers it differently. 42501 stays the authorization guard's
-- alone.
--
-- CLASSIFICATION: SELF-SCOPING, NOT ROLE-GATED.
--
-- These bodies do not open with assert_role/assert_admin, and cannot: chat
-- authorization is a MEMBERSHIP question, not a role question — a gamer, a
-- parent, a gedu and an admin can all be legitimate callers of the same RPC,
-- and which one you are decides nothing on its own. Every guard below is keyed
-- to auth.uid() through is_chat_channel_member / is_chat_channel_moderator, so
-- the caller's own identity determines the scope of every answer, which is
-- precisely what §3.4 admits as self-scoping. Each therefore lands on the
-- spine's self-scoping allowlist with a named scope test rather than in the
-- role matrix.

-- ---------------------------------------------------------------------------
-- 1. Internal helpers
-- ---------------------------------------------------------------------------
--
-- Neither is granted to `authenticated`: both are called from inside the
-- SECURITY DEFINER RPCs below, which reach them through ownership rather than
-- through a role grant. Same posture as gedu_teaches_group.

-- WHO IS ON A CHANNEL'S ROSTER — the one definition, used by the roster RPC
-- that feeds the mention picker AND by the mention validation that refuses a
-- body naming anybody else. Two copies of this set would let the composer offer
-- a name the send then refused.
--
-- Three clauses, and the third is the interesting one:
--
--   1. The group's ACTIVE seat-holders. `participant_id` is whoever holds the
--      seat, so a gamer's row and a parent's own row are the same shape.
--   2. The product's assigned gedus — product-level, matching the cross-group
--      voice mobility is_voice_group_member already encodes.
--   3. Everyone who has a message in the channel. This is what keeps a
--      departed member's name rendering on the words they left behind, and it
--      is also how an admin or a covering gedu outside the roster becomes
--      visible and mentionable: the moment they send, they are on it.
--
-- "Everyone the membership predicate admits" is deliberately NOT the
-- definition, because that set is not listable — it admits every admin on the
-- platform.
CREATE FUNCTION public.chat_channel_roster_ids(p_channel_id uuid)
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $$
  SELECT part.participant_id
    FROM public.chat_channels c
    JOIN public.participations part ON part.group_id = c.group_id
   WHERE c.id = p_channel_id
     AND part.status = 'active'::public.participation_status
  UNION
  SELECT ga.gedu_id
    FROM public.chat_channels c
    JOIN public.product_groups g ON g.id = c.group_id
    JOIN public.gedu_group_assignments ga ON ga.product_id = g.product_id
   WHERE c.id = p_channel_id
  UNION
  SELECT m.sender_id
    FROM public.chat_messages m
   WHERE m.channel_id = p_channel_id;
$$;

COMMENT ON FUNCTION public.chat_channel_roster_ids(p_channel_id uuid) IS
  'Internal: the account ids a channel''s roster names — the group''s active '
  'seat-holders, the product''s assigned gedus, and everyone who has a message '
  'in the channel. The single definition behind both get_chat_channel_roster '
  'and the send/edit mention validation, so the picker can never offer a name '
  'the send would refuse. Not exposed to `authenticated`: it is called from '
  'inside the SECURITY DEFINER chat RPCs.';

REVOKE EXECUTE ON FUNCTION public.chat_channel_roster_ids(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_channel_roster_ids(uuid) TO service_role;

-- WHETHER EVERY MENTION IN A BODY NAMES SOMEBODY ON THE ROSTER.
--
-- An unvalidated token renders attacker-chosen text as a trusted-looking chip
-- in a room of children — the name inside the token is a snapshot the renderer
-- falls back to, so a crafted body can put any words at all next to a mention
-- chip. The honest composer only ever emits roster ids, so refusing everything
-- else costs a legitimate sender nothing.
--
-- The pattern is the SQL twin of the token regex in
-- src/components/chat/chat-body.ts, and the id half is compared case-folded as
-- TEXT rather than cast to uuid: that regex accepts any 36 characters of hex
-- and dashes, so a cast would raise 22P02 on a malformed token instead of the
-- refusal this function exists to give.
CREATE FUNCTION public.chat_body_mentions_are_roster(
  p_channel_id uuid,
  p_body       text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $$
  SELECT NOT EXISTS (
    SELECT 1
      FROM regexp_matches(
             COALESCE(p_body, ''),
             '@\[[^][]{1,64}\]\(([0-9a-fA-F-]{36})\)',
             'g'
           ) AS token(captures)
     WHERE lower(token.captures[1]) NOT IN (
       SELECT lower(roster.account_id::text)
         FROM public.chat_channel_roster_ids(p_channel_id) AS roster(account_id)
     )
  );
$$;

COMMENT ON FUNCTION public.chat_body_mentions_are_roster(uuid, text) IS
  'Internal: whether every `@[Name](id)` token in a body names an account on '
  'this channel''s roster. The send and edit RPCs refuse a body that fails it — '
  'an unvalidated token would render attacker-chosen text as a trusted-looking '
  'mention chip in a room of children. A body with no tokens passes trivially, '
  'which is what makes a plain sentence free.';

REVOKE EXECUTE ON FUNCTION public.chat_body_mentions_are_roster(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_body_mentions_are_roster(uuid, text)
  TO service_role;

-- WHETHER THE CALLER IS LOCKED IN THIS CHANNEL. A locked row exists in both
-- directions — unlock is an UPDATE to NULL rather than a DELETE — so the
-- question is about `locked_at`, not about the row.
CREATE FUNCTION public.chat_caller_is_locked(p_channel_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.chat_channel_locks l
     WHERE l.channel_id = p_channel_id
       AND l.user_id    = (SELECT auth.uid())
       AND l.locked_at IS NOT NULL
  );
$$;

COMMENT ON FUNCTION public.chat_caller_is_locked(p_channel_id uuid) IS
  'Internal: whether a moderator has silenced the CALLER in this channel. Asked '
  'by the send, edit and reaction RPCs, which refuse with P0024; deliberately '
  'NOT asked by hide_chat_message, because taking back your own message is the '
  'one write a lock leaves. Keyed on locked_at rather than on the row''s '
  'existence, since unlocking is an update to NULL.';

REVOKE EXECUTE ON FUNCTION public.chat_caller_is_locked(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_caller_is_locked(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. ensure_chat_channel
-- ---------------------------------------------------------------------------
--
-- Called by the voice-room container on mount. Finds the group's currently-open
-- session window from the product's schedule and materializes the channel
-- idempotently.
--
-- THE WINDOW SEARCH IS A REAL IMPLEMENTATION, NOT A CALL TO SOMETHING THAT
-- EXISTS. derive_group_session_window is date-keyed, applies no join margins,
-- and takes only the first slot on a weekday; the full occurrence search with
-- its margins lives in TypeScript on the voice token route
-- (computeSessionWindow over getNextSessionStart). So this body carries its own
-- PL/pgSQL port, and the port is deliberate duplication: the alternative is a
-- participant-callable RPC that cannot answer "which window is open" without
-- trusting the caller to say, and a caller-supplied window is exactly what
-- would let a member mint an arbitrary read bound over a group's history. The
-- db-authorization doc declined this duplication for the occupancy prune; that
-- ruling stands for its own case, where the payoff was low. Here it is the
-- price of the guard, paid knowingly — and a db test pins these SQL windows
-- against the same fixture schedules the TypeScript session-schedule tests use,
-- so the two implementations cannot silently disagree.
--
-- HOLIDAY-BLIND, on purpose. The token route consults no holiday calendar, so
-- neither does this: chat inventing holiday awareness would be new behaviour
-- rather than a port, and a room whose chat and voice disagree about whether
-- today counts is worse than both being blind together. The product's
-- start_date/end_date are not consulted either, for the same reason.
--
-- THE ADJACENT-DAY PROBE IS WHAT MAKES IT DST-SAFE. Candidates are stepped as
-- CALENDAR DATES in the product's zone (`(now() AT TIME ZONE zone)::date` plus
-- -1, 0, +1) and each is turned into an instant by `AT TIME ZONE`, so no
-- arithmetic of ours ever assumes a local day is 24 hours. Yesterday and
-- tomorrow are both probed because a window carries margins and a duration and
-- can therefore straddle local midnight in either direction — the same reason
-- the TypeScript path searches the previous occurrence as well as the next.
--
-- WHEN NO WINDOW IS OPEN it raises no_data_found rather than returning nothing,
-- and the container renders its one quiet "chat unavailable" line. That is also
-- the failure mode if the two implementations ever disagree at a boundary
-- instant — never a channel keyed to a different window than the room.

-- RETURNS SETOF the table's own row type rather than a bare composite or a
-- hand-listed TABLE(...): the generator renders it as the chat_channels Row
-- with no restating of the column list, and `get_my_gamers` is the shipped
-- precedent for the shape. Exactly one row comes back, always — the caller
-- takes it with `.single()`.
CREATE FUNCTION public.ensure_chat_channel(p_group_id uuid)
  RETURNS SETOF public.chat_channels
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  -- The voice join margins, as SQL literals and named as such. They mirror
  -- VOICE_CONFIG.SESSION_WINDOW_BEFORE_MINUTES / _AFTER_MINUTES, which SQL
  -- cannot see; the db test that pins these windows against the TypeScript
  -- fixtures is what keeps the two honest.
  c_open_margin  constant interval := interval '5 minutes';
  c_close_margin constant interval := interval '5 minutes';

  v_zone       text;
  v_product_id uuid;
  v_opens      timestamptz;
  v_ends       timestamptz;
  v_id         uuid;
BEGIN
  -- Guard first. A NULL group is refused outright rather than allowed to fall
  -- through the predicate — an admin passes is_voice_group_member(NULL), and a
  -- refusal is the only correct answer to "which group?" with no group named.
  IF p_group_id IS NULL OR NOT public.is_voice_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.timezone
    INTO v_product_id, v_zone
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  IF v_zone IS NOT NULL THEN
    SELECT o.opens_at, o.closes_at
      INTO v_opens, v_ends
      FROM (
        SELECT
          -- `timestamp AT TIME ZONE zone` resolves a wall clock in that zone to
          -- the right instant, so nothing here does arithmetic of its own on a
          -- local day.
          ((cd.session_date + s.start_time) AT TIME ZONE v_zone) - c_open_margin
            AS opens_at,
          -- The duration is added to the INSTANT, not to the wall clock, so a
          -- session straddling a transition keeps its real length.
          ((cd.session_date + s.start_time) AT TIME ZONE v_zone)
            + make_interval(mins => s.duration_minutes) + c_close_margin
            AS closes_at
          FROM (
            -- Yesterday, today and tomorrow AS CALENDAR DATES in the product's
            -- zone. Stepping a date is exact on any runtime; stepping an
            -- instant by 24 hours is what breaks twice a year.
            SELECT ((now() AT TIME ZONE v_zone)::date + probe.offset_days)
                     AS session_date
              FROM generate_series(-1, 1) AS probe(offset_days)
          ) cd
          JOIN public.schedule_slots s ON s.product_id = v_product_id
           -- schedule_slots.weekday is 0 = Monday; ISODOW is 1 = Monday.
           WHERE s.weekday = (EXTRACT(ISODOW FROM cd.session_date)::integer - 1)
      ) o
     WHERE now() >= o.opens_at
       AND now() <  o.closes_at
     -- Two slots' windows can overlap. The TypeScript path takes whichever slot
     -- PostgREST happened to return first; this takes the earliest-opening one,
     -- deterministically, so two callers a millisecond apart cannot materialize
     -- two different channels for one room.
     ORDER BY o.opens_at, o.closes_at
     LIMIT 1;
  END IF;

  IF v_opens IS NULL THEN
    RAISE EXCEPTION 'No session window is open for this group'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Insert-or-reselect, the established idempotent shape. Two joiners racing on
  -- mount is the normal case, not the exception.
  INSERT INTO public.chat_channels (
    type, group_id, session_opens_at, session_ends_at
  )
  VALUES (
    'group_session'::public.chat_channel_type, p_group_id, v_opens, v_ends
  )
  ON CONFLICT (group_id, session_opens_at) DO NOTHING
  RETURNING chat_channels.id INTO v_id;

  IF v_id IS NULL THEN
    SELECT c.id INTO v_id
      FROM public.chat_channels c
     WHERE c.group_id = p_group_id
       AND c.session_opens_at = v_opens;
  END IF;

  RETURN QUERY
  SELECT c.* FROM public.chat_channels c WHERE c.id = v_id;
END;
$$;

COMMENT ON FUNCTION public.ensure_chat_channel(p_group_id uuid) IS
  'The current session window''s chat channel for a group, materialized if it '
  'does not exist yet. Guarded on is_voice_group_member, so exactly the people '
  'who may join the room may open its chat. Both window instants are derived '
  'HERE, from the product''s schedule, and are never accepted from the caller: '
  'they feed the family read bound, so a client-supplied value would let a '
  'member mint an arbitrary read window over the group''s history. The window '
  'search is this function''s own PL/pgSQL port of the voice token route''s '
  'TypeScript search — join margins as SQL literals, holiday-blind to match the '
  'voice path, and DST-safe by stepping CALENDAR dates in the product''s zone '
  'and probing the adjacent days, never by 24-hour arithmetic. Deliberately '
  'never calls ensure_group_session and never touches group_sessions: that '
  'function is unguarded behind staff-only callers, and a participant reaching '
  'it would manufacture phantom session rows in the staff feeds. Raises P0002 '
  'when no window is open, which the container renders as its one quiet '
  '"chat unavailable" line.';

REVOKE EXECUTE ON FUNCTION public.ensure_chat_channel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_chat_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_chat_channel(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. get_chat_channel_roster
-- ---------------------------------------------------------------------------
--
-- This RPC exists because `profiles` RLS deliberately lets nobody read another
-- participant's row. The old ephemeral chat worked around that by resolving
-- names from Daily's verified sender id, which persisted history cannot do —
-- a late joiner has to name senders who are not in the room. The staff-overlay
-- RPC is the shipped precedent for exactly this shape.
--
-- DETERMINISTICALLY ORDERED, BY PROFILE ID, and that is load-bearing rather
-- than tidy: src/components/chat/chat-body.ts resolves two accounts sharing a
-- name to whichever the caller listed FIRST, and the composer and the in-place
-- editor are handed the same array on purpose. An order derived from live Daily
-- participants would let the same typed `@Name` mean different people in
-- different clients. Id order is arbitrary but stable, and the same-name
-- collision it arbitrates is an accepted v1 tolerance already recorded in
-- src/components/chat/CLAUDE.md.

CREATE FUNCTION public.get_chat_channel_roster(p_channel_id uuid)
  RETURNS TABLE (id uuid, first_name text, role public.user_role)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
  AS $$
BEGIN
  IF NOT public.is_chat_channel_member(p_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT pr.id, pr.first_name, pr.role
    FROM public.profiles pr
   WHERE pr.id IN (
     SELECT roster.account_id
       FROM public.chat_channel_roster_ids(p_channel_id) AS roster(account_id)
   )
   ORDER BY pr.id;
END;
$$;

COMMENT ON FUNCTION public.get_chat_channel_roster(p_channel_id uuid) IS
  'The accounts a channel can name: the group''s active seat-holders, the '
  'product''s assigned gedus, and everyone who has a message in the channel — '
  'that last clause is what keeps a departed member''s name on the words they '
  'left behind, and how a covering gedu or an admin becomes mentionable the '
  'moment they send. First name and role only; nothing else about anybody. '
  'Membership-scoped on is_chat_channel_member. Exists because `profiles` RLS '
  'correctly refuses cross-participant reads and persisted history cannot '
  'resolve names from a live call the way the old ephemeral chat did. ORDERED '
  'BY PROFILE ID and that is a contract: mention resolution settles two '
  'accounts sharing a name by list position, and the composer and the in-place '
  'editor must be handed the same array in the same order or one typed name '
  'would mean two different people.';

REVOKE EXECUTE ON FUNCTION public.get_chat_channel_roster(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_channel_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_channel_roster(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. send_chat_message
-- ---------------------------------------------------------------------------
--
-- The id is the CALLER'S, so the optimistic echo reconciles by identity. The
-- character cap is NOT re-measured here: the column's display-length CHECK owns
-- it, which is what stops a second number drifting from the first.
--
-- No rate limiting, anywhere, by decision (owner, 2026-09-01). The accepted
-- consequence is that a hostile-but-authenticated client can spam up to
-- whatever the moderator lock and account removal catch — the lock is the
-- per-person control that was asked for, and it is immediate.

CREATE FUNCTION public.send_chat_message(
  p_id                  uuid,
  p_channel_id          uuid,
  p_body                text,
  p_reply_to_message_id uuid DEFAULT NULL
)
  RETURNS timestamptz
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_created_at timestamptz;
BEGIN
  IF NOT public.is_chat_channel_member(p_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF public.chat_caller_is_locked(p_channel_id) THEN
    RAISE EXCEPTION 'You cannot send messages in this chat'
      USING ERRCODE = 'P0024';
  END IF;

  -- capabilities.ts offers reply only on a NON-HIDDEN message, and a reply
  -- across channels is not a thing the UI can express at all. A target that
  -- does not exist, one in another channel and one that has been removed are
  -- refused identically, so this cannot be used as an oracle for message ids.
  IF p_reply_to_message_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.chat_messages m
        WHERE m.id = p_reply_to_message_id
          AND m.channel_id = p_channel_id
          AND m.hidden_at IS NULL
     ) THEN
    RAISE EXCEPTION 'That message cannot be replied to'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.chat_body_mentions_are_roster(p_channel_id, p_body) THEN
    RAISE EXCEPTION 'This message mentions somebody who is not in this chat'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.chat_messages (
    id, channel_id, sender_id, body, reply_to_message_id
  )
  VALUES (p_id, p_channel_id, v_uid, p_body, p_reply_to_message_id)
  RETURNING chat_messages.created_at INTO v_created_at;

  RETURN v_created_at;
END;
$$;

COMMENT ON FUNCTION public.send_chat_message(uuid, uuid, text, uuid) IS
  'Post one text message, under the caller''s own id so the optimistic echo '
  'reconciles by identity. Guards, in order: channel membership (42501), not '
  'locked (P0024 — the one named refusal, because the client must not offer a '
  'retry for it), a reply target that is a NON-HIDDEN message of the same '
  'channel, and every mention token naming somebody on the channel roster. The '
  'character cap is the COLUMN''S, measured on the display form with mention '
  'tokens flattened; this function deliberately does not re-measure, so there '
  'is no second number to drift. Returns created_at.';

REVOKE EXECUTE ON FUNCTION public.send_chat_message(uuid, uuid, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, uuid, text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_chat_message(uuid, uuid, text, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5. send_chat_image_message
-- ---------------------------------------------------------------------------
--
-- Row first, object second: the row is what puts the guard in front of the
-- upload, and the upload route deletes the row again if the object fails to
-- land. The dimensions are the ones the route's re-encode MEASURED — a
-- client-claimed pair never reaches the columns, because a fabricated
-- 1 x 20000 would be a layout bomb in every viewer's log.
--
-- Like every RPC here it is directly callable by a member, and the harm of that
-- is bounded: a dimension-checked image row whose object never arrives, which
-- renders as the broken-image state and is moderatable exactly like nuisance
-- text. The same posture the session-photo route carries.
--
-- The reply parameter is load-bearing rather than symmetric: the composer fans
-- a burst out into one message per picture, so when a send has no text at all
-- the reply lands on the FIRST image.

CREATE FUNCTION public.send_chat_image_message(
  p_id                  uuid,
  p_channel_id          uuid,
  p_width               integer,
  p_height              integer,
  p_reply_to_message_id uuid DEFAULT NULL
)
  RETURNS timestamptz
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_created_at timestamptz;
BEGIN
  IF NOT public.is_chat_channel_member(p_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF public.chat_caller_is_locked(p_channel_id) THEN
    RAISE EXCEPTION 'You cannot send messages in this chat'
      USING ERRCODE = 'P0024';
  END IF;

  -- One refusal for every implausible dimension, rather than a 23514 from the
  -- CHECK for an out-of-range value and a 23502 from NOT NULL for a missing
  -- one. The table's constraints still stand behind this and are what make the
  -- bound a guarantee rather than a convention.
  IF p_width IS NULL OR p_height IS NULL
     OR p_width  <= 0 OR p_width  > 4096
     OR p_height <= 0 OR p_height > 4096 THEN
    RAISE EXCEPTION 'Image dimensions % x % are not a plausible chat image',
      COALESCE(p_width::text, 'NULL'), COALESCE(p_height::text, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_reply_to_message_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.chat_messages m
        WHERE m.id = p_reply_to_message_id
          AND m.channel_id = p_channel_id
          AND m.hidden_at IS NULL
     ) THEN
    RAISE EXCEPTION 'That message cannot be replied to'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.chat_messages (
    id, channel_id, sender_id, image_width, image_height, reply_to_message_id
  )
  VALUES (p_id, p_channel_id, v_uid, p_width, p_height, p_reply_to_message_id)
  RETURNING chat_messages.created_at INTO v_created_at;

  RETURN v_created_at;
END;
$$;

COMMENT ON FUNCTION public.send_chat_image_message(
  uuid, uuid, integer, integer, uuid
) IS
  'Create the ROW for one chat image, ahead of its object. Called by the upload '
  'route on the UPLOADER''S OWN client — this guard is the authorization, and '
  'the admin client is used for the storage write alone — with the dimensions '
  'the route''s sharp re-encode measured, never the ones a client claimed. Same '
  'membership, lock and reply-target guards as the text send; the reply '
  'parameter matters because a burst with no text puts the reply on the first '
  'image. Implausible dimensions are refused with check_violation as one class, '
  'the column CHECKs standing behind it. Returns created_at.';

REVOKE EXECUTE ON FUNCTION public.send_chat_image_message(
  uuid, uuid, integer, integer, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_chat_image_message(
  uuid, uuid, integer, integer, uuid
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_chat_image_message(
  uuid, uuid, integer, integer, uuid
) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. edit_chat_message
-- ---------------------------------------------------------------------------
--
-- capabilities.ts is the spec: `canEdit` is own AND not hidden AND not locked
-- AND settled AND the message has a body. Every clause of that is re-imposed
-- here, and "not locked" is the one worth naming — a lock takes edits away, so
-- this refusal is P0024 like a send's.

CREATE FUNCTION public.edit_chat_message(p_id uuid, p_body text)
  RETURNS timestamptz
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_channel_id uuid;
  v_sender_id  uuid;
  v_hidden_at  timestamptz;
  v_has_body   boolean;
  v_edited_at  timestamptz;
BEGIN
  SELECT m.channel_id, m.sender_id, m.hidden_at, m.body IS NOT NULL
    INTO v_channel_id, v_sender_id, v_hidden_at, v_has_body
    FROM public.chat_messages m
   WHERE m.id = p_id;

  -- A message that does not exist, one somebody else sent, and one in a channel
  -- the caller may no longer read all answer IDENTICALLY. The caller has no
  -- right to learn which of the three it was.
  IF v_channel_id IS NULL
     OR v_sender_id IS DISTINCT FROM v_uid
     OR NOT public.is_chat_channel_member(v_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF public.chat_caller_is_locked(v_channel_id) THEN
    RAISE EXCEPTION 'You cannot edit messages in this chat'
      USING ERRCODE = 'P0024';
  END IF;

  IF v_hidden_at IS NOT NULL OR NOT v_has_body THEN
    RAISE EXCEPTION 'That message cannot be edited'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.chat_body_mentions_are_roster(v_channel_id, p_body) THEN
    RAISE EXCEPTION 'This message mentions somebody who is not in this chat'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.chat_messages
     SET body = p_body, edited_at = now()
   WHERE id = p_id
  RETURNING chat_messages.edited_at INTO v_edited_at;

  RETURN v_edited_at;
END;
$$;

COMMENT ON FUNCTION public.edit_chat_message(uuid, text) IS
  'Rewrite the caller''s OWN standing text message in place, stamping '
  'edited_at. Refuses a removed message, an image message (there is nothing to '
  'edit) and any message under a lock — capabilities.ts is the spec and a lock '
  'takes edits away, so that refusal carries P0024. A message that does not '
  'exist, one somebody else sent and one in a channel the caller may no longer '
  'read are all refused identically with 42501. Mentions are validated against '
  'the channel roster exactly as on a send: an edit is a body write, and a name '
  'typed for the first time during one becomes a mention. The character cap '
  'stays the column''s.';

REVOKE EXECUTE ON FUNCTION public.edit_chat_message(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_chat_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_chat_message(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. hide_chat_message
-- ---------------------------------------------------------------------------
--
-- The soft delete, and the delete control for images too — there is no storage
-- action, because the bucket policy reads hidden_at live, so hiding an image
-- stops non-moderators minting fresh URLs by itself.
--
-- NO LOCK CHECK, deliberately. Taking back a regretted message is the one write
-- a lock leaves, so the own-message path has to survive one; and the moderator
-- path cannot meet a lock because set_chat_lock refuses a moderator target.
--
-- NO MOD-VS-MOD CHECK, deliberately. Moderation of a MESSAGE is symmetric: a
-- moderator may remove anyone's, a fellow gedu's and an admin's included. See
-- this file's header.

CREATE FUNCTION public.hide_chat_message(p_id uuid)
  RETURNS timestamptz
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_channel_id uuid;
  v_sender_id  uuid;
  v_hidden_at  timestamptz;
BEGIN
  SELECT m.channel_id, m.sender_id, m.hidden_at
    INTO v_channel_id, v_sender_id, v_hidden_at
    FROM public.chat_messages m
   WHERE m.id = p_id;

  IF v_channel_id IS NULL
     OR NOT public.is_chat_channel_member(v_channel_id)
     OR NOT (
       v_sender_id IS NOT DISTINCT FROM v_uid
       OR public.is_chat_channel_moderator(v_channel_id)
     ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- capabilities.ts offers neither delete nor hide on an already-removed
  -- message, so this cannot arrive from the UI; refusing keeps the two halves
  -- in step rather than silently re-stamping who removed it.
  IF v_hidden_at IS NOT NULL THEN
    RAISE EXCEPTION 'That message has already been removed'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.chat_messages
     SET hidden_at = now(), hidden_by = v_uid
   WHERE id = p_id
  RETURNING chat_messages.hidden_at INTO v_hidden_at;

  RETURN v_hidden_at;
END;
$$;

COMMENT ON FUNCTION public.hide_chat_message(p_id uuid) IS
  'Remove one message, leaving the tombstone — the SOFT delete the whole '
  'surface is built on: the row and the bytes survive, the row keeps its place '
  'in the log so nothing a reader is looking at moves, and moderators keep '
  'reading the original. Open to the SENDER (any sender, a locked one '
  'included — taking back a regretted message is the one write a lock leaves) '
  'and to any MODERATOR of the channel, symmetrically: a moderator may remove '
  'anyone''s message, a fellow gedu''s and an admin''s included, and the '
  'absence of a mod-vs-mod test here is a decision, not an oversight. Self '
  'delete and moderator removal leave the identical mark, so nothing on screen '
  'tells a room which happened; hidden_by answers that for the psql review path '
  'alone. This is also the delete control for an IMAGE: no storage action is '
  'taken, because the bucket policy reads hidden_at live.';

REVOKE EXECUTE ON FUNCTION public.hide_chat_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hide_chat_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hide_chat_message(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. restore_chat_message
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.restore_chat_message(p_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_channel_id uuid;
  v_hidden_at  timestamptz;
BEGIN
  SELECT m.channel_id, m.hidden_at
    INTO v_channel_id, v_hidden_at
    FROM public.chat_messages m
   WHERE m.id = p_id;

  IF v_channel_id IS NULL
     OR NOT public.is_chat_channel_moderator(v_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_hidden_at IS NULL THEN
    RAISE EXCEPTION 'That message has not been removed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- hidden_by is cleared with hidden_at: after a restore nothing was removed,
  -- and a stamp naming somebody for an act that no longer stands would read as
  -- an accusation in the psql review path it exists to serve.
  UPDATE public.chat_messages
     SET hidden_at = NULL, hidden_by = NULL
   WHERE id = p_id;
END;
$$;

COMMENT ON FUNCTION public.restore_chat_message(p_id uuid) IS
  'Put a removed message back. MODERATORS ONLY — the one control a tombstone '
  'carries — and only on a message that is actually removed. Clears hidden_by '
  'along with hidden_at. A message that does not exist and one in a channel the '
  'caller does not moderate are refused identically with 42501.';

REVOKE EXECUTE ON FUNCTION public.restore_chat_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_chat_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_chat_message(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. toggle_chat_reaction
-- ---------------------------------------------------------------------------
--
-- A reaction is a message with fewer characters, which is why a lock takes it
-- away too: a member locked out of chat who could still react would have been
-- locked out of nothing.
--
-- The code is NOT re-listed here. The delete runs first and the insert carries
-- the column's own CHECK, so an unapproved code is refused by the one place the
-- approved set lives in SQL rather than by a second copy of the list.

CREATE FUNCTION public.toggle_chat_reaction(p_message_id uuid, p_code text)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_uid        uuid := (SELECT auth.uid());
  v_channel_id uuid;
  v_hidden_at  timestamptz;
BEGIN
  SELECT m.channel_id, m.hidden_at
    INTO v_channel_id, v_hidden_at
    FROM public.chat_messages m
   WHERE m.id = p_message_id;

  IF v_channel_id IS NULL
     OR NOT public.is_chat_channel_member(v_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF public.chat_caller_is_locked(v_channel_id) THEN
    RAISE EXCEPTION 'You cannot react in this chat' USING ERRCODE = 'P0024';
  END IF;

  IF v_hidden_at IS NOT NULL THEN
    RAISE EXCEPTION 'That message cannot be reacted to'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM public.chat_reactions r
   WHERE r.message_id = p_message_id
     AND r.sender_id  = v_uid
     AND r.code       = p_code;

  IF FOUND THEN
    RETURN false;
  END IF;

  -- channel_id is stamped from the MESSAGE row, never from the caller: that is
  -- what stops a reaction being filed under a channel its message is not in,
  -- and the column exists so a postgres_changes subscription can filter on one
  -- column.
  INSERT INTO public.chat_reactions (message_id, sender_id, code, channel_id)
  VALUES (p_message_id, v_uid, p_code, v_channel_id);

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.toggle_chat_reaction(uuid, text) IS
  'Add or take back the caller''s reaction on one message, returning whether it '
  'now stands. Guards: channel membership, not locked (P0024 — a reaction is a '
  'message with fewer characters, so a lock takes it away), and a target that '
  'has not been removed. The channel_id on the new row is stamped from the '
  'MESSAGE, never from the caller. The approved code set is not restated here: '
  'the delete runs first and the insert meets the column''s own CHECK, so there '
  'is one list in SQL and it is the one mirroring CHAT_REACTION_CODES.';

REVOKE EXECUTE ON FUNCTION public.toggle_chat_reaction(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_chat_reaction(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_chat_reaction(uuid, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 10. set_chat_lock
-- ---------------------------------------------------------------------------
--
-- The asymmetric half of the moderation principle. A lock is a judgement about
-- a PERSON rather than about a message, so it is not offered against a
-- colleague: between staff that is not moderation, it is one member of staff
-- silencing another in front of the children they are both responsible for, and
-- a staff problem is handled off the platform, by people.
--
-- The moderator test on the TARGET is on their ROLE, matching
-- capabilities.ts's `isChatModerator(sender.role)` exactly — not on whether
-- they happen to be assigned to this product. A gedu who is on the roster only
-- because they dropped in and sent something is still a colleague.
--
-- The target must also be ON THE ROSTER. That is the target half of the
-- authorization: a moderator is authorized to lock people in this room, not to
-- write lock rows about arbitrary accounts.

CREATE FUNCTION public.set_chat_lock(
  p_channel_id uuid,
  p_user_id    uuid,
  p_locked     boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_uid         uuid := (SELECT auth.uid());
  v_target_role public.user_role;
BEGIN
  IF NOT public.is_chat_channel_moderator(p_channel_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR p_locked IS NULL THEN
    RAISE EXCEPTION 'A lock needs a person and a direction'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT pr.role INTO v_target_role
    FROM public.profiles pr WHERE pr.id = p_user_id;

  -- A moderator target is refused, which also covers the caller themselves:
  -- every moderator holds a moderating role, so "you cannot lock yourself"
  -- needs no separate clause.
  IF v_target_role IS NULL
     OR v_target_role IN ('admin'::public.user_role, 'gedu'::public.user_role)
  THEN
    RAISE EXCEPTION 'That person cannot be locked'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.chat_channel_roster_ids(p_channel_id) AS roster(account_id)
     WHERE roster.account_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'That person is not in this chat'
      USING ERRCODE = 'check_violation';
  END IF;

  -- UNLOCK IS AN UPDATE TO NULL, NEVER A DELETE, so both directions of the
  -- switch replicate to every subscriber without this table needing REPLICA
  -- IDENTITY FULL.
  INSERT INTO public.chat_channel_locks (
    channel_id, user_id, locked_at, locked_by, updated_at
  )
  VALUES (
    p_channel_id,
    p_user_id,
    CASE WHEN p_locked THEN now() END,
    v_uid,
    now()
  )
  ON CONFLICT (channel_id, user_id) DO UPDATE
    SET locked_at  = EXCLUDED.locked_at,
        locked_by  = EXCLUDED.locked_by,
        updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.set_chat_lock(uuid, uuid, boolean) IS
  'Silence one person in one channel, or lift it. MODERATORS ONLY, and the '
  'target must not be one: a lock is a judgement about a person rather than '
  'about a message, so it is the asymmetric half of the moderation principle '
  'and a moderator cannot lock a colleague. The target test reads their ROLE, '
  'mirroring capabilities.ts exactly, and refusing a moderator target also '
  'covers locking yourself. The target must additionally be on the channel '
  'roster — that is the target half of the authorization. Unlocking sets '
  'locked_at back to NULL and NEVER deletes the row, so a lock landing '
  'mid-conversation and a lock being lifted both arrive live rather than on '
  'refetch.';

REVOKE EXECUTE ON FUNCTION public.set_chat_lock(uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_chat_lock(uuid, uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_chat_lock(uuid, uuid, boolean)
  TO service_role;
