--
-- Name: session_substitution_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_substitution_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    gedu_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    response public.substitution_offer_response DEFAULT 'offer'::public.substitution_offer_response NOT NULL,
    responded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE session_substitution_offers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.session_substitution_offers IS 'A gedu''s answer to a substitution request — one row per (request, gedu), carrying `offer` or `decline`. Written only by respond_to_session_substitution, which UPDATES the row when the gedu changes their mind: the two answers switch freely until an admin approves somebody, and a gedu never deletes a row. created_at is when the gedu first answered and responded_at when they last changed it. Approving one offer does not touch the others: "not selected" is DERIVED from the request being substituted by somebody else, and which offer was approved is the substituting gedu''s own row — which is why there is no approved_offer_id anywhere. Only an `offer` row can be approved. Answerers never learn who else answered; only the admin page reads this table, through get_admin_substitution_requests. Nothing is granted to `authenticated` or `anon`.';


--
-- Name: COLUMN session_substitution_offers.response; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session_substitution_offers.response IS 'The gedu''s current answer: `offer` or `decline`.';


--
-- Name: COLUMN session_substitution_offers.responded_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.session_substitution_offers.responded_at IS 'When the gedu last changed their answer (clock_timestamp at the write). The admin page orders offers by it.';


--
-- Name: session_substitution_offers session_substitution_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_substitution_offers
    ADD CONSTRAINT session_substitution_offers_pkey PRIMARY KEY (id);


--
-- Name: session_substitution_offers session_substitution_offers_request_id_gedu_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_substitution_offers
    ADD CONSTRAINT session_substitution_offers_request_id_gedu_id_key UNIQUE (request_id, gedu_id);


--
-- Name: session_substitution_offers session_substitution_offers_gedu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_substitution_offers
    ADD CONSTRAINT session_substitution_offers_gedu_id_fkey FOREIGN KEY (gedu_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: session_substitution_offers session_substitution_offers_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_substitution_offers
    ADD CONSTRAINT session_substitution_offers_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.session_substitution_requests(id) ON DELETE CASCADE;


--
-- Name: session_substitution_offers admin_full_access_session_substitution_offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_session_substitution_offers ON public.session_substitution_offers TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: session_substitution_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_substitution_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE session_substitution_offers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.session_substitution_offers TO service_role;


