--
-- Name: parent_gamer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parent_gamer (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid NOT NULL,
    gamer_id uuid NOT NULL,
    relationship text DEFAULT 'parent'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT no_self_link CHECK ((parent_id <> gamer_id))
);


--
-- Name: parent_gamer parent_gamer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_gamer
    ADD CONSTRAINT parent_gamer_pkey PRIMARY KEY (id);


--
-- Name: parent_gamer unique_parent_gamer; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_gamer
    ADD CONSTRAINT unique_parent_gamer UNIQUE (parent_id, gamer_id);


--
-- Name: idx_parent_gamer_gamer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parent_gamer_gamer ON public.parent_gamer USING btree (gamer_id);


--
-- Name: idx_parent_gamer_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parent_gamer_parent ON public.parent_gamer USING btree (parent_id);


--
-- Name: parent_gamer on_parent_gamer_deleted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_parent_gamer_deleted AFTER DELETE ON public.parent_gamer FOR EACH ROW EXECUTE FUNCTION public.handle_orphaned_gamer();


--
-- Name: parent_gamer validate_parent_gamer_on_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER validate_parent_gamer_on_insert BEFORE INSERT ON public.parent_gamer FOR EACH ROW EXECUTE FUNCTION public.validate_parent_gamer_roles();


--
-- Name: parent_gamer parent_gamer_gamer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_gamer
    ADD CONSTRAINT parent_gamer_gamer_id_fkey FOREIGN KEY (gamer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: parent_gamer parent_gamer_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_gamer
    ADD CONSTRAINT parent_gamer_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: parent_gamer admin_full_access_parent_gamer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_parent_gamer ON public.parent_gamer TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: parent_gamer customers_delete_own_links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_delete_own_links ON public.parent_gamer FOR DELETE TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (parent_id = ( SELECT auth.uid() AS uid))));


--
-- Name: parent_gamer customers_view_own_links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_view_own_links ON public.parent_gamer FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (parent_id = ( SELECT auth.uid() AS uid))));


--
-- Name: parent_gamer gamers_view_parent_links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gamers_view_parent_links ON public.parent_gamer FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'gamer'::public.user_role) AND (gamer_id = ( SELECT auth.uid() AS uid))));


--
-- Name: parent_gamer; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parent_gamer ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE parent_gamer; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.parent_gamer TO anon;
GRANT ALL ON TABLE public.parent_gamer TO service_role;
GRANT SELECT,DELETE ON TABLE public.parent_gamer TO authenticated;


