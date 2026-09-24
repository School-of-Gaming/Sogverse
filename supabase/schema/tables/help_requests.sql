--
-- Name: help_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.help_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: help_requests help_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_requests
    ADD CONSTRAINT help_requests_pkey PRIMARY KEY (id);


--
-- Name: idx_help_requests_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_help_requests_user_created ON public.help_requests USING btree (user_id, created_at DESC);


--
-- Name: help_requests help_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.help_requests
    ADD CONSTRAINT help_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: help_requests admin_full_access_help_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_help_requests ON public.help_requests TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: help_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.help_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: help_requests users_read_own_help_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_help_requests ON public.help_requests FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: TABLE help_requests; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.help_requests TO anon;
GRANT ALL ON TABLE public.help_requests TO service_role;
GRANT SELECT ON TABLE public.help_requests TO authenticated;


