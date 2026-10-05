--
-- Name: gedu_badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gedu_badges (
    gedu_id uuid NOT NULL,
    badge public.gedu_badge NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    granted_by uuid
);


--
-- Name: TABLE gedu_badges; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gedu_badges IS 'The badges each game educator holds: a row means the gedu holds that badge, and no row means they do not. Latest state only, with no history: revoking a badge deletes its row. Keyed to gedu_profiles, so only an account carrying the gedu extension row can hold one, and the badges go with that row. Written only by set_gedu_badge; authenticated holds SELECT alone, an admin reading every row and a gedu their own. Gates nothing.';


--
-- Name: COLUMN gedu_badges.granted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_badges.granted_at IS 'When the badge was first granted, stamped server-side by set_gedu_badge. Granting a badge the gedu already holds keeps this moment.';


--
-- Name: COLUMN gedu_badges.granted_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_badges.granted_by IS 'The admin who granted the badge, stamped server-side by set_gedu_badge from the calling session. ON DELETE SET NULL: a departed admin leaves the badge held without the name.';


--
-- Name: gedu_badges gedu_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_badges
    ADD CONSTRAINT gedu_badges_pkey PRIMARY KEY (gedu_id, badge);


--
-- Name: gedu_badges gedu_badges_gedu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_badges
    ADD CONSTRAINT gedu_badges_gedu_id_fkey FOREIGN KEY (gedu_id) REFERENCES public.gedu_profiles(user_id) ON DELETE CASCADE;


--
-- Name: gedu_badges gedu_badges_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_badges
    ADD CONSTRAINT gedu_badges_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gedu_badges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gedu_badges ENABLE ROW LEVEL SECURITY;

--
-- Name: gedu_badges gedu_badges_owner_or_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedu_badges_owner_or_admin_read ON public.gedu_badges FOR SELECT TO authenticated USING (((gedu_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));


--
-- Name: TABLE gedu_badges; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gedu_badges TO authenticated;
GRANT ALL ON TABLE public.gedu_badges TO service_role;


