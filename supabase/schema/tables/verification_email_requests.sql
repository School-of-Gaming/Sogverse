--
-- Name: verification_email_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_email_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE verification_email_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.verification_email_requests IS 'One row per verification-email send, written only by request_my_verification_email. The rows exist to be counted and nothing else: they protect the shared Brevo quota (whose exhaustion would degrade password-reset delivery) from a button any signed-in caller may press. The RPC prunes the caller''s rows older than an hour as it goes, so the table stays proportional to recent activity with no scheduled job behind it.';


--
-- Name: verification_email_requests verification_email_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_email_requests
    ADD CONSTRAINT verification_email_requests_pkey PRIMARY KEY (id);


--
-- Name: idx_verification_email_requests_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_verification_email_requests_user_created ON public.verification_email_requests USING btree (user_id, created_at DESC);


--
-- Name: verification_email_requests verification_email_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_email_requests
    ADD CONSTRAINT verification_email_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: verification_email_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.verification_email_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE verification_email_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.verification_email_requests TO service_role;


