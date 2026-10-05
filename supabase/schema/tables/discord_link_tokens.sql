--
-- Name: discord_link_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discord_link_tokens (
    token_hash text NOT NULL,
    discord_user_id text NOT NULL,
    discord_username text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT discord_link_tokens_discord_user_id_check CHECK ((discord_user_id ~ '^[1-9][0-9]{0,19}$'::text)),
    CONSTRAINT discord_link_tokens_discord_username_check CHECK (((discord_username = btrim(discord_username)) AND ((char_length(discord_username) >= 1) AND (char_length(discord_username) <= 64)))),
    CONSTRAINT discord_link_tokens_token_hash_is_a_hash CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: TABLE discord_link_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.discord_link_tokens IS 'One-time tokens the Discord bot mints for its /link command, each bound to the Discord user who ran it. Only the SHA-256 of the token is stored (lowercase hex); the raw token travels in the URL the bot replies with. Inserted by the bot''s webhook as the service role, consumed by consume_discord_link_token; no grant at all for anon or authenticated. Expired rows are swept on every insert and on every successful link.';


--
-- Name: COLUMN discord_link_tokens.token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discord_link_tokens.token_hash IS 'The SHA-256 of the raw token, as 64 lowercase hex characters: encode(extensions.digest(token, ''sha256''), ''hex'') in SQL, createHash(''sha256'').digest(''hex'') in Node.';


--
-- Name: COLUMN discord_link_tokens.discord_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discord_link_tokens.discord_user_id IS 'The Discord user id (a snowflake, as decimal text) from the signed interaction that minted the token.';


--
-- Name: COLUMN discord_link_tokens.discord_username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discord_link_tokens.discord_username IS 'The Discord username at the time the token was minted, shown on the confirmation page and copied onto the link.';


--
-- Name: COLUMN discord_link_tokens.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discord_link_tokens.expires_at IS 'When the token stops being accepted: ten minutes after it was minted unless the inserter says otherwise.';


--
-- Name: discord_link_tokens discord_link_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discord_link_tokens
    ADD CONSTRAINT discord_link_tokens_pkey PRIMARY KEY (token_hash);


--
-- Name: discord_link_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX discord_link_tokens_expires_at_idx ON public.discord_link_tokens USING btree (expires_at);


--
-- Name: discord_link_tokens discord_link_tokens_sweep_expired; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER discord_link_tokens_sweep_expired BEFORE INSERT ON public.discord_link_tokens FOR EACH STATEMENT EXECUTE FUNCTION public.sweep_expired_discord_link_tokens();


--
-- Name: discord_link_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discord_link_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE discord_link_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.discord_link_tokens TO service_role;


