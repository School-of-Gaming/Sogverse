--
-- Name: session_substitution_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_substitution_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    gedu_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE session_substitution_offers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.session_substitution_offers IS '"Offer to substitute" — one row per (request, offering gedu). Offering is idempotent on the unique key and WITHDRAWING AN OFFER DELETES THE ROW, because an offer nobody accepted is not a fact worth keeping. Approving one offer does not touch the others: "not selected" is DERIVED from the request being substituted by somebody else, and which offer was approved is the substituting gedu''s own row — which is why there is no approved_offer_id anywhere. Offerers never learn who else offered; only the admin queue reads this table, and it reads it through get_admin_substitution_requests. No updated_at and no trigger: a row is created and deleted, never edited. Nothing is granted to `authenticated` or `anon`.';


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


