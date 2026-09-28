--
-- Name: gedu_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gedu_locations (
    gedu_id uuid NOT NULL,
    location_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gedu_locations gedu_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_locations
    ADD CONSTRAINT gedu_locations_pkey PRIMARY KEY (gedu_id, location_id);


--
-- Name: idx_gedu_locations_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gedu_locations_location ON public.gedu_locations USING btree (location_id);


--
-- Name: gedu_locations gedu_locations_gedu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_locations
    ADD CONSTRAINT gedu_locations_gedu_id_fkey FOREIGN KEY (gedu_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: gedu_locations gedu_locations_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_locations
    ADD CONSTRAINT gedu_locations_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;


--
-- Name: gedu_locations admin_manage_gedu_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_manage_gedu_locations ON public.gedu_locations TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: gedu_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gedu_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: gedu_locations gedu_manage_own_locations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedu_manage_own_locations ON public.gedu_locations TO authenticated USING (((gedu_id = ( SELECT auth.uid() AS uid)) AND (( SELECT public.get_user_role() AS get_user_role) = 'gedu'::public.user_role))) WITH CHECK (((gedu_id = ( SELECT auth.uid() AS uid)) AND (( SELECT public.get_user_role() AS get_user_role) = 'gedu'::public.user_role)));


--
-- Name: TABLE gedu_locations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gedu_locations TO anon;
GRANT ALL ON TABLE public.gedu_locations TO service_role;
GRANT SELECT,INSERT,DELETE ON TABLE public.gedu_locations TO authenticated;


