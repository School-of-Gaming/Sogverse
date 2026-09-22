--
-- Name: consent_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_documents (
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_consent_documents_slug_not_empty CHECK ((btrim(slug) <> ''::text))
);


--
-- Name: TABLE consent_documents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.consent_documents IS 'One row per consent DOCUMENT the platform knows about — its identity, not any one revision of its text. A product points at a slug here to say "a parent must agree to this before enrolling", and that pointer survives every republication of the document. Rows arrive by MIGRATION only: there is no write grant for any Data API role, because a document is something that was drafted and published, not a value an app invents. Readable by anon as well as authenticated, because the public shop names a product''s required consents before anybody has signed in.';


--
-- Name: COLUMN consent_documents.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_documents.slug IS 'The document''s stable identifier, e.g. roblox-programme-terms. The primary key, the value product_required_consents points at, and the value consent_acceptances stores alongside a version.';


--
-- Name: COLUMN consent_documents.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_documents.created_at IS 'When this document identity was added to the platform. Not an ordering key for anything — versions carry that — just a record of when the slug started existing.';


--
-- Name: consent_documents consent_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_documents
    ADD CONSTRAINT consent_documents_pkey PRIMARY KEY (slug);


--
-- Name: consent_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consent_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: consent_documents public_reads_consent_documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_reads_consent_documents ON public.consent_documents FOR SELECT TO authenticated, anon USING (true);


--
-- Name: TABLE consent_documents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.consent_documents TO anon;
GRANT SELECT ON TABLE public.consent_documents TO authenticated;
GRANT ALL ON TABLE public.consent_documents TO service_role;


