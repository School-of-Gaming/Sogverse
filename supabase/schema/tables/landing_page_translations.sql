--
-- Name: landing_page_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_page_translations (
    page_id uuid NOT NULL,
    locale text NOT NULL,
    title text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    slug text DEFAULT ''::text NOT NULL,
    section_texts jsonb DEFAULT '{}'::jsonb NOT NULL,
    texts_md5 text GENERATED ALWAYS AS (md5((section_texts)::text)) STORED,
    is_complete boolean DEFAULT false NOT NULL,
    CONSTRAINT chk_landing_page_translations_locale_format CHECK ((locale ~ '^[a-z]{2,3}$'::text)),
    CONSTRAINT chk_landing_page_translations_slug_format CHECK (((slug = ''::text) OR ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (char_length(slug) <= 80) AND (slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text)))),
    CONSTRAINT chk_landing_page_translations_summary_length CHECK ((char_length(summary) <= 160)),
    CONSTRAINT chk_landing_page_translations_texts_object CHECK ((jsonb_typeof(section_texts) = 'object'::text)),
    CONSTRAINT chk_landing_page_translations_title_length CHECK ((char_length(title) <= 120)),
    CONSTRAINT chk_landing_page_translations_title_present CHECK ((btrim(title) <> ''::text))
);


--
-- Name: TABLE landing_page_translations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.landing_page_translations IS 'One language version of a landing page''s WORKING COPY — its title, summary, slug and the text of every section in that locale, which may be saved incomplete. At least one per page: save_landing_page refuses an empty set, and remove_landing_page_version refuses to remove the last. The public never reads this table: publishing copies the complete versions to landing_page_publication_translations. Admin-only end to end: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are save_landing_page, which replaces the whole set, save_landing_page_version, which writes one, and remove_landing_page_version, which removes one.';


--
-- Name: COLUMN landing_page_translations.locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_translations.locale IS 'A site locale code (en, fi, sv, ...), the same code set as profiles.locale. Not a spoken language.';


--
-- Name: COLUMN landing_page_translations.title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_translations.title IS 'The title in this language: the page''s <title> and the name the admin list shows. The one field a version must carry.';


--
-- Name: COLUMN landing_page_translations.summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_translations.summary IS 'The summary in this language — the page''s meta description and its line in llms.txt — plain text, at most 160 characters, and the empty string while unwritten.';


--
-- Name: COLUMN landing_page_translations.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_translations.slug IS 'The page''s address in this language, stored: lowercase a-z, 0-9 and single hyphens, at most 80 characters, never shaped like a uuid so it cannot be read as an id address, and the empty string while unwritten. Unique per locale among the working versions (uq_landing_page_translations_locale_slug), and the writers refuse one another page has live too. It may change at any time, a live language''s included: the published copy keeps the old address until the next publish, and nothing redirects from it after.';


--
-- Name: COLUMN landing_page_translations.section_texts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_translations.section_texts IS 'The text of each section in this language, as {section id: {field: text, ...}}. A key names a section of the page''s structure; the text of a section the structure drops is dropped with it. Which fields each section type has, and which are required, is the application''s section registry; landing_version_missing is the SQL half of the required rule.';


--
-- Name: COLUMN landing_page_translations.texts_md5; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_translations.texts_md5 IS 'md5 of section_texts, generated — compared with the live version''s own to tell whether this version has unpublished changes without reading either.';


--
-- Name: COLUMN landing_page_translations.is_complete; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_translations.is_complete IS 'Whether publishing would take this version: title, summary and slug written and every section''s required text written, by landing_version_missing against the page''s current structure. Derived by apply_landing_version_completeness on every write of the row, and recomputed for every version when the structure changes; never written by anything else.';


--
-- Name: landing_page_translations landing_page_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_translations
    ADD CONSTRAINT landing_page_translations_pkey PRIMARY KEY (page_id, locale);


--
-- Name: uq_landing_page_translations_locale_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_landing_page_translations_locale_slug ON public.landing_page_translations USING btree (locale, slug) WHERE (slug <> ''::text);


--
-- Name: landing_page_translations trg_landing_page_translations_completeness; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_landing_page_translations_completeness BEFORE INSERT OR UPDATE ON public.landing_page_translations FOR EACH ROW EXECUTE FUNCTION public.apply_landing_version_completeness();


--
-- Name: landing_page_translations landing_page_translations_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_translations
    ADD CONSTRAINT landing_page_translations_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.landing_pages(id) ON DELETE CASCADE;


--
-- Name: landing_page_translations admins_read_landing_page_translations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_landing_page_translations ON public.landing_page_translations FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: landing_page_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_page_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE landing_page_translations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.landing_page_translations TO authenticated;
GRANT ALL ON TABLE public.landing_page_translations TO service_role;


