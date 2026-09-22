--
-- Name: roblox_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roblox_accounts (
    user_id uuid NOT NULL,
    roblox_username text,
    roblox_user_id bigint
);


--
-- Name: TABLE roblox_accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.roblox_accounts IS 'One row per Sogverse account that has given a Roblox handle. Mirrors minecraft_accounts: the row key IS the profile, unlinking clears the columns rather than deleting the row, and two accounts may hold the same Roblox account (siblings share).';


--
-- Name: COLUMN roblox_accounts.roblox_username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roblox_accounts.roblox_username IS 'The handle as Roblox spells it when a lookup confirmed one, or as the person typed it when no lookup could. Never rejected for being taken: a shared account is legitimate.';


--
-- Name: COLUMN roblox_accounts.roblox_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.roblox_accounts.roblox_user_id IS 'Roblox''s int64 account id, present only when a lookup confirmed the account — its presence is the whole of "verified". Deliberately NOT unique: siblings sharing one Roblox account across two Sogverse accounts is supported, exactly as it is for Minecraft.';


--
-- Name: roblox_accounts roblox_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roblox_accounts
    ADD CONSTRAINT roblox_accounts_pkey PRIMARY KEY (user_id);


--
-- Name: roblox_accounts roblox_accounts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roblox_accounts
    ADD CONSTRAINT roblox_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: roblox_accounts admin_full_access_roblox_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_roblox_accounts ON public.roblox_accounts TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: roblox_accounts parents_read_linked_gamer_roblox; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parents_read_linked_gamer_roblox ON public.roblox_accounts FOR SELECT TO authenticated USING (public.is_parent_of(user_id));


--
-- Name: roblox_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roblox_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: roblox_accounts users_insert_own_roblox_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_own_roblox_account ON public.roblox_accounts FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: roblox_accounts users_read_own_roblox_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_roblox_account ON public.roblox_accounts FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: roblox_accounts users_update_own_roblox_account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own_roblox_account ON public.roblox_accounts FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: TABLE roblox_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.roblox_accounts TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.roblox_accounts TO authenticated;


