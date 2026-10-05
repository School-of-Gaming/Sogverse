--
-- Name: library_article_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_article_translations (
    article_id uuid NOT NULL,
    locale text NOT NULL,
    title text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    body_md5 text GENERATED ALWAYS AS (md5(body)) STORED,
    is_complete boolean GENERATED ALWAYS AS (((btrim(title) <> ''::text) AND (btrim(summary) <> ''::text) AND (btrim(body) <> ''::text))) STORED,
    CONSTRAINT chk_library_article_translations_locale_format CHECK ((locale ~ '^[a-z]{2,3}$'::text)),
    CONSTRAINT chk_library_article_translations_title_present CHECK ((btrim(title) <> ''::text))
);


--
-- Name: TABLE library_article_translations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.library_article_translations IS 'One language version of a Library article''s WORKING COPY — what an admin is editing in that locale, which may be saved incomplete. Any set of locales, at least one per article: save_library_article refuses an empty set, and nothing else removes a version. The public never reads this table: publishing copies the complete versions to library_article_publication_translations. Admin-only end to end: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are save_library_article, which replaces the whole set, and save_library_article_version, which writes one version.';


--
-- Name: COLUMN library_article_translations.locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_article_translations.locale IS 'A site locale code (en, fi, sv, ...), the same code set as profiles.locale. Not a spoken language.';


--
-- Name: COLUMN library_article_translations.title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_article_translations.title IS 'The title in this language, trimmed. The one field a version must carry.';


--
-- Name: COLUMN library_article_translations.summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_article_translations.summary IS 'The standfirst shown under the title and on the index card: plain text, trimmed, and the empty string while unwritten.';


--
-- Name: COLUMN library_article_translations.body; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_article_translations.body IS 'The authored markdown in this language, trimmed, and the empty string while unwritten. The article page counts its reading time from it.';


--
-- Name: COLUMN library_article_translations.body_md5; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_article_translations.body_md5 IS 'md5 of body, generated, so the admin list can tell whether a version differs from its published one without reading either body.';


--
-- Name: COLUMN library_article_translations.is_complete; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_article_translations.is_complete IS 'Generated: title, summary and body all written. A complete version is one publishing copies; an incomplete one stays in the working copy alone. The one definition of complete, which publish_library_article reads.';


--
-- Name: library_article_translations library_article_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_article_translations
    ADD CONSTRAINT library_article_translations_pkey PRIMARY KEY (article_id, locale);


--
-- Name: library_article_translations library_article_translations_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_article_translations
    ADD CONSTRAINT library_article_translations_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.library_articles(id) ON DELETE CASCADE;


--
-- Name: library_article_translations admins_read_library_article_translations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_library_article_translations ON public.library_article_translations FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: library_article_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.library_article_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE library_article_translations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.library_article_translations TO authenticated;
GRANT ALL ON TABLE public.library_article_translations TO service_role;


