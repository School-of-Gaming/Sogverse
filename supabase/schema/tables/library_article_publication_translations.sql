--
-- Name: library_article_publication_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_article_publication_translations (
    article_id uuid NOT NULL,
    locale text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    body text NOT NULL,
    body_md5 text GENERATED ALWAYS AS (md5(body)) STORED,
    CONSTRAINT chk_library_article_publication_translations_body_present CHECK ((btrim(body) <> ''::text)),
    CONSTRAINT chk_library_article_publication_translations_locale_format CHECK ((locale ~ '^[a-z]{2,3}$'::text)),
    CONSTRAINT chk_library_article_publication_translations_summary_present CHECK ((btrim(summary) <> ''::text)),
    CONSTRAINT chk_library_article_publication_translations_title_present CHECK ((btrim(title) <> ''::text))
);


--
-- Name: TABLE library_article_publication_translations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.library_article_publication_translations IS 'One language version of a live Library article — what readers of that language see. publish_library_article replaces an article''s whole set with the working copy''s complete versions, so a live article has at least one; unpublishing deletes the publication and these with it (CASCADE). Every text field is complete by CHECK. Readable by anon and authenticated alike, every row; no write grant for either. Readers pick a version in the app: their locale, then English, then the first written.';


--
-- Name: COLUMN library_article_publication_translations.locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_article_publication_translations.locale IS 'A site locale code (en, fi, sv, ...), the same code set as profiles.locale. Not a spoken language.';


--
-- Name: COLUMN library_article_publication_translations.body_md5; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_article_publication_translations.body_md5 IS 'md5 of body, generated — compared with the working version''s own to tell whether it has unpublished changes, without reading either body.';


--
-- Name: library_article_publication_translations library_article_publication_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_article_publication_translations
    ADD CONSTRAINT library_article_publication_translations_pkey PRIMARY KEY (article_id, locale);


--
-- Name: library_article_publication_translations library_article_publication_translations_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_article_publication_translations
    ADD CONSTRAINT library_article_publication_translations_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.library_article_publications(article_id) ON DELETE CASCADE;


--
-- Name: library_article_publication_translations everyone_reads_library_article_publication_translations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY everyone_reads_library_article_publication_translations ON public.library_article_publication_translations FOR SELECT TO authenticated, anon USING (true);


--
-- Name: library_article_publication_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.library_article_publication_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE library_article_publication_translations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.library_article_publication_translations TO anon;
GRANT SELECT ON TABLE public.library_article_publication_translations TO authenticated;
GRANT ALL ON TABLE public.library_article_publication_translations TO service_role;


