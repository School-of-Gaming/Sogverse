-- Staff link their Discord account.
--
-- WHAT THIS ADDS
--
-- An admin or a Gedu links their Discord account to their Sogverse account, so
-- that staff can later be messaged through Discord. Sign-in is untouched: a
-- link is a record of who someone is on Discord, never a way in.
--
-- 1. `discord_link_tokens` — the one-time tokens the Discord bot mints when a
--    user runs its `/link` command. The bot's webhook verifies Discord's
--    signature, so the Discord user it binds the token to is trustworthy; the
--    webhook has no Sogverse session and writes the row as the service role.
--    Only the SHA-256 of a token is stored, as lowercase hex. A token lives
--    ten minutes; expired rows are swept on every insert and every successful
--    link, so nothing accumulates without a scheduled job.
-- 2. `discord_links` — one row per linked profile: the Discord user id and
--    username, and when it was linked. A profile holds at most one link, and
--    linking again replaces it. A Discord user may be linked to several
--    profiles — one person can hold a separate admin and Gedu account — so
--    linking never touches any other profile's link. The owner reads their
--    own row; an admin reads every row, for the admin user page.
-- 3. `consume_discord_link_token(text)` — the one writer of `discord_links`:
--    the signed-in admin or Gedu hands over the raw token from the URL, the
--    function hashes it, deletes the pending row, and records the link on the
--    caller's own profile. Refuses every other role with 42501, an unknown or
--    already-used token with P0029 (DISCORD_LINK_TOKEN_NOT_FOUND) and an
--    expired one with P0030 (DISCORD_LINK_TOKEN_EXPIRED).

-- ---------------------------------------------------------------------------
-- 1. The pending tokens
-- ---------------------------------------------------------------------------

CREATE TABLE public.discord_link_tokens (
    token_hash text PRIMARY KEY,
    discord_user_id text NOT NULL,
    discord_username text NOT NULL,
    expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '10 minutes'),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT discord_link_tokens_token_hash_is_a_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT discord_link_tokens_discord_user_id_check CHECK (discord_user_id ~ '^[1-9][0-9]{0,19}$'),
    CONSTRAINT discord_link_tokens_discord_username_check CHECK (
      discord_username = btrim(discord_username)
      AND char_length(discord_username) BETWEEN 1 AND 64)
);

CREATE INDEX discord_link_tokens_expires_at_idx ON public.discord_link_tokens (expires_at);

COMMENT ON TABLE public.discord_link_tokens IS 'One-time tokens the Discord bot mints for its /link command, each bound to the Discord user who ran it. Only the SHA-256 of the token is stored (lowercase hex); the raw token travels in the URL the bot replies with. Inserted by the bot''s webhook as the service role, consumed by consume_discord_link_token; no grant at all for anon or authenticated. Expired rows are swept on every insert and on every successful link.';
COMMENT ON COLUMN public.discord_link_tokens.token_hash IS 'The SHA-256 of the raw token, as 64 lowercase hex characters: encode(extensions.digest(token, ''sha256''), ''hex'') in SQL, createHash(''sha256'').digest(''hex'') in Node.';
COMMENT ON COLUMN public.discord_link_tokens.discord_user_id IS 'The Discord user id (a snowflake, as decimal text) from the signed interaction that minted the token.';
COMMENT ON COLUMN public.discord_link_tokens.discord_username IS 'The Discord username at the time the token was minted, shown on the confirmation page and copied onto the link.';
COMMENT ON COLUMN public.discord_link_tokens.expires_at IS 'When the token stops being accepted: ten minutes after it was minted unless the inserter says otherwise.';

ALTER TABLE public.discord_link_tokens ENABLE ROW LEVEL SECURITY;

-- No policies: authenticated and anon hold no grant, and the service role and
-- the consuming function bypass RLS.
REVOKE ALL ON TABLE public.discord_link_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.discord_link_tokens TO service_role;

-- Sweeps expired tokens before each insert, so the table holds only tokens
-- from the last ten minutes plus whatever has expired since the last insert.
CREATE FUNCTION public.sweep_expired_discord_link_tokens() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  DELETE FROM public.discord_link_tokens WHERE expires_at <= now();
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.sweep_expired_discord_link_tokens() IS 'Statement trigger on discord_link_tokens: deletes every expired token before rows are inserted, which keeps the table small without a scheduled job.';

REVOKE ALL ON FUNCTION public.sweep_expired_discord_link_tokens() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sweep_expired_discord_link_tokens() TO service_role;

CREATE TRIGGER discord_link_tokens_sweep_expired BEFORE INSERT ON public.discord_link_tokens
  FOR EACH STATEMENT EXECUTE FUNCTION public.sweep_expired_discord_link_tokens();

-- ---------------------------------------------------------------------------
-- 2. The links
-- ---------------------------------------------------------------------------

CREATE TABLE public.discord_links (
    profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    discord_user_id text NOT NULL,
    discord_username text NOT NULL,
    linked_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT discord_links_discord_user_id_check CHECK (discord_user_id ~ '^[1-9][0-9]{0,19}$'),
    CONSTRAINT discord_links_discord_username_check CHECK (
      discord_username = btrim(discord_username)
      AND char_length(discord_username) BETWEEN 1 AND 64)
);

CREATE INDEX discord_links_discord_user_id_idx ON public.discord_links (discord_user_id);

COMMENT ON TABLE public.discord_links IS 'An admin''s or a Gedu''s linked Discord account, at most one per profile. A Discord user may be linked to several profiles (one person holding an admin and a Gedu account). Written only by consume_discord_link_token, where linking again replaces the profile''s previous link; there is no unlink. authenticated holds SELECT alone: the owner reads their own row, an admin reads every row.';
COMMENT ON COLUMN public.discord_links.discord_user_id IS 'The Discord user id (a snowflake, as decimal text), taken from a token the bot minted for a signed interaction. Not unique: one person may link several Sogverse accounts.';
COMMENT ON COLUMN public.discord_links.discord_username IS 'The Discord username as it was when the profile was last linked. Not kept in sync with Discord.';
COMMENT ON COLUMN public.discord_links.linked_at IS 'When the profile was last linked: replaced on every re-link.';

ALTER TABLE public.discord_links ENABLE ROW LEVEL SECURITY;

-- The owner reads their own (Settings); an admin reads everyone's (the admin
-- user page). Nobody else reads the table.
CREATE POLICY discord_links_owner_or_admin_read ON public.discord_links
  FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

REVOKE ALL ON TABLE public.discord_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.discord_links TO authenticated;
GRANT ALL ON TABLE public.discord_links TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Consuming a token
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.consume_discord_link_token(p_token text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_token public.discord_link_tokens%ROWTYPE;
BEGIN
  -- An admin or a Gedu; everyone else is refused on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- Deleting first is what makes the token single-use: a concurrent second
  -- call waits on the row lock and then finds nothing. A NULL token hashes to
  -- NULL and matches no row.
  DELETE FROM public.discord_link_tokens t
   WHERE t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  RETURNING t.* INTO v_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DISCORD_LINK_TOKEN_NOT_FOUND' USING ERRCODE = 'P0029';
  END IF;

  -- The raise rolls the delete back, so an expired token keeps answering
  -- "expired" until the next sweep removes it.
  IF v_token.expires_at <= now() THEN
    RAISE EXCEPTION 'DISCORD_LINK_TOKEN_EXPIRED' USING ERRCODE = 'P0030';
  END IF;

  INSERT INTO public.discord_links (profile_id, discord_user_id, discord_username, linked_at)
  VALUES ((SELECT auth.uid()), v_token.discord_user_id, v_token.discord_username, now())
  ON CONFLICT (profile_id) DO UPDATE
     SET discord_user_id = EXCLUDED.discord_user_id,
         discord_username = EXCLUDED.discord_username,
         linked_at = EXCLUDED.linked_at;

  DELETE FROM public.discord_link_tokens WHERE expires_at <= now();

  RETURN v_token.discord_username;
END;
$$;

COMMENT ON FUNCTION public.consume_discord_link_token(p_token text) IS 'Links the calling admin''s or Gedu''s profile to the Discord user a /link token was minted for, and returns that Discord username. Takes the raw token and hashes it here (SHA-256, hex). The token is deleted, so it works once; the caller''s previous link, if any, is replaced, and no other profile''s link is touched. Refuses other roles with 42501, a token that is unknown or already used with P0029 (DISCORD_LINK_TOKEN_NOT_FOUND), and an expired one with P0030 (DISCORD_LINK_TOKEN_EXPIRED). SECURITY DEFINER because discord_link_tokens has no authenticated grant and discord_links no authenticated write grant: it is the write boundary for both.';

REVOKE EXECUTE ON FUNCTION public.consume_discord_link_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_discord_link_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_discord_link_token(text) TO service_role;
