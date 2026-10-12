--
-- Name: slack_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.slack_links (
    profile_id uuid NOT NULL,
    slack_user_id text NOT NULL,
    slack_team_id text NOT NULL,
    slack_username text NOT NULL,
    linked_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT slack_links_slack_team_id_check CHECK ((slack_team_id ~ '^[A-Z0-9]{1,32}$'::text)),
    CONSTRAINT slack_links_slack_user_id_check CHECK ((slack_user_id ~ '^[A-Z0-9]{1,32}$'::text)),
    CONSTRAINT slack_links_slack_username_check CHECK (((slack_username = btrim(slack_username)) AND ((char_length(slack_username) >= 1) AND (char_length(slack_username) <= 80))))
);


--
-- Name: TABLE slack_links; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.slack_links IS 'An admin''s linked Slack account, at most one per profile, which is what lets an admin act from Slack — approving an offer with the Accept button. A Slack user may be linked to several profiles. Written only by consume_slack_link_token, where linking again replaces the profile''s previous link; there is no unlink. authenticated holds SELECT alone: the owner reads their own row, an admin reads every row.';


--
-- Name: COLUMN slack_links.slack_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slack_links.slack_user_id IS 'The Slack user id, taken from a token the Slack app minted for a signed request. Not unique: one person may link several Sogverse accounts.';


--
-- Name: COLUMN slack_links.slack_team_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slack_links.slack_team_id IS 'The Slack workspace the linking request came from.';


--
-- Name: COLUMN slack_links.slack_username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slack_links.slack_username IS 'The Slack username as it was when the profile was last linked. Not kept in sync with Slack.';


--
-- Name: COLUMN slack_links.linked_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.slack_links.linked_at IS 'When the profile was last linked: replaced on every re-link.';


--
-- Name: slack_links slack_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slack_links
    ADD CONSTRAINT slack_links_pkey PRIMARY KEY (profile_id);


--
-- Name: slack_links_slack_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX slack_links_slack_user_id_idx ON public.slack_links USING btree (slack_user_id);


--
-- Name: slack_links slack_links_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.slack_links
    ADD CONSTRAINT slack_links_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: slack_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.slack_links ENABLE ROW LEVEL SECURITY;

--
-- Name: slack_links slack_links_owner_or_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY slack_links_owner_or_admin_read ON public.slack_links FOR SELECT TO authenticated USING (((profile_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));


--
-- Name: TABLE slack_links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.slack_links TO authenticated;
GRANT ALL ON TABLE public.slack_links TO service_role;


