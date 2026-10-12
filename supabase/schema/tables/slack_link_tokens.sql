--
-- Name: slack_link_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.slack_link_tokens (
    token_hash text NOT NULL,
    slack_user_id text NOT NULL,
    slack_team_id text NOT NULL,
    slack_username text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT slack_link_tokens_slack_team_id_check CHECK ((slack_team_id ~ '^[A-Z0-9]{1,32}$'::text)),
    CONSTRAINT slack_link_tokens_slack_user_id_check CHECK ((slack_user_id ~ '^[A-Z0-9]{1,32}$'::text)),
    CONSTRAINT slack_link_tokens_slack_username_check CHECK (((slack_username = btrim(slack_username)) AND ((char_length(slack_username) >= 1) AND (char_length(slack_username) <= 80)))),
    CONSTRAINT slack_link_tokens_token_hash_is_a_hash CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: TABLE slack_link_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.slack_link_tokens IS 'One-time tokens the Slack app mints for its link command, each bound to the Slack user who ran it. Only the SHA-256 of the token is stored (lowercase hex); the raw token travels in the URL the app replies with. Inserted by the Slack webhook as the service role, consumed by consume_slack_link_token; no grant at all for anon or authenticated. Expired rows are swept on every insert and on every successful link.';


--
-- Name: COLUMN slack_link_tokens.token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slack_link_tokens.token_hash IS 'The SHA-256 of the raw token, as 64 lowercase hex characters: encode(extensions.digest(token, ''sha256''), ''hex'') in SQL, createHash(''sha256'').digest(''hex'') in Node.';


--
-- Name: COLUMN slack_link_tokens.slack_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slack_link_tokens.slack_user_id IS 'The Slack user id (uppercase letters and digits) from the signed request that minted the token.';


--
-- Name: COLUMN slack_link_tokens.slack_team_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slack_link_tokens.slack_team_id IS 'The Slack workspace id from the signed request that minted the token.';


--
-- Name: COLUMN slack_link_tokens.slack_username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slack_link_tokens.slack_username IS 'The Slack username at the time the token was minted, shown on the confirmation page and copied onto the link.';


--
-- Name: COLUMN slack_link_tokens.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slack_link_tokens.expires_at IS 'When the token stops being accepted: ten minutes after it was minted unless the inserter says otherwise.';


--
-- Name: slack_link_tokens slack_link_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slack_link_tokens
    ADD CONSTRAINT slack_link_tokens_pkey PRIMARY KEY (token_hash);


--
-- Name: slack_link_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX slack_link_tokens_expires_at_idx ON public.slack_link_tokens USING btree (expires_at);


--
-- Name: slack_link_tokens slack_link_tokens_sweep_expired; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER slack_link_tokens_sweep_expired BEFORE INSERT ON public.slack_link_tokens FOR EACH STATEMENT EXECUTE FUNCTION public.sweep_expired_slack_link_tokens();


--
-- Name: slack_link_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.slack_link_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE slack_link_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.slack_link_tokens TO service_role;


