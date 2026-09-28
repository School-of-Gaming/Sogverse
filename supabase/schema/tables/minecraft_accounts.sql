--
-- Name: minecraft_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.minecraft_accounts (
    user_id uuid NOT NULL,
    minecraft_username text,
    minecraft_uuid text
);


--
-- Name: minecraft_accounts minecraft_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.minecraft_accounts
    ADD CONSTRAINT minecraft_accounts_pkey PRIMARY KEY (user_id);


--
-- Name: minecraft_accounts_uuid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX minecraft_accounts_uuid_idx ON public.minecraft_accounts USING btree (minecraft_uuid);


--
-- Name: minecraft_accounts minecraft_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.minecraft_accounts
    ADD CONSTRAINT minecraft_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: minecraft_accounts admin_full_access_minecraft_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_minecraft_accounts ON public.minecraft_accounts TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: minecraft_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.minecraft_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: minecraft_accounts parents_read_linked_gamer_minecraft; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parents_read_linked_gamer_minecraft ON public.minecraft_accounts FOR SELECT TO authenticated USING (public.is_parent_of(user_id));


--
-- Name: minecraft_accounts users_insert_own_minecraft_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_own_minecraft_account ON public.minecraft_accounts FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: minecraft_accounts users_read_own_minecraft_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_minecraft_account ON public.minecraft_accounts FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: minecraft_accounts users_update_own_minecraft_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own_minecraft_account ON public.minecraft_accounts FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: TABLE minecraft_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.minecraft_accounts TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.minecraft_accounts TO authenticated;


