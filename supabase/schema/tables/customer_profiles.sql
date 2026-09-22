--
-- Name: customer_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_profiles (
    user_id uuid NOT NULL,
    stripe_customer_id text,
    pin_hash text
);


--
-- Name: customer_profiles customer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: customer_profiles customer_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_profiles
    ADD CONSTRAINT customer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: customer_profiles admin_full_access_customer_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_customer_profiles ON public.customer_profiles TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: customer_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_profiles customers_read_own_customer_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_own_customer_profile ON public.customer_profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: TABLE customer_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.customer_profiles TO anon;
GRANT ALL ON TABLE public.customer_profiles TO service_role;
GRANT SELECT ON TABLE public.customer_profiles TO authenticated;


