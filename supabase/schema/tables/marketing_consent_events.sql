--
-- Name: marketing_consent_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_consent_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    consent_type public.marketing_consent_type NOT NULL,
    granted boolean NOT NULL,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_marketing_consent_events_source CHECK ((source = ANY (ARRAY['registration'::text, 'settings'::text, 'enrolment'::text])))
);


--
-- Name: TABLE marketing_consent_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_consent_events IS 'APPEND-ONLY history: one row per CHANGE to a marketing consent, and the evidence behind whatever marketing_consents currently says. Nothing updates or deletes a row here — no Data API role holds any write grant at all, and the only writers are set_marketing_consent and the register route''s service-role client — because an event is a statement that something happened at an instant, and editing one would destroy the only thing the table is for. A repeat submission that changes nothing appends nothing: a log of "changes" that recorded non-changes would answer "how often did this parent change their mind" with a number made of page loads. Rows carry NO unique constraint — granting, revoking and granting again is the ordinary life of a revocable consent, and those three rows are history rather than duplicates.';


--
-- Name: COLUMN marketing_consent_events.granted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_consent_events.granted IS 'The state that was SET by this event, not the delta. Reading the log as a sequence of states is what makes a row meaningful on its own, and it is what lets the current-state table be reconstructed from the log if it ever has to be audited against it.';


--
-- Name: COLUMN marketing_consent_events.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_consent_events.source IS 'Which surface the answer came from: `registration` (the checkbox on the parent sign-up form), `settings` (the toggle on their own account page), or `enrolment` (the ask inside a product signup panel). This is the one field on an event that no other field can corroborate, which is why set_marketing_consent REFUSES `registration`: that source is written only by the register route through the service-role client, before the account has a session at all, so a value a client could send would be a provenance claim nothing checks. A CHECK rather than an enum because the set is a list of our own surfaces, which move with the product rather than with the data model.';


--
-- Name: COLUMN marketing_consent_events.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_consent_events.created_at IS 'When the answer was given, stamped by the server. A client never supplies it — a timestamp the consenting party chooses proves nothing about when they consented.';


--
-- Name: marketing_consent_events marketing_consent_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_consent_events
    ADD CONSTRAINT marketing_consent_events_pkey PRIMARY KEY (id);


--
-- Name: idx_marketing_consent_events_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_consent_events_customer ON public.marketing_consent_events USING btree (customer_id);


--
-- Name: marketing_consent_events marketing_consent_events_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_consent_events
    ADD CONSTRAINT marketing_consent_events_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: marketing_consent_events admins_read_marketing_consent_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_marketing_consent_events ON public.marketing_consent_events FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: marketing_consent_events customers_read_own_marketing_consent_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_own_marketing_consent_events ON public.marketing_consent_events FOR SELECT TO authenticated USING ((customer_id = ( SELECT auth.uid() AS uid)));


--
-- Name: marketing_consent_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_consent_events ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE marketing_consent_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.marketing_consent_events TO authenticated;
GRANT ALL ON TABLE public.marketing_consent_events TO service_role;


