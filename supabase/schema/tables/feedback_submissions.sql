--
-- Name: feedback_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: feedback_submissions feedback_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_submissions
    ADD CONSTRAINT feedback_submissions_pkey PRIMARY KEY (id);


--
-- Name: idx_feedback_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feedback_user_created ON public.feedback_submissions USING btree (user_id, created_at DESC);


--
-- Name: feedback_submissions feedback_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback_submissions
    ADD CONSTRAINT feedback_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: feedback_submissions admin_full_access_feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_feedback ON public.feedback_submissions TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: feedback_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback_submissions users_read_own_feedback; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_feedback ON public.feedback_submissions FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: TABLE feedback_submissions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.feedback_submissions TO anon;
GRANT ALL ON TABLE public.feedback_submissions TO service_role;
GRANT SELECT ON TABLE public.feedback_submissions TO authenticated;


