--
-- Name: gamer_photo_consent_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gamer_photo_consent_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gamer_id uuid NOT NULL,
    consent_type public.gamer_photo_consent_type NOT NULL,
    granted boolean NOT NULL,
    source text NOT NULL,
    answered_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_gamer_photo_consent_events_source CHECK ((source = ANY (ARRAY['settings'::text, 'enrolment'::text])))
);


--
-- Name: TABLE gamer_photo_consent_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gamer_photo_consent_events IS 'APPEND-ONLY history: one row per CHANGE to a gamer photo consent, and the evidence behind whatever gamer_photo_consents currently says. Nothing updates or deletes a row here — no Data API role holds any write grant at all, and the only writer is set_gamer_photo_consent — because an event is a statement that something happened at an instant, and editing one would destroy the only thing the table is for. A repeat submission that changes nothing appends nothing, exactly as in marketing_consent_events. Rows carry NO unique constraint: granting, revoking and granting again is the ordinary life of a revocable consent, and those three rows are history rather than duplicates. Readable by ADMINS ALONE, which is narrower than the state table beside it — a gedu needs today''s answer to decide whether to raise a camera, and has no business in the history of a family''s deliberations.';


--
-- Name: COLUMN gamer_photo_consent_events.gamer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_photo_consent_events.gamer_id IS 'The child the answer is ABOUT. Distinct from answered_by, which is the adult who gave it — the one column marketing_consent_events did not need, because there the subject and the answerer are the same person.';


--
-- Name: COLUMN gamer_photo_consent_events.granted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_photo_consent_events.granted IS 'The state that was SET by this event, not the delta. Reading the log as a sequence of states is what makes a row meaningful on its own, and it is what lets the current-state table be reconstructed from the log if it ever has to be audited against it.';


--
-- Name: COLUMN gamer_photo_consent_events.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_photo_consent_events.source IS 'Which surface the answer came from: `settings` (the card on the gamer''s page under the parent''s My SOG) or `enrolment` (the ask inside a product signup panel). There is deliberately NO `registration` value, which is the one place this CHECK differs from marketing_consent_events'': that source exists because a parent ticks a marketing box before their account exists, and no gamer exists at that moment for a photo consent to be about. A CHECK rather than an enum because the set is a list of our own surfaces, which move with the product rather than with the data model.';


--
-- Name: COLUMN gamer_photo_consent_events.answered_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_photo_consent_events.answered_by IS 'The adult who gave this answer, taken from auth.uid() inside the RPC and never accepted from a caller. This is the provenance the marketing twin did not need: there the subject column already said who spoke, and here the subject is a child who cannot answer for themselves, so "which parent decided this" is exactly what a safeguarding review asks. Nullable and ON DELETE SET NULL rather than cascading: the answer belongs to the CHILD, and a parent closing their account must not delete it. NULL therefore means "the account that answered has since been removed" and never "unknown at the time" — every write supplies it.';


--
-- Name: COLUMN gamer_photo_consent_events.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_photo_consent_events.created_at IS 'When the answer was given, stamped by the server. A client never supplies it — a timestamp the consenting party chooses proves nothing about when they consented.';


--
-- Name: gamer_photo_consent_events gamer_photo_consent_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_photo_consent_events
    ADD CONSTRAINT gamer_photo_consent_events_pkey PRIMARY KEY (id);


--
-- Name: idx_gamer_photo_consent_events_gamer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gamer_photo_consent_events_gamer ON public.gamer_photo_consent_events USING btree (gamer_id);


--
-- Name: gamer_photo_consent_events gamer_photo_consent_events_answered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_photo_consent_events
    ADD CONSTRAINT gamer_photo_consent_events_answered_by_fkey FOREIGN KEY (answered_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: gamer_photo_consent_events gamer_photo_consent_events_gamer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_photo_consent_events
    ADD CONSTRAINT gamer_photo_consent_events_gamer_id_fkey FOREIGN KEY (gamer_id) REFERENCES public.gamer_profiles(user_id) ON DELETE CASCADE;


--
-- Name: gamer_photo_consent_events admins_read_gamer_photo_consent_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_gamer_photo_consent_events ON public.gamer_photo_consent_events FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: gamer_photo_consent_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gamer_photo_consent_events ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE gamer_photo_consent_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gamer_photo_consent_events TO authenticated;
GRANT ALL ON TABLE public.gamer_photo_consent_events TO service_role;


