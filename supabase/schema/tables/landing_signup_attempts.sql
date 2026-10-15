--
-- Name: landing_signup_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_signup_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_key text NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT landing_signup_attempts_client_key_shape CHECK ((client_key ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: TABLE landing_signup_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.landing_signup_attempts IS 'One row per landing page email sign-up the sign-up route accepted, written only by take_landing_signup_allowance and kept only to be counted: the client key is a sha256 of the address the request came from, and nothing about the person signing up is stored. Rows older than an hour are pruned by the same function.';


--
-- Name: landing_signup_attempts landing_signup_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_signup_attempts
    ADD CONSTRAINT landing_signup_attempts_pkey PRIMARY KEY (id);


--
-- Name: idx_landing_signup_attempts_key_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_signup_attempts_key_time ON public.landing_signup_attempts USING btree (client_key, attempted_at DESC);


--
-- Name: idx_landing_signup_attempts_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_signup_attempts_time ON public.landing_signup_attempts USING btree (attempted_at);


--
-- Name: landing_signup_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_signup_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE landing_signup_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.landing_signup_attempts TO service_role;


