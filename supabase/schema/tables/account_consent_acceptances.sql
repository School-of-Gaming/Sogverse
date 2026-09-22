--
-- Name: account_consent_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_consent_acceptances (
    customer_id uuid NOT NULL,
    document_slug text NOT NULL,
    document_version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE account_consent_acceptances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.account_consent_acceptances IS 'One row per (account, document VERSION) the account holder has accepted — the ACCOUNT-level counterpart of consent_acceptances, which is per enrolment and whose participant_id and product_id are both NOT NULL because a row there conditions one seat. A row here conditions no seat: it is what the person agreed to when they opened the account. Written at registration and NEVER REVOKED — a row is a statement that an agreement happened at an instant, and a statement about the past cannot be un-made, so there is no revoked_at column and there must never be one (the revocable marketing and photo consents are a separate system). The versions live in the consent registry: consent_documents holds the identity, consent_document_versions one row per published revision, and the composite foreign key below is what stops a row naming a text nobody published. A LATER version is a fresh row rather than an edit, because accepting a revision is a new agreement and the old one still happened. INSERT-ONLY and insert-only from ONE place: no Data API role holds a write grant, and record_account_consents — service_role only — is the sole writer.';


--
-- Name: COLUMN account_consent_acceptances.customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_consent_acceptances.customer_id IS 'The adult who agreed, and the account the agreement belongs to. Always a profile whose role is `customer`: the writer refuses anything else, which is the invariant assert_role gives a self-service writer, read off the named profile because no session exists at registration.';


--
-- Name: COLUMN account_consent_acceptances.document_slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_consent_acceptances.document_slug IS 'Which document, never which revision of it — the stable identity in consent_documents.slug. Part of the primary key, so accepting two documents is two rows.';


--
-- Name: COLUMN account_consent_acceptances.document_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_consent_acceptances.document_version IS 'The version that was CURRENT for this slug at the moment of acceptance, resolved server-side and never supplied by a caller. Part of the primary key, which is what makes a replay of the same acceptance idempotent and a later revision a new row rather than an overwrite.';


--
-- Name: COLUMN account_consent_acceptances.accepted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_consent_acceptances.accepted_at IS 'When the agreement was recorded, stamped by the server. A client never supplies it — a timestamp the agreeing party chooses proves nothing about when they agreed.';


--
-- Name: account_consent_acceptances account_consent_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_consent_acceptances
    ADD CONSTRAINT account_consent_acceptances_pkey PRIMARY KEY (customer_id, document_slug, document_version);


--
-- Name: account_consent_acceptances account_consent_acceptances_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_consent_acceptances
    ADD CONSTRAINT account_consent_acceptances_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: account_consent_acceptances account_consent_acceptances_document_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_consent_acceptances
    ADD CONSTRAINT account_consent_acceptances_document_fkey FOREIGN KEY (document_slug, document_version) REFERENCES public.consent_document_versions(document_slug, version);


--
-- Name: account_consent_acceptances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_consent_acceptances ENABLE ROW LEVEL SECURITY;

--
-- Name: account_consent_acceptances admins_read_account_consent_acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_account_consent_acceptances ON public.account_consent_acceptances FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: account_consent_acceptances customers_read_own_account_consent_acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_own_account_consent_acceptances ON public.account_consent_acceptances FOR SELECT TO authenticated USING ((customer_id = ( SELECT auth.uid() AS uid)));


--
-- Name: TABLE account_consent_acceptances; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.account_consent_acceptances TO authenticated;
GRANT ALL ON TABLE public.account_consent_acceptances TO service_role;


