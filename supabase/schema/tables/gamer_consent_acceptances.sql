--
-- Name: gamer_consent_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gamer_consent_acceptances (
    gamer_id uuid NOT NULL,
    document_slug text NOT NULL,
    document_version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_by uuid NOT NULL
);


--
-- Name: TABLE gamer_consent_acceptances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gamer_consent_acceptances IS 'One row per (gamer, document VERSION) an adult has accepted ABOUT THAT CHILD — the third subject in the 00210 consent system, beside consent_acceptances (per enrolment) and account_consent_acceptances (per account). What it exists for is the guardian declaration: the statement that this specific child is the adult''s own or that the adult is their legal guardian, made at the moment the child''s account is created and recorded against the wording that was on screen. An account-level declaration could not answer that, because an account that adds a second child later never said anything about the second one. NEVER REVOKED — a row is a statement that something was declared at an instant, and a statement about the past cannot be un-made, so there is no revoked_at column and there must never be one (the revocable photo consents are 00244 and are a separate system). INSERT-ONLY BY INTENT, and written from one place: neither `authenticated` nor `anon` holds any write grant, so no browser session can write a row by any path — they hold SELECT, gated by the two policies to a linked parent and to admins. `service_role` holds the usual full set, as it does on every table here, and create_gamer — service_role only — is the sole intended writer, which is what makes the declaration and the child arrive in one transaction or not at all.';


--
-- Name: COLUMN gamer_consent_acceptances.gamer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_consent_acceptances.gamer_id IS 'The child the declaration is ABOUT, keyed to gamer_profiles rather than to profiles so the foreign key itself says the subject is a gamer. ON DELETE CASCADE: a declaration of guardianship over somebody who no longer has an account governs nothing.';


--
-- Name: COLUMN gamer_consent_acceptances.document_slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_consent_acceptances.document_slug IS 'Which document, never which revision of it — the stable identity in consent_documents.slug. A column rather than a hardcoded assumption that every row is the guardian declaration: a second thing an adult may one day have to state about one child is a new slug here, not a new table.';


--
-- Name: COLUMN gamer_consent_acceptances.document_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_consent_acceptances.document_version IS 'The version that was CURRENT for this slug at the moment of the declaration, resolved server-side and never supplied by a caller. Part of the primary key, so a later revision is a fresh row rather than an overwrite.';


--
-- Name: COLUMN gamer_consent_acceptances.accepted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_consent_acceptances.accepted_at IS 'When the declaration was recorded, stamped by the server. A client never supplies it — a timestamp the declaring party chooses proves nothing about when they declared.';


--
-- Name: COLUMN gamer_consent_acceptances.accepted_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gamer_consent_acceptances.accepted_by IS 'The adult who made the statement — the parent creating the child, taken from create_gamer''s parent argument and never from anything a browser sent. A different question from gamer_id, which names who the statement is about, and the reason the pair is worth storing: a child linked to two adults carries the declaration of the one who actually made it. No cascade on the FK, matching consent_acceptances.accepted_by: the profile that made a legal record is part of it, so it cannot be hard-deleted while the record stands.';


--
-- Name: gamer_consent_acceptances gamer_consent_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_consent_acceptances
    ADD CONSTRAINT gamer_consent_acceptances_pkey PRIMARY KEY (gamer_id, document_slug, document_version);


--
-- Name: gamer_consent_acceptances gamer_consent_acceptances_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_consent_acceptances
    ADD CONSTRAINT gamer_consent_acceptances_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.profiles(id);


--
-- Name: gamer_consent_acceptances gamer_consent_acceptances_document_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_consent_acceptances
    ADD CONSTRAINT gamer_consent_acceptances_document_fkey FOREIGN KEY (document_slug, document_version) REFERENCES public.consent_document_versions(document_slug, version);


--
-- Name: gamer_consent_acceptances gamer_consent_acceptances_gamer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gamer_consent_acceptances
    ADD CONSTRAINT gamer_consent_acceptances_gamer_id_fkey FOREIGN KEY (gamer_id) REFERENCES public.gamer_profiles(user_id) ON DELETE CASCADE;


--
-- Name: gamer_consent_acceptances admins_read_gamer_consent_acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_gamer_consent_acceptances ON public.gamer_consent_acceptances FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: gamer_consent_acceptances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gamer_consent_acceptances ENABLE ROW LEVEL SECURITY;

--
-- Name: gamer_consent_acceptances parents_read_gamer_consent_acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY parents_read_gamer_consent_acceptances ON public.gamer_consent_acceptances FOR SELECT TO authenticated USING (public.is_parent_of(gamer_id));


--
-- Name: TABLE gamer_consent_acceptances; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gamer_consent_acceptances TO authenticated;
GRANT ALL ON TABLE public.gamer_consent_acceptances TO service_role;


