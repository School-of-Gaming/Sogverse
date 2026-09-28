--
-- Name: gedu_contract_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gedu_contract_versions (
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_gedu_contract_versions_version_not_empty CHECK ((btrim(version) <> ''::text))
);


--
-- Name: TABLE gedu_contract_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gedu_contract_versions IS 'Every version of the gedu contract (Pelikasvattajan sopimusehdot) the platform knows about, one row per version PER LANGUAGE — the languages of one version are the same agreement published twice and equally binding, so they share a base label and a created_at and differ only in the suffix. Rows arrive by MIGRATION only — there is no write grant for any Data API role — because a version is a document that was drafted and published, not a value an app invents. The CURRENT version is the BASE of the row with the greatest created_at, and that derivation is what makes acceptance version-keyed: a gedu whose accepted base is not the current one is re-prompted, and one who signed either language of the current version is not. Readable by every signed-in role, because a gedu needs to know what they are signing and an admin needs to know what "current" means.';


--
-- Name: COLUMN gedu_contract_versions.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_contract_versions.version IS 'The version label, encoded as <base>/<language>: the label the document itself carries, a slash, and the code of the language that text is written in — e.g. 2026-2027/fi, 2026-2027/en. The primary key, and the value gedu_contract_acceptances stores verbatim, because which of the two equally binding texts a gedu read is part of what they signed. Anything asking whether a gedu is CURRENT compares the base alone (split_part(version, ''/'', 1)); anything displaying what they signed shows the whole string.';


--
-- Name: COLUMN gedu_contract_versions.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_contract_versions.created_at IS 'When this version was added to the platform. Ordering key and nothing else: the greatest created_at names the current version, whose BASE is what "current" means. Every language of one version carries the same created_at, set from the moment that version was published rather than re-read per row — so the ordering picks a version and never a language, and a tie between the two texts is not a tie anything has to break.';


--
-- Name: gedu_contract_versions gedu_contract_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_contract_versions
    ADD CONSTRAINT gedu_contract_versions_pkey PRIMARY KEY (version);


--
-- Name: gedu_contract_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gedu_contract_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: gedu_contract_versions signed_in_reads_gedu_contract_versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY signed_in_reads_gedu_contract_versions ON public.gedu_contract_versions FOR SELECT TO authenticated USING (true);


--
-- Name: TABLE gedu_contract_versions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gedu_contract_versions TO authenticated;
GRANT ALL ON TABLE public.gedu_contract_versions TO service_role;


