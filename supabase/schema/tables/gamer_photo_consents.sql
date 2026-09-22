--
-- Name: gamer_photo_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gamer_photo_consents (
    gamer_id uuid NOT NULL,
    consent_type public.gamer_photo_consent_type NOT NULL,
    granted boolean NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE gamer_photo_consents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gamer_photo_consents IS 'The CURRENT answer to "may this child be photographed for this partner" — one row per (gamer, consent type), and the row a gedu reads before a shutter opens. The twin of marketing_consents (00220) with the subject changed from an adult''s mailbox to a child''s image, which is why it is keyed on the GAMER and not on the answering parent: two parents linked to one child are answering one question about one child, and a per-parent key would let them hold two answers with no rule for which one a photographer obeys. An ABSENT row and `granted = false` are treated identically by every surface — never asked and asked-and-declined both mean the child stays out of the photo — and the distinction survives only in the event log, where it is the difference between a decision and a silence. Deliberately not derived from gamer_photo_consent_events: a check made at the moment of taking a photograph must not fold a history, and the present tense must not depend on a log a retention policy could one day trim. REVOCABLE by construction, which is what keeps it out of the non-revocable enrolment-condition system 00210 built. Written by set_gamer_photo_consent and by nothing else: no Data API role holds a write grant.';


--
-- Name: COLUMN gamer_photo_consents.gamer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_photo_consents.gamer_id IS 'The child the permission is ABOUT, keyed to gamer_profiles rather than to profiles so the foreign key itself says the subject is a gamer — an adult holding a seat on a product whose audience admits adults has no row here, and cannot: a gamer consent cannot apply to an adult, and the enrolment panel does not put the question when the participant is the parent. ON DELETE CASCADE: a permission to photograph somebody who no longer has an account governs an act that can no longer happen, and the audit trail cascades with it for the same reason.';


--
-- Name: COLUMN gamer_photo_consents.granted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_photo_consents.granted IS 'True means photographs of this child may be taken and used for the named partner; false means the parent said no. NOT NULL and no third state — "not asked" is the absence of the row, so a NULL here would be a second spelling of a state the primary key already expresses by omission.';


--
-- Name: COLUMN gamer_photo_consents.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_photo_consents.updated_at IS 'When this state was last CHANGED, stamped server-side. Not a call counter: set_gamer_photo_consent leaves the row untouched when the submitted state already matches, so this is the moment the parent last actually changed their mind. The full history is in gamer_photo_consent_events.';


--
-- Name: gamer_photo_consents gamer_photo_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_photo_consents
    ADD CONSTRAINT gamer_photo_consents_pkey PRIMARY KEY (gamer_id, consent_type);


--
-- Name: gamer_photo_consents gamer_photo_consents_gamer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_photo_consents
    ADD CONSTRAINT gamer_photo_consents_gamer_id_fkey FOREIGN KEY (gamer_id) REFERENCES public.gamer_profiles(user_id) ON DELETE CASCADE;


--
-- Name: gamer_photo_consents admins_read_gamer_photo_consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_gamer_photo_consents ON public.gamer_photo_consents FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: gamer_photo_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gamer_photo_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: gamer_photo_consents gamers_read_own_photo_consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gamers_read_own_photo_consents ON public.gamer_photo_consents FOR SELECT TO authenticated USING ((gamer_id = ( SELECT auth.uid() AS uid)));


--
-- Name: gamer_photo_consents gedus_read_roster_gamer_photo_consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedus_read_roster_gamer_photo_consents ON public.gamer_photo_consents FOR SELECT TO authenticated USING (public.gedu_teaches_gamer(gamer_id));


--
-- Name: gamer_photo_consents parents_read_gamer_photo_consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parents_read_gamer_photo_consents ON public.gamer_photo_consents FOR SELECT TO authenticated USING (public.is_parent_of(gamer_id));


--
-- Name: TABLE gamer_photo_consents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gamer_photo_consents TO authenticated;
GRANT ALL ON TABLE public.gamer_photo_consents TO service_role;


