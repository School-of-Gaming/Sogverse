--
-- Name: discord_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discord_links (
    profile_id uuid NOT NULL,
    discord_user_id text NOT NULL,
    discord_username text NOT NULL,
    linked_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT discord_links_discord_user_id_check CHECK ((discord_user_id ~ '^[1-9][0-9]{0,19}$'::text)),
    CONSTRAINT discord_links_discord_username_check CHECK (((discord_username = btrim(discord_username)) AND ((char_length(discord_username) >= 1) AND (char_length(discord_username) <= 64))))
);


--
-- Name: TABLE discord_links; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.discord_links IS 'An admin''s or a Gedu''s linked Discord account, at most one per profile. A Discord user may be linked to several profiles (one person holding an admin and a Gedu account). Written only by consume_discord_link_token, where linking again replaces the profile''s previous link; there is no unlink. authenticated holds SELECT alone: the owner reads their own row, an admin reads every row.';


--
-- Name: COLUMN discord_links.discord_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discord_links.discord_user_id IS 'The Discord user id (a snowflake, as decimal text), taken from a token the bot minted for a signed interaction. Not unique: one person may link several Sogverse accounts.';


--
-- Name: COLUMN discord_links.discord_username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discord_links.discord_username IS 'The Discord username as it was when the profile was last linked. Not kept in sync with Discord.';


--
-- Name: COLUMN discord_links.linked_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discord_links.linked_at IS 'When the profile was last linked: replaced on every re-link.';


--
-- Name: discord_links discord_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discord_links
    ADD CONSTRAINT discord_links_pkey PRIMARY KEY (profile_id);


--
-- Name: discord_links_discord_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX discord_links_discord_user_id_idx ON public.discord_links USING btree (discord_user_id);


--
-- Name: discord_links discord_links_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discord_links
    ADD CONSTRAINT discord_links_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: discord_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.discord_links ENABLE ROW LEVEL SECURITY;

--
-- Name: discord_links discord_links_owner_or_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY discord_links_owner_or_admin_read ON public.discord_links FOR SELECT TO authenticated USING (((profile_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));


--
-- Name: TABLE discord_links; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.discord_links TO authenticated;
GRANT ALL ON TABLE public.discord_links TO service_role;


