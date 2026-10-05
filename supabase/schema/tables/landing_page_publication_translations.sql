--
-- Name: landing_page_publication_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_page_publication_translations (
    page_id uuid NOT NULL,
    locale text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    slug text NOT NULL,
    section_texts jsonb NOT NULL,
    texts_md5 text GENERATED ALWAYS AS (md5((section_texts)::text)) STORED,
    CONSTRAINT chk_landing_page_publication_translations_locale_format CHECK ((locale ~ '^[a-z]{2,3}$'::text)),
    CONSTRAINT chk_landing_page_publication_translations_slug_format CHECK (((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (char_length(slug) <= 80) AND (slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text))),
    CONSTRAINT chk_landing_page_publication_translations_summary_present CHECK ((btrim(summary) <> ''::text)),
    CONSTRAINT chk_landing_page_publication_translations_texts_object CHECK ((jsonb_typeof(section_texts) = 'object'::text)),
    CONSTRAINT chk_landing_page_publication_translations_title_present CHECK ((btrim(title) <> ''::text))
);


--
-- Name: TABLE landing_page_publication_translations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.landing_page_publication_translations IS 'One language version of a live landing page — what readers of that language see, at its slug address. publish_landing_page replaces a page''s whole set with the working copy''s complete versions, so a live page has at least one; unpublishing deletes the publication and these with it (CASCADE). Title, summary and slug are present by CHECK and the slug unique per locale. Readable by anon and authenticated alike, every row; no write grant for either. Readers pick a version in the app: their locale, then English, then the first written.';


--
-- Name: COLUMN landing_page_publication_translations.texts_md5; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_publication_translations.texts_md5 IS 'md5 of section_texts, generated — compared with the working version''s own.';


--
-- Name: landing_page_publication_translations landing_page_publication_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_publication_translations
    ADD CONSTRAINT landing_page_publication_translations_pkey PRIMARY KEY (page_id, locale);


--
-- Name: landing_page_publication_translations uq_landing_page_publication_translations_locale_slug; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_publication_translations
    ADD CONSTRAINT uq_landing_page_publication_translations_locale_slug UNIQUE (locale, slug);


--
-- Name: landing_page_publication_translations landing_page_publication_translations_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_publication_translations
    ADD CONSTRAINT landing_page_publication_translations_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.landing_page_publications(page_id) ON DELETE CASCADE;


--
-- Name: landing_page_publication_translations everyone_reads_landing_page_publication_translations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY everyone_reads_landing_page_publication_translations ON public.landing_page_publication_translations FOR SELECT TO authenticated, anon USING (true);


--
-- Name: landing_page_publication_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_page_publication_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE landing_page_publication_translations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.landing_page_publication_translations TO anon;
GRANT SELECT ON TABLE public.landing_page_publication_translations TO authenticated;
GRANT ALL ON TABLE public.landing_page_publication_translations TO service_role;


