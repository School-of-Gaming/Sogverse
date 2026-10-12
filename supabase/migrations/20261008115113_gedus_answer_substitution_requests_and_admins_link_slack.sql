-- Gedus answer a substitution request either way, from the web or Discord, and
-- admins link Slack so they can approve an offer from it.
--
-- WHAT THIS CHANGES
--
-- 1. A gedu's answer to an open request is an OFFER or a DECLINE. The answer
--    lives on the existing `session_substitution_offers` row — one per
--    (request, gedu), as before — which gains `response` and `responded_at`.
--    The two answers switch freely until an admin approves somebody; a row is
--    updated, never deleted by a gedu. "Withdraw offer" is gone: declining is
--    how a gedu takes an offer back.
-- 2. The checks live once, in `respond_to_session_substitution(uuid, uuid,
--    response)`, which takes the gedu as an argument. The web's
--    `offer_session_substitution` and new `decline_session_substitution` call it
--    with `auth.uid()` after their role guard; two `…_for_discord_user`
--    wrappers, granted to the service role alone, call it with the gedu the
--    Discord user acts as. `withdraw_session_substitution_offer` is dropped.
-- 3. Which gedu a Discord user acts as is answered by one non-raising helper,
--    `discord_acting_gedu(text)`; `require_discord_linked_gedu` raises over it.
-- 4. Approval moves into `approve_substitution_offer_as(admin, offer)`, which
--    approves an OFFER only — a declined row is "not found". The web's
--    `approve_session_substitution_offer` calls it with `auth.uid()` after its
--    admin guard, and `approve_session_substitution_offer_for_slack_user` with
--    the admin the Slack user is linked to.
-- 5. The reads: a request's offer count counts offers only; the gedu's pool
--    says which answer the caller gave (`my_response`) in place of whether they
--    offered; the admin page's offers are offers only, stamped with when they
--    were given, beside the open request's declines; the gedu's own live
--    requests carry their session's product and group name, so the
--    Substitutions page can describe each one.
-- 6. Slack links, a copy of the Discord links for admins alone:
--    `slack_link_tokens`, `slack_links`, `consume_slack_link_token(text)` and
--    `require_slack_linked_admin(text)`.

-- ---------------------------------------------------------------------------
-- 1. The answer on the row
-- ---------------------------------------------------------------------------

CREATE TYPE public.substitution_offer_response AS ENUM ('offer', 'decline');

COMMENT ON TYPE public.substitution_offer_response IS 'A gedu''s answer to an open substitution request: `offer` (I can stand in) or `decline` (I cannot). Stored on session_substitution_offers.response.';

ALTER TABLE public.session_substitution_offers
  ADD COLUMN response public.substitution_offer_response NOT NULL DEFAULT 'offer',
  ADD COLUMN responded_at timestamp with time zone NOT NULL DEFAULT now();

-- Every row so far is an offer, given when it was created.
UPDATE public.session_substitution_offers SET responded_at = created_at;

COMMENT ON TABLE public.session_substitution_offers IS 'A gedu''s answer to a substitution request — one row per (request, gedu), carrying `offer` or `decline`. Written only by respond_to_session_substitution, which UPDATES the row when the gedu changes their mind: the two answers switch freely until an admin approves somebody, and a gedu never deletes a row. created_at is when the gedu first answered and responded_at when they last changed it. Approving one offer does not touch the others: "not selected" is DERIVED from the request being substituted by somebody else, and which offer was approved is the substituting gedu''s own row — which is why there is no approved_offer_id anywhere. Only an `offer` row can be approved. Answerers never learn who else answered; only the admin page reads this table, through get_admin_substitution_requests. Nothing is granted to `authenticated` or `anon`.';
COMMENT ON COLUMN public.session_substitution_offers.response IS 'The gedu''s current answer: `offer` or `decline`.';
COMMENT ON COLUMN public.session_substitution_offers.responded_at IS 'When the gedu last changed their answer (clock_timestamp at the write). The admin page orders offers by it.';

-- ---------------------------------------------------------------------------
-- 2. One body for both answers, and its web and Discord callers
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.respond_to_session_substitution(p_gedu_id uuid, p_request_id uuid, p_response public.substitution_offer_response) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_timezone   text;
  v_product_id uuid;
  v_row        public.session_substitution_requests;
BEGIN
  -- Locked, so an answer and an approval on one request serialize: an answer
  -- written after the approval sees the request substituted and is refused.
  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = p_request_id
     FOR UPDATE;

  -- An unknown id answers exactly as somebody else's request does, so this
  -- cannot be used to tell a real request from an invented one.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Taking back an answer somebody has already been staffed on is a new
  -- absence, not a change of mind.
  IF v_row.status = 'substituted'::public.substitution_request_status
     AND v_row.substitute_id = p_gedu_id THEN
    RAISE EXCEPTION 'you are the approved substitute for this session; file a substitution request instead'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_row.status <> 'open'::public.substitution_request_status THEN
    RAISE EXCEPTION 'this substitution request is % and is no longer taking offers', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.timezone, p.id INTO v_timezone, v_product_id
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = v_row.group_id;

  IF v_row.session_date < (now() AT TIME ZONE v_timezone)::date THEN
    RAISE EXCEPTION 'this session (%) is in the past', v_row.session_date
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_response = 'offer'::public.substitution_offer_response THEN
    IF NOT public.gedu_may_substitute_session(
             p_gedu_id, v_row.group_id, v_row.session_date, v_row.requested_by
           ) THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;

    -- Its own message, so the client can say why: the gedu is otherwise able
    -- to take the session, and the qualification is the one thing missing.
    IF NOT public.gedu_holds_session_qualifications(p_gedu_id, v_row.group_id) THEN
      RAISE EXCEPTION 'this gedu is not qualified for this session''s product'
        USING ERRCODE = '42501';
    END IF;

    -- Likewise its own message: the language is the one thing missing.
    IF NOT public.gedu_speaks_session_language(p_gedu_id, v_row.group_id) THEN
      RAISE EXCEPTION 'this gedu does not speak the language this session is run in'
        USING ERRCODE = '42501';
    END IF;

    -- Likewise its own message: the site is the one thing missing.
    IF NOT public.gedu_covers_product_site(p_gedu_id, v_product_id) THEN
      RAISE EXCEPTION 'this gedu does not cover the site this session is run at'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- A decline asks less than an offer: a gedu who could be asked, or one
    -- who has already answered. The second arm is what lets a gedu who has
    -- since dropped a language or an area take their offer back; without it,
    -- a decline from anybody else would be a read of the request wearing a
    -- write's clothes, so it is refused like an unknown id.
    IF NOT public.gedu_may_substitute_session(
             p_gedu_id, v_row.group_id, v_row.session_date, v_row.requested_by
           )
       AND NOT EXISTS (
             SELECT 1
               FROM public.session_substitution_offers o
              WHERE o.request_id = p_request_id
                AND o.gedu_id    = p_gedu_id
           ) THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Idempotent: giving the same answer twice changes nothing, not even when
  -- it was given; a different answer replaces the old one.
  INSERT INTO public.session_substitution_offers AS o
         (request_id, gedu_id, response, responded_at)
  VALUES (p_request_id, p_gedu_id, p_response, clock_timestamp())
  ON CONFLICT (request_id, gedu_id) DO UPDATE
     SET response     = EXCLUDED.response,
         responded_at = EXCLUDED.responded_at
   WHERE o.response IS DISTINCT FROM EXCLUDED.response;

  -- CONCEALED, explicitly: a gedu answering never learns whose absence this is.
  RETURN public.substitution_request_document(v_row, false, p_gedu_id, false);
END;
$$;

COMMENT ON FUNCTION public.respond_to_session_substitution(p_gedu_id uuid, p_request_id uuid, p_response public.substitution_offer_response) IS 'Internal: a gedu''s answer to one substitution request, `offer` or `decline`, the body behind offer_session_substitution, decline_session_substitution and their two Discord wrappers. Locks the request FOR UPDATE, so an answer and an approval serialize. Refuses, in order: an unknown request (42501, the same answer somebody else''s gets); the gedu being the approved substitute ("you are the approved substitute", check_violation); a request that is not `open` ("no longer taking offers", check_violation); a session dated before today in the product''s timezone ("is in the past", check_violation). An OFFER then asks the four eligibility tests, each with its own refusal: gedu_may_substitute_session (42501 Forbidden), gedu_holds_session_qualifications ("is not qualified"), gedu_speaks_session_language ("does not speak the language") and gedu_covers_product_site ("does not cover the site"), all 42501. A DECLINE asks only that the gedu passes gedu_may_substitute_session OR already holds a row on the request — so a gedu who has since dropped a language or an area can still take their offer back, while anybody else is refused 42501 rather than handed the document. Writes one row per (request, gedu): a new answer, or the other answer replacing the old one with responded_at = clock_timestamp(); the same answer twice changes nothing. Returns the request document with the absent gedu CONCEALED and no offer_count — who is away and who else answered are not the answerer''s business. Granted to nobody.';

REVOKE ALL ON FUNCTION public.respond_to_session_substitution(p_gedu_id uuid, p_request_id uuid, p_response public.substitution_offer_response) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.offer_session_substitution(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN public.respond_to_session_substitution(
    (SELECT auth.uid()), p_request_id, 'offer'::public.substitution_offer_response
  );
END;
$$;

COMMENT ON FUNCTION public.offer_session_substitution(p_request_id uuid) IS '"Offer to substitute", from the gedu''s pool: gedu-gated on its first statement, then respond_to_session_substitution with the caller and `offer` — the same refusals, codes and messages, and the same concealed document. An offer replaces the caller''s decline on the same request; offering twice is one offer. There is deliberately no ranking and no eligibility beyond certification, qualifications, spoken language and coverage; the office decides, and auto-approving the first offer was rejected because the admin step IS the product.';

REVOKE ALL ON FUNCTION public.offer_session_substitution(p_request_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.offer_session_substitution(p_request_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.offer_session_substitution(p_request_id uuid) TO service_role;

CREATE FUNCTION public.decline_session_substitution(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN public.respond_to_session_substitution(
    (SELECT auth.uid()), p_request_id, 'decline'::public.substitution_offer_response
  );
END;
$$;

COMMENT ON FUNCTION public.decline_session_substitution(p_request_id uuid) IS '"I cannot", from the gedu''s pool: gedu-gated on its first statement, then respond_to_session_substitution with the caller and `decline` — which replaces the caller''s offer on the same request, and is how an offer is taken back. Refused once the caller is the approved substitute, once the request is no longer open, for a past session, and for a gedu who could not be asked and holds no answer on it (42501, the same answer an unknown id gets). Returns the request document with the absent gedu concealed.';

REVOKE ALL ON FUNCTION public.decline_session_substitution(p_request_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_session_substitution(p_request_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_session_substitution(p_request_id uuid) TO service_role;

DROP FUNCTION public.withdraw_session_substitution_offer(uuid);

-- ---------------------------------------------------------------------------
-- 3. Which gedu a Discord user acts as
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.discord_acting_gedu(p_discord_user_id text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  -- One Discord account may be linked to several Sogverse accounts. Only an
  -- account that is a gedu NOW counts, so a profile whose role has changed
  -- since it was linked never answers; among several gedu accounts the one
  -- linked most recently is the one the person is acting as.
  SELECT l.profile_id
    FROM public.discord_links l
    JOIN public.profiles p ON p.id = l.profile_id
   WHERE l.discord_user_id = p_discord_user_id
     AND p.role = 'gedu'::public.user_role
   ORDER BY l.linked_at DESC, l.profile_id
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.discord_acting_gedu(p_discord_user_id text) IS 'The gedu account a Discord user id acts as, or NULL: the profile linked to it in discord_links whose role is gedu at the moment of asking, and among several such the most recently linked (linked_at, then profile id). The one definition of "the acting gedu" — require_discord_linked_gedu raises over it, and a reader that must know whether a gedu is the one their Discord account acts as compares against it. Granted to nobody.';

REVOKE ALL ON FUNCTION public.discord_acting_gedu(p_discord_user_id text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.require_discord_linked_gedu(p_discord_user_id text) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid := public.discord_acting_gedu(p_discord_user_id);
BEGIN
  IF v_gedu_id IS NULL THEN
    RAISE EXCEPTION 'DISCORD_GEDU_NOT_LINKED' USING ERRCODE = 'P0031';
  END IF;

  RETURN v_gedu_id;
END;
$$;

COMMENT ON FUNCTION public.require_discord_linked_gedu(p_discord_user_id text) IS 'The gedu account a Discord user id acts as (discord_acting_gedu), refusing with P0031 (DISCORD_GEDU_NOT_LINKED) when there is none — no link at all, links only to non-gedu accounts, or a NULL id — which the bot answers by asking the person to link their account. Every Discord wrapper calls it first. Granted to nobody.';

REVOKE ALL ON FUNCTION public.require_discord_linked_gedu(p_discord_user_id text) FROM PUBLIC;

CREATE FUNCTION public.offer_session_substitution_for_discord_user(p_discord_user_id text, p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN public.respond_to_session_substitution(
    public.require_discord_linked_gedu(p_discord_user_id),
    p_request_id,
    'offer'::public.substitution_offer_response
  );
END;
$$;

COMMENT ON FUNCTION public.offer_session_substitution_for_discord_user(p_discord_user_id text, p_request_id uuid) IS 'The Offer button on a substitution DM: require_discord_linked_gedu (P0031 when no gedu account is linked), then respond_to_session_substitution for that gedu with `offer` — the same refusals and concealed document as offer_session_substitution. For the Discord bot, on the service-role client: granted to service_role alone.';

REVOKE ALL ON FUNCTION public.offer_session_substitution_for_discord_user(p_discord_user_id text, p_request_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.offer_session_substitution_for_discord_user(p_discord_user_id text, p_request_id uuid) TO service_role;

CREATE FUNCTION public.decline_session_substitution_for_discord_user(p_discord_user_id text, p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN public.respond_to_session_substitution(
    public.require_discord_linked_gedu(p_discord_user_id),
    p_request_id,
    'decline'::public.substitution_offer_response
  );
END;
$$;

COMMENT ON FUNCTION public.decline_session_substitution_for_discord_user(p_discord_user_id text, p_request_id uuid) IS 'The Decline button on a substitution DM: require_discord_linked_gedu (P0031 when no gedu account is linked), then respond_to_session_substitution for that gedu with `decline` — the same refusals and concealed document as decline_session_substitution. For the Discord bot, on the service-role client: granted to service_role alone.';

REVOKE ALL ON FUNCTION public.decline_session_substitution_for_discord_user(p_discord_user_id text, p_request_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_session_substitution_for_discord_user(p_discord_user_id text, p_request_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Slack links, for admins
-- ---------------------------------------------------------------------------

CREATE TABLE public.slack_link_tokens (
    token_hash text PRIMARY KEY,
    slack_user_id text NOT NULL,
    slack_team_id text NOT NULL,
    slack_username text NOT NULL,
    expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '10 minutes'),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT slack_link_tokens_token_hash_is_a_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT slack_link_tokens_slack_user_id_check CHECK (slack_user_id ~ '^[A-Z0-9]{1,32}$'),
    CONSTRAINT slack_link_tokens_slack_team_id_check CHECK (slack_team_id ~ '^[A-Z0-9]{1,32}$'),
    CONSTRAINT slack_link_tokens_slack_username_check CHECK (
      slack_username = btrim(slack_username)
      AND char_length(slack_username) BETWEEN 1 AND 80)
);

CREATE INDEX slack_link_tokens_expires_at_idx ON public.slack_link_tokens (expires_at);

COMMENT ON TABLE public.slack_link_tokens IS 'One-time tokens the Slack app mints for its link command, each bound to the Slack user who ran it. Only the SHA-256 of the token is stored (lowercase hex); the raw token travels in the URL the app replies with. Inserted by the Slack webhook as the service role, consumed by consume_slack_link_token; no grant at all for anon or authenticated. Expired rows are swept on every insert and on every successful link.';
COMMENT ON COLUMN public.slack_link_tokens.token_hash IS 'The SHA-256 of the raw token, as 64 lowercase hex characters: encode(extensions.digest(token, ''sha256''), ''hex'') in SQL, createHash(''sha256'').digest(''hex'') in Node.';
COMMENT ON COLUMN public.slack_link_tokens.slack_user_id IS 'The Slack user id (uppercase letters and digits) from the signed request that minted the token.';
COMMENT ON COLUMN public.slack_link_tokens.slack_team_id IS 'The Slack workspace id from the signed request that minted the token.';
COMMENT ON COLUMN public.slack_link_tokens.slack_username IS 'The Slack username at the time the token was minted, shown on the confirmation page and copied onto the link.';
COMMENT ON COLUMN public.slack_link_tokens.expires_at IS 'When the token stops being accepted: ten minutes after it was minted unless the inserter says otherwise.';

ALTER TABLE public.slack_link_tokens ENABLE ROW LEVEL SECURITY;

-- No policies: authenticated and anon hold no grant, and the service role and
-- the consuming function bypass RLS.
REVOKE ALL ON TABLE public.slack_link_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.slack_link_tokens TO service_role;

CREATE FUNCTION public.sweep_expired_slack_link_tokens() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  DELETE FROM public.slack_link_tokens WHERE expires_at <= now();
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.sweep_expired_slack_link_tokens() IS 'Statement trigger on slack_link_tokens: deletes every expired token before rows are inserted, which keeps the table small without a scheduled job.';

REVOKE ALL ON FUNCTION public.sweep_expired_slack_link_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_expired_slack_link_tokens() TO service_role;

CREATE TRIGGER slack_link_tokens_sweep_expired BEFORE INSERT ON public.slack_link_tokens
  FOR EACH STATEMENT EXECUTE FUNCTION public.sweep_expired_slack_link_tokens();

CREATE TABLE public.slack_links (
    profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    slack_user_id text NOT NULL,
    slack_team_id text NOT NULL,
    slack_username text NOT NULL,
    linked_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT slack_links_slack_user_id_check CHECK (slack_user_id ~ '^[A-Z0-9]{1,32}$'),
    CONSTRAINT slack_links_slack_team_id_check CHECK (slack_team_id ~ '^[A-Z0-9]{1,32}$'),
    CONSTRAINT slack_links_slack_username_check CHECK (
      slack_username = btrim(slack_username)
      AND char_length(slack_username) BETWEEN 1 AND 80)
);

CREATE INDEX slack_links_slack_user_id_idx ON public.slack_links (slack_user_id);

COMMENT ON TABLE public.slack_links IS 'An admin''s linked Slack account, at most one per profile, which is what lets an admin act from Slack — approving an offer with the Accept button. A Slack user may be linked to several profiles. Written only by consume_slack_link_token, where linking again replaces the profile''s previous link; there is no unlink. authenticated holds SELECT alone: the owner reads their own row, an admin reads every row.';
COMMENT ON COLUMN public.slack_links.slack_user_id IS 'The Slack user id, taken from a token the Slack app minted for a signed request. Not unique: one person may link several Sogverse accounts.';
COMMENT ON COLUMN public.slack_links.slack_team_id IS 'The Slack workspace the linking request came from.';
COMMENT ON COLUMN public.slack_links.slack_username IS 'The Slack username as it was when the profile was last linked. Not kept in sync with Slack.';
COMMENT ON COLUMN public.slack_links.linked_at IS 'When the profile was last linked: replaced on every re-link.';

ALTER TABLE public.slack_links ENABLE ROW LEVEL SECURITY;

-- The owner reads their own; an admin reads everyone's. Nobody else reads the
-- table.
CREATE POLICY slack_links_owner_or_admin_read ON public.slack_links
  FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

REVOKE ALL ON TABLE public.slack_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.slack_links TO authenticated;
GRANT ALL ON TABLE public.slack_links TO service_role;

CREATE FUNCTION public.consume_slack_link_token(p_token text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_token public.slack_link_tokens%ROWTYPE;
BEGIN
  PERFORM public.assert_admin();

  -- Deleting first is what makes the token single-use: a concurrent second
  -- call waits on the row lock and then finds nothing. A NULL token hashes to
  -- NULL and matches no row.
  DELETE FROM public.slack_link_tokens t
   WHERE t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  RETURNING t.* INTO v_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SLACK_LINK_TOKEN_NOT_FOUND' USING ERRCODE = 'P0032';
  END IF;

  -- The raise rolls the delete back, so an expired token keeps answering
  -- "expired" until the next sweep removes it.
  IF v_token.expires_at <= now() THEN
    RAISE EXCEPTION 'SLACK_LINK_TOKEN_EXPIRED' USING ERRCODE = 'P0033';
  END IF;

  INSERT INTO public.slack_links (profile_id, slack_user_id, slack_team_id, slack_username, linked_at)
  VALUES ((SELECT auth.uid()), v_token.slack_user_id, v_token.slack_team_id, v_token.slack_username, now())
  ON CONFLICT (profile_id) DO UPDATE
     SET slack_user_id = EXCLUDED.slack_user_id,
         slack_team_id = EXCLUDED.slack_team_id,
         slack_username = EXCLUDED.slack_username,
         linked_at = EXCLUDED.linked_at;

  DELETE FROM public.slack_link_tokens WHERE expires_at <= now();

  RETURN v_token.slack_username;
END;
$$;

COMMENT ON FUNCTION public.consume_slack_link_token(p_token text) IS 'Links the calling admin''s profile to the Slack user a link token was minted for, and returns that Slack username. Takes the raw token and hashes it here (SHA-256, hex). The token is deleted, so it works once; the caller''s previous link, if any, is replaced, and no other profile''s link is touched. Refuses every role but admin with 42501, a token that is unknown or already used with P0032 (SLACK_LINK_TOKEN_NOT_FOUND), and an expired one with P0033 (SLACK_LINK_TOKEN_EXPIRED). SECURITY DEFINER because slack_link_tokens has no authenticated grant and slack_links no authenticated write grant: it is the write boundary for both.';

REVOKE ALL ON FUNCTION public.consume_slack_link_token(p_token text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_slack_link_token(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_slack_link_token(p_token text) TO service_role;

CREATE FUNCTION public.require_slack_linked_admin(p_slack_user_id text) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  -- Only an account that is an admin NOW counts, and among several the one
  -- linked most recently is the one the person is acting as.
  SELECT l.profile_id INTO v_admin_id
    FROM public.slack_links l
    JOIN public.profiles p ON p.id = l.profile_id
   WHERE l.slack_user_id = p_slack_user_id
     AND p.role = 'admin'::public.user_role
   ORDER BY l.linked_at DESC, l.profile_id
   LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'SLACK_ADMIN_NOT_LINKED' USING ERRCODE = 'P0034';
  END IF;

  RETURN v_admin_id;
END;
$$;

COMMENT ON FUNCTION public.require_slack_linked_admin(p_slack_user_id text) IS 'The admin account a Slack user id acts as: the profile linked to it in slack_links whose role is admin at the moment of asking, and among several such the most recently linked (linked_at, then profile id). Refuses with P0034 (SLACK_ADMIN_NOT_LINKED) when there is none — no link at all, links only to non-admin accounts, or a NULL id — which the Slack app answers by asking the person to link their account. Every Slack wrapper calls it first. Granted to nobody.';

REVOKE ALL ON FUNCTION public.require_slack_linked_admin(p_slack_user_id text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 5. Approval, from the web and from Slack
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.approve_substitution_offer_as(p_admin_id uuid, p_offer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_request_id uuid;
  v_sub_id     uuid;
  v_group_id   uuid;
  v_row        public.session_substitution_requests;
BEGIN
  -- Only an OFFER can be approved: a declined row is not found.
  SELECT o.request_id, o.gedu_id INTO v_request_id, v_sub_id
    FROM public.session_substitution_offers o
   WHERE o.id = p_offer_id
     AND o.response = 'offer'::public.substitution_offer_response;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Substitution offer not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT r.group_id INTO v_group_id
    FROM public.session_substitution_requests r
   WHERE r.id = v_request_id;

  -- The (group, date) serialization point, taken first by every admin write.
  PERFORM 1 FROM public.product_groups g WHERE g.id = v_group_id FOR UPDATE;

  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = v_request_id
     FOR UPDATE;

  -- The answer is read again under the request's lock, which every answer
  -- takes too: a gedu who declined between the lookup above and the lock is
  -- not seated.
  IF NOT EXISTS (
       SELECT 1
         FROM public.session_substitution_offers o
        WHERE o.id = p_offer_id
          AND o.response = 'offer'::public.substitution_offer_response
     ) THEN
    RAISE EXCEPTION 'Substitution offer not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status <> 'open'::public.substitution_request_status THEN
    RAISE EXCEPTION 'this substitution request is already %', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- THE ABSENT GEDU MUST STILL HOLD THE SEAT THEY FILED AGAINST. An admin can
  -- remove a gedu from a group through the groups panel while a request of
  -- theirs is open, and approving an offer on an orphaned request would seat a
  -- sub to substitute for nobody — and hand them the group's workspace for it.
  -- The panel sweeps the requests it orphans, so this is the second line of
  -- defence rather than the first.
  --
  -- A REFUSAL rather than a withdraw-and-refuse, and that is forced rather than
  -- chosen: the RAISE aborts the transaction, so a withdraw written first would
  -- be rolled back with it.
  IF NOT public.gedu_holds_seat_at_session(
           v_row.requested_by, v_row.group_id, v_row.session_date
         ) THEN
    RAISE EXCEPTION 'gedu % no longer holds a seat on group % (%), so there is nothing to substitute for',
                    v_row.requested_by, v_row.group_id, v_row.session_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- Re-asked under the lock, because an offer can go stale between being made
  -- and being approved: the offerer may since have been assigned to the group,
  -- been seated as somebody else's sub on the same date, filed an absence of
  -- their own, or been de-certified.
  IF NOT public.gedu_may_substitute_session(
           v_sub_id, v_row.group_id, v_row.session_date, v_row.requested_by
         ) THEN
    RAISE EXCEPTION 'gedu % can no longer substitute on group % on %',
                    v_sub_id, v_row.group_id, v_row.session_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- The other answers are deliberately untouched: "not selected" is derived
  -- from the request being substituted by somebody else.
  UPDATE public.session_substitution_requests
     SET status        = 'substituted'::public.substitution_request_status,
         substitute_id = v_sub_id,
         approved_by   = p_admin_id,
         approved_at   = now()
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN public.substitution_request_document(v_row, true, p_admin_id);
END;
$$;

COMMENT ON FUNCTION public.approve_substitution_offer_as(p_admin_id uuid, p_offer_id uuid) IS 'Internal: the admin p_admin_id picks one offer, and its gedu becomes the substitute — `open` -> `substituted`, stamping substitute_id, approved_by = p_admin_id and approved_at. The body behind approve_session_substitution_offer (the web) and approve_session_substitution_offer_for_slack_user (Slack). Only a row whose response is `offer` is approvable: a declined row is refused as not found (P0002), asked again under the request''s lock so a decline racing the approval wins. Takes the group row''s lock and then the request''s FOR UPDATE, so two admins approving two offers on one session serialize and the second is refused ("is already", check_violation). Re-asks under that lock whether the ABSENT gedu still holds a seat at the session (gedu_holds_seat_at_session; "no longer holds a seat", check_violation) — approving an orphaned request would seat a sub for nobody — and whether the offerer may still substitute (gedu_may_substitute_session; "can no longer substitute", check_violation), because an offer goes stale: the offerer gets assigned to the group, seated as somebody else''s sub on the same date, files an absence of their own, or is de-certified. A refusal rather than a withdraw-and-refuse, because the RAISE would roll a withdraw back with the rest of the transaction. The OTHER ANSWERS ARE NOT TOUCHED: "not selected" is derived from the request being substituted by somebody else, which is why no approved_offer_id exists. Returns the admin document. Granted to nobody.';

REVOKE ALL ON FUNCTION public.approve_substitution_offer_as(p_admin_id uuid, p_offer_id uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.approve_session_substitution_offer(p_offer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN public.approve_substitution_offer_as((SELECT auth.uid()), p_offer_id);
END;
$$;

COMMENT ON FUNCTION public.approve_session_substitution_offer(p_offer_id uuid) IS 'An admin approves one offer from the Substitutions page: admin-gated on its first statement, then approve_substitution_offer_as with the caller — the same refusals, codes and messages (P0002 for an offer that is not there or was declined; check_violation for a request already settled, an absent gedu who no longer holds the seat, and an offerer who can no longer substitute), and the same admin document.';

REVOKE ALL ON FUNCTION public.approve_session_substitution_offer(p_offer_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_session_substitution_offer(p_offer_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_session_substitution_offer(p_offer_id uuid) TO service_role;

CREATE FUNCTION public.approve_session_substitution_offer_for_slack_user(p_slack_user_id text, p_offer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN public.approve_substitution_offer_as(
    public.require_slack_linked_admin(p_slack_user_id), p_offer_id
  );
END;
$$;

COMMENT ON FUNCTION public.approve_session_substitution_offer_for_slack_user(p_slack_user_id text, p_offer_id uuid) IS 'The Accept button on an offer in the Slack substitutions channel: require_slack_linked_admin (P0034 when no admin account is linked), then approve_substitution_offer_as for that admin — the same refusals and admin document as approve_session_substitution_offer, with approved_by naming the linked admin. For the Slack webhook, on the service-role client: granted to service_role alone.';

REVOKE ALL ON FUNCTION public.approve_session_substitution_offer_for_slack_user(p_slack_user_id text, p_offer_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_session_substitution_offer_for_slack_user(p_slack_user_id text, p_offer_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The reads count offers, and the pool and the office see the answers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.substitution_request_document(p_request public.session_substitution_requests, p_include_reason boolean, p_viewer_id uuid, p_reveal_requester boolean DEFAULT false) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'id',           p_request.id,
    'group_id',     p_request.group_id,
    'session_date', p_request.session_date,
    'role',         p_request.role,
    'status',       p_request.status,
    'created_at',   p_request.created_at,
    -- WHO IS ABSENT travels for three readers and no others: an admin
    -- (p_include_reason, which every admin path already passes), the requester
    -- themselves, and a caller that has explicitly asked to reveal it because
    -- its own reader is staff on the group — which is the gedu workspace feed
    -- and nothing else. A volunteer answering the pool gets JSON null here,
    -- because the pool names the session and never the person.
    --
    -- Emitted as null rather than omitted, exactly as reason and offer_count
    -- are: the document keeps ONE shape for every reader, so no client schema
    -- branches on which keys arrived.
    'requested_by',
      CASE WHEN p_include_reason
                OR p_reveal_requester
                OR p_request.requested_by = p_viewer_id
           THEN p_request.requested_by
      END,
    'requested_by_first_name',
      CASE WHEN p_include_reason
                OR p_reveal_requester
                OR p_request.requested_by = p_viewer_id
           THEN (
             SELECT pr.first_name
               FROM public.profiles pr
              WHERE pr.id = p_request.requested_by
           )
      END,
    'substitute_id',   p_request.substitute_id,
    'substitute_first_name', (
      SELECT pr.first_name FROM public.profiles pr WHERE pr.id = p_request.substitute_id
    ),
    'approved_at',  p_request.approved_at,
    -- Whether the VIEWER is the absent gedu. The card shows a status line and a
    -- Withdraw button off this, and nothing else needs it.
    'is_requester', COALESCE(p_request.requested_by = p_viewer_id, false),
    -- How many OFFERS are waiting — declines are not counted — for the
    -- REQUESTER (their own status line) and for an admin (the queue). A
    -- colleague sees null: how many people volunteered for somebody else's
    -- absence is not their business, and answerers never learn who else
    -- answered.
    'offer_count',
      CASE WHEN p_include_reason OR p_request.requested_by = p_viewer_id
           THEN (
             SELECT count(*)::integer
               FROM public.session_substitution_offers o
              WHERE o.request_id = p_request.id
                AND o.response = 'offer'::public.substitution_offer_response
           )
      END,
    -- Admin-only, and emitted as JSON null rather than omitted so the document
    -- keeps ONE shape for both readers — a client schema that had to branch on
    -- which keys are present would be a second place the rule lives.
    'reason',      CASE WHEN p_include_reason THEN p_request.reason END,
    'reason_note', CASE WHEN p_include_reason THEN p_request.reason_note END
  );
$$;

COMMENT ON FUNCTION public.substitution_request_document(p_request public.session_substitution_requests, p_include_reason boolean, p_viewer_id uuid, p_reveal_requester boolean) IS 'Internal: the ONE wire shape of a substitution request. Every substitution write returns it and both staff feeds'' `substitutions` arrays are built from it, so no surface can drift about what a request is. Takes the ROW rather than an id, so a feed aggregates it over a query and a writer hands over the row it just wrote. THREE fields are keyed to the reader rather than to the RPC, and all three are emitted as JSON null when the reader is not entitled to them rather than omitted, so the document keeps one shape for every reader and no client schema branches on which keys arrived. `reason`/`reason_note` travel on p_include_reason, the ADMIN flag, alone. `offer_count` — the answers that are offers, declines not counted — travels for an admin and for the requester themselves, because how many people volunteered for a colleague''s absence is not their business. And WHO IS ABSENT — requested_by with its first name — travels for an admin, for a viewer who IS the requester, and for a caller that passed p_reveal_requester because its own reader is staff on the group; that flag DEFAULTS TO FALSE, so a caller added later that forgets it conceals, and the only caller passing it today is get_gedu_group_feed, whose reader reached the group''s workspace and whose session card''s staffing line names who is away. The answer RPCs pass false explicitly: a volunteer decides on the session and never on the person, which is the same rule the pool list keeps by never naming them at all. Not granted to `authenticated`.';

REVOKE ALL ON FUNCTION public.substitution_request_document(p_request public.session_substitution_requests, p_include_reason boolean, p_viewer_id uuid, p_reveal_requester boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.substitution_request_document(p_request public.session_substitution_requests, p_include_reason boolean, p_viewer_id uuid, p_reveal_requester boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.get_open_substitution_requests() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_caller uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  -- The pool list: every open request the caller could actually take. The
  -- exclusion is the `may substitute` predicate itself rather than a hand-written
  -- copy of its clauses, so the list and the offer button can never disagree —
  -- a session the gedu is expected at, one they have their own request on, and
  -- their own absence are all out by construction. The qualification, language
  -- and coverage predicates are the offer's other three tests and are asked
  -- here for the same reason: a request on a product the caller is not
  -- qualified for, that is run in a language they have not listed, or whose
  -- site is outside their coverage areas, is not in their pool.
  --
  -- A request the caller DECLINED stays in the list, marked by my_response, so
  -- they can still change their mind and offer.
  --
  -- The ABSENT GEDU IS NOT NAMED. Naming them half-reveals a private reason
  -- (everybody knows who is off sick), and the seat being substituted belongs to the
  -- group rather than to a person the volunteer needs to know about.
  --
  -- No upper bound on the date: the list matches the notification DMs, which go
  -- out when a request is filed, however far ahead its session is.
  --
  -- The client owns the calendar math, exactly as both feeds do — this emits the
  -- date plus the product's slots and timezone and computes no instant.
  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'request_id',   r.id,
               'group_id',     r.group_id,
               'group_name',   g.name,
               'session_date', r.session_date,
               'role',         r.role,
               -- The fee for THIS role, and null when the product has not set
               -- one. Null is a blank field rather than a volunteer session: the
               -- surface shows nothing and flags nothing, which is the existing
               -- treatment of a missing assistant fee.
               'fee_cents',
                 CASE r.role
                   WHEN 'primary'::public.gedu_assignment_role
                     THEN p.primary_gedu_fee_cents
                   ELSE p.assistant_gedu_fee_cents
                 END,
               -- The caller's own answer — 'offer', 'decline' or null when
               -- they have not answered — and never anybody else's.
               'my_response', (
                 SELECT o.response
                   FROM public.session_substitution_offers o
                  WHERE o.request_id = r.id
                    AND o.gedu_id    = v_caller
               ),
               -- The session, described exactly as every other substitution
               -- surface describes it.
               'product', public.session_product_document(p)
             )
             ORDER BY r.session_date, p.id, g.name, r.id
           )
      FROM public.session_substitution_requests r
      JOIN public.product_groups g ON g.id = r.group_id
      JOIN public.products p       ON p.id = g.product_id
     WHERE r.status = 'open'::public.substitution_request_status
       AND r.session_date >= (now() AT TIME ZONE p.timezone)::date
       AND public.gedu_may_substitute_session(
             v_caller, r.group_id, r.session_date, r.requested_by
           )
       AND public.gedu_holds_session_qualifications(v_caller, r.group_id)
       AND public.gedu_speaks_session_language(v_caller, r.group_id)
       AND public.gedu_covers_product_site(v_caller, p.id)
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_open_substitution_requests() IS 'The gedu dashboard''s "Sessions needing a substitute": every `open` request dated today or later in the product''s timezone, however far ahead, that the CALLER could actually take. The exclusion is the offer''s own four tests — gedu_may_substitute_session, gedu_holds_session_qualifications, gedu_speaks_session_language and gedu_covers_product_site — rather than a copy of their clauses, so this list and the offer button can never disagree: a request on a product whose qualifications the caller does not hold, that is run in a language the caller has not listed, or that is in person at a site outside the caller''s coverage areas, is not in their pool. A gedu who has listed no language sees none, and one who has ticked no coverage area sees online sessions only. Each line carries the session''s product as session_product_document describes it — the one shell every substitution surface shares — plus the group name, the date, the role and THAT ROLE''s fee (null when the product has not set one — a blank field, not a volunteer session), and my_response: the caller''s own answer, `offer`, `decline` or null. A request the caller declined stays in the list, so they can still offer. The ABSENT GEDU IS DELIBERATELY NOT NAMED: naming them half-reveals a private reason, and the seat belongs to the group. Contains no schedule expansion — the client owns the calendar math, exactly as both feeds do. Gedu-gated on its first statement; an uncertified gedu gets an empty list, because certification is one of the may-substitute predicate''s refusals.';

REVOKE ALL ON FUNCTION public.get_open_substitution_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_open_substitution_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_open_substitution_requests() TO service_role;

CREATE OR REPLACE FUNCTION public.get_admin_substitution_requests() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN COALESCE((
    SELECT jsonb_agg(q.doc ORDER BY q.session_date, q.product_id, q.id)
      FROM (
        SELECT r.id,
               r.session_date,
               p.id AS product_id,
               jsonb_build_object(
                 'id',           r.id,
                 'status',       r.status,
                 'group_id',     r.group_id,
                 'group_name',   g.name,
                 'session_date', r.session_date,
                 'role',         r.role,
                 'reason',       r.reason,
                 'reason_note',  r.reason_note,
                 'created_at',   r.created_at,
                 'requested_by', r.requested_by,
                 'requested_by_first_name', rq.first_name,
                 'requested_by_last_name',  rq.last_name,
                 'substitute_id',           r.substitute_id,
                 'substitute_first_name',   sp.first_name,
                 'substitute_last_name',    sp.last_name,
                 'approved_at',             r.approved_at,
                 'approved_by',             r.approved_by,
                 'approved_by_first_name',  ap.first_name,
                 'approved_by_last_name',   ap.last_name,
                 -- The session, described exactly as every other substitution
                 -- surface describes it — venue or remote included.
                 'product', public.session_product_document(p),
                 -- Offers are the open question; a substituted row has had it
                 -- answered, so it carries none. Only the answers that ARE
                 -- offers: a decline cannot be approved.
                 'offers', CASE
                   WHEN r.status = 'open'::public.substitution_request_status
                   THEN COALESCE((
                     SELECT jsonb_agg(
                              jsonb_build_object(
                                'id',           o.id,
                                'gedu_id',      o.gedu_id,
                                'first_name',   op.first_name,
                                'last_name',    op.last_name,
                                'responded_at', o.responded_at
                              )
                              ORDER BY o.responded_at, o.id
                            )
                       FROM public.session_substitution_offers o
                       JOIN public.profiles op ON op.id = o.gedu_id
                      WHERE o.request_id = r.id
                        AND o.response = 'offer'::public.substitution_offer_response
                   ), '[]'::jsonb)
                   ELSE '[]'::jsonb
                 END,
                 -- Who said they cannot, on an open row — for the office to
                 -- read, with nothing to act on. Their ids and names only.
                 'declines', CASE
                   WHEN r.status = 'open'::public.substitution_request_status
                   THEN COALESCE((
                     SELECT jsonb_agg(
                              jsonb_build_object(
                                'gedu_id',      o.gedu_id,
                                'first_name',   op.first_name,
                                'last_name',    op.last_name,
                                'responded_at', o.responded_at
                              )
                              ORDER BY o.responded_at, o.id
                            )
                       FROM public.session_substitution_offers o
                       JOIN public.profiles op ON op.id = o.gedu_id
                      WHERE o.request_id = r.id
                        AND o.response = 'decline'::public.substitution_offer_response
                   ), '[]'::jsonb)
                   ELSE '[]'::jsonb
                 END
               ) AS doc
          FROM public.session_substitution_requests r
          JOIN public.product_groups g ON g.id = r.group_id
          JOIN public.products p       ON p.id = g.product_id
          JOIN public.profiles rq      ON rq.id = r.requested_by
          -- LEFT only because an open row has no substitute and no approver;
          -- chk_substitution_state sets both on every substituted row.
          LEFT JOIN public.profiles sp ON sp.id = r.substitute_id
          LEFT JOIN public.profiles ap ON ap.id = r.approved_by
         WHERE r.status IN (
                 'open'::public.substitution_request_status,
                 'substituted'::public.substitution_request_status
               )
           AND r.session_date >= (now() AT TIME ZONE p.timezone)::date
           -- Cancellation: a cancelled session needs no cover, so its requests
           -- leave both lists. They are kept, not withdrawn, so restoring the
           -- session brings them back as they were.
           AND NOT public.group_session_is_cancelled(r.group_id, r.session_date)
      ) q
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_admin_substitution_requests() IS 'The admin Substitutions page: a bare ARRAY of every OPEN and every SUBSTITUTED request dated today or later in its product''s timezone, ordered by date then product then id; the client splits it by `status` into the queue still to staff and the sessions that already have a substitute. Each row carries the group, the session''s product as session_product_document describes it — the one shell every substitution surface shares, so the remote flag, the venue, the topic and the language reach the office exactly as they reach a volunteer — the requester''s name, the role being substituted, the reason and note, and — on a substituted row — the substitute''s id and name, approved_at, and the approving admin''s id and name; those keys are JSON null on an open row, so the document keeps one shape. An open row carries every OFFER — {id, gedu_id, first_name, last_name, responded_at}, ordered by when it was given — and every DECLINE — {gedu_id, first_name, last_name, responded_at} — the offerer''s or decliner''s NAME AND NOTHING ELSE; a substituted row''s offers and declines are always the empty array, because the approval answered them. One read for both lists, so an approval moves a row between them in one refetch. An empty array is the all-clear. A request whose date has PASSED drops out on its own: "unfilled" is a derived state of an open request and not something an admin can still act on, and a past substitution is history the group''s own page carries. A request the schedule no longer projects stays in, because this orders by DATE and never by a derived instant. Withdrawn requests are history and never appear. An offer carries NO certified flag and NO criminal_record_check_at, and that is about the data rather than the design: an uncertified gedu cannot hold an offer, because gedu_may_substitute_session requires `certified` and guards every path that creates one, approval re-asks it under the request''s lock and set_session_substitution asks it too — so a "certified" chip was true by construction, and the one case it could have caught (an offerer de-certified after offering) is refused at approval with a message the admin reads. The extract stamp is children''s-safety data about a contractor and is not emitted to a surface that does not act on it. A bare array rather than an object of members, exactly as the gedu''s own pool read returns one. Admin-only, guard-first. SLOTS and not an instant: the client owns the calendar maths on every substitution surface, exactly as both session feeds do. The reason travels to admins only: here, in the admin session document, and in the notification snapshot, which is service-role only and is read to post the request to the admins'' Slack channel — a `sick` category is health data about a contractor.';

REVOKE ALL ON FUNCTION public.get_admin_substitution_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_substitution_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_substitution_requests() TO service_role;

CREATE OR REPLACE FUNCTION public.gedu_live_substitution_requests(p_gedu_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
           jsonb_agg(
             -- The request as its requester reads it, plus the session it is
             -- on: the group's name, the product as session_product_document
             -- describes it — the one shell every substitution surface shares —
             -- and whether that session is cancelled. A cancelled session's
             -- request stays in this list, because the filing write still
             -- refuses a second one there; a surface that describes requests
             -- hides it, as the pool and the admin page do.
             public.substitution_request_document(r, false, p_gedu_id)
               || jsonb_build_object(
                    'group_name',        g.name,
                    'product',           public.session_product_document(p),
                    'session_cancelled', public.group_session_is_cancelled(r.group_id, r.session_date)
                  )
             ORDER BY r.session_date, r.group_id
           ),
           '[]'::jsonb
         )
    FROM public.session_substitution_requests r
    JOIN public.product_groups g ON g.id = r.group_id
    JOIN public.products p       ON p.id = g.product_id
   WHERE r.requested_by = p_gedu_id
     -- The first clause of gedu_is_expected_at_session: a non-withdrawn
     -- request, open or substituted, means its filer is not coming.
     AND r.status <> 'withdrawn'::public.substitution_request_status
     -- The filing write's own past-session bound, in the product's zone.
     AND r.session_date >= (now() AT TIME ZONE p.timezone)::date;
$$;

COMMENT ON FUNCTION public.gedu_live_substitution_requests(p_gedu_id uuid) IS 'Internal: the given gedu''s LIVE substitution requests — every request they filed whose status is not withdrawn (open or substituted), dated today or later in the product''s timezone — as an array of request documents read as the requester reads their own (substitution_request_document with no reason, the viewer being the gedu, so the offer count and the substitute''s name travel), each extended with `group_name`, `product` — the session''s product as session_product_document describes it — and `session_cancelled` (group_session_is_cancelled), ordered by date then group. The Substitutions page draws its "Your requests" cards from them, leaving out a cancelled session''s request as the pool and the admin page do. "Live" is the first clause of gedu_is_expected_at_session, so a (group, date) here is exactly one file_session_substitution_request refuses with 42501, and a withdrawn request, which lets the gedu ask again, is never here. A request on a cancelled session is included, because cancelling hides a request rather than withdrawing it and the write still refuses a second filing there. The lower bound is the write''s own past-session bound. Behind get_my_live_substitution_requests (the web, for auth.uid()) and get_live_substitution_requests_for_discord_user (the Discord bot, for the linked gedu); makes no role test of its own. Granted to nobody.';

REVOKE ALL ON FUNCTION public.gedu_live_substitution_requests(p_gedu_id uuid) FROM PUBLIC;
