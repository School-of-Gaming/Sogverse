--
-- Name: landing_page_publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_page_publications (
    page_id uuid NOT NULL,
    sections jsonb NOT NULL,
    sections_md5 text GENERATED ALWAYS AS (md5((sections)::text)) STORED,
    image_paths jsonb DEFAULT '{}'::jsonb NOT NULL,
    published_at timestamp with time zone NOT NULL,
    first_published_at timestamp with time zone NOT NULL,
    CONSTRAINT chk_landing_page_publications_first_not_after_latest CHECK ((first_published_at <= published_at))
);


--
-- Name: TABLE landing_page_publications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.landing_page_publications IS 'The PUBLISHED COPY of each live landing page: its section structure here, and its words per language in landing_page_publication_translations. A row''s existence is the page being live: publish_landing_page copies the working copy over it and unpublish_landing_page deletes it, its versions with it. Readable by anon and authenticated alike, every row; no write grant for either — publish and unpublish are the writers, and the catalogue''s repoint_landing_images and removal trigger the only others.';


--
-- Name: COLUMN landing_page_publications.sections; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_publications.sections IS 'The live section structure, copied from the working copy by publishing. The catalogue''s replace and removal change its pictures without a republish.';


--
-- Name: COLUMN landing_page_publications.sections_md5; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_publications.sections_md5 IS 'md5 of sections, generated — compared with the working copy''s own.';


--
-- Name: COLUMN landing_page_publications.image_paths; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_publications.image_paths IS 'Each catalogue entry the live sections show, as {entry id: object name in the landing-images bucket}, derived by apply_landing_image_paths — what the public pages paint, readable without reading the admin-only catalogue.';


--
-- Name: COLUMN landing_page_publications.published_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_publications.published_at IS 'When the version now live was published. Every publish moves it; the sitemap''s lastmod.';


--
-- Name: COLUMN landing_page_publications.first_published_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_page_publications.first_published_at IS 'When the page went live, kept by every republish while it stays live. An unpublish deletes the row and takes the date with it.';


--
-- Name: landing_page_publications landing_page_publications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_publications
    ADD CONSTRAINT landing_page_publications_pkey PRIMARY KEY (page_id);


--
-- Name: idx_landing_page_publications_first_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_landing_page_publications_first_published ON public.landing_page_publications USING btree (first_published_at DESC, page_id);


--
-- Name: landing_page_publications trg_landing_page_publications_apply_image_paths; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_landing_page_publications_apply_image_paths BEFORE INSERT OR UPDATE ON public.landing_page_publications FOR EACH ROW EXECUTE FUNCTION public.apply_landing_image_paths();


--
-- Name: landing_page_publications trg_landing_page_publications_cascade_structure; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_landing_page_publications_cascade_structure AFTER UPDATE OF sections ON public.landing_page_publications FOR EACH ROW EXECUTE FUNCTION public.cascade_landing_structure();


--
-- Name: landing_page_publications landing_page_publications_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_page_publications
    ADD CONSTRAINT landing_page_publications_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.landing_pages(id) ON DELETE CASCADE;


--
-- Name: landing_page_publications everyone_reads_landing_page_publications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY everyone_reads_landing_page_publications ON public.landing_page_publications FOR SELECT TO authenticated, anon USING (true);


--
-- Name: landing_page_publications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_page_publications ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE landing_page_publications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.landing_page_publications TO anon;
GRANT SELECT ON TABLE public.landing_page_publications TO authenticated;
GRANT ALL ON TABLE public.landing_page_publications TO service_role;


