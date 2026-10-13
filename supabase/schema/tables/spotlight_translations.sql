--
-- Name: spotlight_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spotlight_translations (
    spotlight_id uuid NOT NULL,
    locale text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    CONSTRAINT chk_spotlight_translations_body_present CHECK ((btrim(body) <> ''::text)),
    CONSTRAINT chk_spotlight_translations_locale_format CHECK ((locale ~ '^[a-z]{2,3}(-[a-z]{2})?$'::text)),
    CONSTRAINT chk_spotlight_translations_title_present CHECK ((btrim(title) <> ''::text))
);


--
-- Name: TABLE spotlight_translations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.spotlight_translations IS 'One language version of a spotlight: its title and body in one site locale. Any set of locales, at least one per spotlight: create_spotlight and save_spotlight refuse an empty set, and nothing else removes a version. Readers pick their version by their locale, then English, then the first written. Admin-only for the Data API, as spotlights is; the writers are create_spotlight and save_spotlight, which replace the whole set.';


--
-- Name: COLUMN spotlight_translations.locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.spotlight_translations.locale IS 'A site locale code (en, fi, sv, ...), the same code set as profiles.locale. Not a spoken language.';


--
-- Name: COLUMN spotlight_translations.title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.spotlight_translations.title IS 'The title in this language, trimmed. Required.';


--
-- Name: COLUMN spotlight_translations.body; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.spotlight_translations.body IS 'The authored markdown in this language, trimmed. Required. Links are allowed and headings are not; the renderer''s use case enforces that, not this column.';


--
-- Name: spotlight_translations spotlight_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spotlight_translations
    ADD CONSTRAINT spotlight_translations_pkey PRIMARY KEY (spotlight_id, locale);


--
-- Name: spotlight_translations spotlight_translations_spotlight_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spotlight_translations
    ADD CONSTRAINT spotlight_translations_spotlight_id_fkey FOREIGN KEY (spotlight_id) REFERENCES public.spotlights(id) ON DELETE CASCADE;


--
-- Name: spotlight_translations admins_read_spotlight_translations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_spotlight_translations ON public.spotlight_translations FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: spotlight_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.spotlight_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE spotlight_translations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.spotlight_translations TO authenticated;
GRANT ALL ON TABLE public.spotlight_translations TO service_role;


