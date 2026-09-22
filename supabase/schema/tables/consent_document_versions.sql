--
-- Name: consent_document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_document_versions (
    document_slug text NOT NULL,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_consent_document_versions_version_not_empty CHECK ((btrim(version) <> ''::text))
);


--
-- Name: TABLE consent_document_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.consent_document_versions IS 'One row per published revision of a consent document. Rows arrive by MIGRATION only — no Data API role holds a write grant — because a version is a document that was published, not a value an app invents. The CURRENT version OF A SLUG is the row with the greatest created_at for that slug, the same derivation gedu_contract_versions uses (00201), and that is the version an enrolment records. Publishing a new revision is therefore one INSERT and touches no product: existing acceptances go on naming the version that was live when they were made, which is the whole point of storing a version rather than a boolean.';


--
-- Name: COLUMN consent_document_versions.document_slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_document_versions.document_slug IS 'Which document this is a revision of. ON DELETE CASCADE only because a slug that is gone has no revisions; nothing deletes one today.';


--
-- Name: COLUMN consent_document_versions.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_document_versions.version IS 'The version label as the published document carries it — the date under "Last updated" on the page a parent reads. The value consent_acceptances stores.';


--
-- Name: COLUMN consent_document_versions.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_document_versions.created_at IS 'When this revision was added to the platform. Ordering key and nothing else: the greatest created_at for a slug IS that document''s current version, which is the one question anything asks of this table.';


--
-- Name: consent_document_versions consent_document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_document_versions
    ADD CONSTRAINT consent_document_versions_pkey PRIMARY KEY (document_slug, version);


--
-- Name: consent_document_versions consent_document_versions_document_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_document_versions
    ADD CONSTRAINT consent_document_versions_document_slug_fkey FOREIGN KEY (document_slug) REFERENCES public.consent_documents(slug) ON DELETE CASCADE;


--
-- Name: consent_document_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consent_document_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: consent_document_versions public_reads_consent_document_versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_reads_consent_document_versions ON public.consent_document_versions FOR SELECT TO authenticated, anon USING (true);


--
-- Name: TABLE consent_document_versions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.consent_document_versions TO anon;
GRANT SELECT ON TABLE public.consent_document_versions TO authenticated;
GRANT ALL ON TABLE public.consent_document_versions TO service_role;


