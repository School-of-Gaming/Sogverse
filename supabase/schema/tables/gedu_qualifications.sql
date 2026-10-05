--
-- Name: gedu_qualifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gedu_qualifications (
    gedu_id uuid NOT NULL,
    qualification public.gedu_qualification NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    granted_by uuid
);


--
-- Name: TABLE gedu_qualifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gedu_qualifications IS 'The qualifications each game educator holds: a row means the gedu holds that qualification, and no row means they do not. Latest state only, with no history: revoking a qualification deletes its row. Keyed to gedu_profiles, so only an account carrying the gedu extension row can hold one, and the qualifications go with that row. Written only by set_gedu_qualification; authenticated holds SELECT alone, an admin reading every row and a gedu their own. Gates nothing.';


--
-- Name: COLUMN gedu_qualifications.granted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_qualifications.granted_at IS 'When the qualification was first granted, stamped server-side by set_gedu_qualification. Granting a qualification the gedu already holds keeps this moment.';


--
-- Name: COLUMN gedu_qualifications.granted_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_qualifications.granted_by IS 'The admin who granted the qualification, stamped server-side by set_gedu_qualification from the calling session. ON DELETE SET NULL: a departed admin leaves the qualification held without the name.';


--
-- Name: gedu_qualifications gedu_qualifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_qualifications
    ADD CONSTRAINT gedu_qualifications_pkey PRIMARY KEY (gedu_id, qualification);


--
-- Name: gedu_qualifications gedu_qualifications_gedu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_qualifications
    ADD CONSTRAINT gedu_qualifications_gedu_id_fkey FOREIGN KEY (gedu_id) REFERENCES public.gedu_profiles(user_id) ON DELETE CASCADE;


--
-- Name: gedu_qualifications gedu_qualifications_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_qualifications
    ADD CONSTRAINT gedu_qualifications_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gedu_qualifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gedu_qualifications ENABLE ROW LEVEL SECURITY;

--
-- Name: gedu_qualifications gedu_qualifications_owner_or_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedu_qualifications_owner_or_admin_read ON public.gedu_qualifications FOR SELECT TO authenticated USING (((gedu_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.is_admin() AS is_admin)));


--
-- Name: TABLE gedu_qualifications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gedu_qualifications TO authenticated;
GRANT ALL ON TABLE public.gedu_qualifications TO service_role;


