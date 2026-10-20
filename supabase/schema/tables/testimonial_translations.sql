--
-- Name: testimonial_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testimonial_translations (
    testimonial_id uuid NOT NULL,
    locale text NOT NULL,
    attribution text NOT NULL,
    quote text NOT NULL,
    CONSTRAINT chk_testimonial_translations_attribution_present CHECK ((btrim(attribution) <> ''::text)),
    CONSTRAINT chk_testimonial_translations_locale_format CHECK ((locale ~ '^[a-z]{2,3}(-[a-z]{2})?$'::text)),
    CONSTRAINT chk_testimonial_translations_quote_present CHECK ((btrim(quote) <> ''::text)),
    CONSTRAINT chk_testimonial_translations_quote_unquoted CHECK (((quote !~ '^[[:space:]]*["“”„‟«»‹›‘‚‛「」『』]'::text) AND (quote !~ '["“”„‟«»‹›‘‚‛「」『』][[:space:]]*$'::text)))
);


--
-- Name: TABLE testimonial_translations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testimonial_translations IS 'One language version of a testimonial: whom it is from and the quote, in one site locale. Any set of locales, at least one per testimonial: the writers refuse an empty set and refuse removing the last version. Readers pick their version by their locale, then English, then the first written. Admin-only for the Data API, as testimonials is.';


--
-- Name: COLUMN testimonial_translations.locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.testimonial_translations.locale IS 'A site locale code (en, fi, sv, ...), the same code set as profiles.locale. Not a spoken language.';


--
-- Name: COLUMN testimonial_translations.attribution; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.testimonial_translations.attribution IS 'Whom the quote is from, in this language — whatever short text the admin attributes it to ("Mum, Finland", "Gedu Pixel"). Plain text, trimmed, required. The app calls it the testimonial''s "from".';


--
-- Name: COLUMN testimonial_translations.quote; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.testimonial_translations.quote IS 'The words, in this language: plain text, trimmed, required, and never wrapped in quotation marks — the page wraps it in its reader''s locale''s marks (chk_testimonial_translations_quote_unquoted).';


--
-- Name: CONSTRAINT chk_testimonial_translations_quote_unquoted ON testimonial_translations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT chk_testimonial_translations_quote_unquoted ON public.testimonial_translations IS 'A quote never starts or ends with a quotation mark — straight or typographic double marks, low marks, guillemets, single typographic marks other than the apostrophe, and corner brackets. The page adds the reader''s locale''s own marks. The apostrophes are allowed at either end, since a word may start or end with one. The writers refuse such a quote with a sentence first.';


--
-- Name: testimonial_translations testimonial_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonial_translations
    ADD CONSTRAINT testimonial_translations_pkey PRIMARY KEY (testimonial_id, locale);


--
-- Name: testimonial_translations testimonial_translations_testimonial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonial_translations
    ADD CONSTRAINT testimonial_translations_testimonial_id_fkey FOREIGN KEY (testimonial_id) REFERENCES public.testimonials(id) ON DELETE CASCADE;


--
-- Name: testimonial_translations admins_read_testimonial_translations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_testimonial_translations ON public.testimonial_translations FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: testimonial_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testimonial_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE testimonial_translations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testimonial_translations TO authenticated;
GRANT ALL ON TABLE public.testimonial_translations TO service_role;


