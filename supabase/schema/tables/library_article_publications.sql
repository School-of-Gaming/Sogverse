--
-- Name: library_article_publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_article_publications (
    article_id uuid NOT NULL,
    category public.library_article_category NOT NULL,
    cover_image_id uuid,
    cover_path text,
    published_at timestamp with time zone NOT NULL,
    first_published_at timestamp with time zone NOT NULL,
    CONSTRAINT chk_library_article_publications_first_not_after_latest CHECK ((first_published_at <= published_at))
);


--
-- Name: TABLE library_article_publications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.library_article_publications IS 'The PUBLISHED COPY of each live Library article: its category and cover here, and its text per language in library_article_publication_translations. A row''s existence is the article being live: publish_library_article copies the working copy over it and unpublish_library_article deletes it, its versions with it. The category is complete by NOT NULL and every version by CHECK, so nothing on a public page is ever blank; the cover is optional. Readable by anon and authenticated alike, every row; no write grant for either — publish and unpublish are the only writers, and the catalogue''s repoint_library_covers the only other. Holding no draft column is what keeps a draft out of public reach, rather than a policy that has to filter one.';


--
-- Name: COLUMN library_article_publications.article_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_article_publications.article_id IS 'The article, and its URL. CASCADE from the working copy, which is never deleted in practice: there is no delete.';


--
-- Name: COLUMN library_article_publications.cover_image_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_article_publications.cover_image_id IS 'The live cover: a library_cover entry in the shared image catalogue, copied from the working copy by publishing, or NULL for none. The catalogue''s replace moves it to the new entry without a republish, and removing the entry nulls it (SET NULL).';


--
-- Name: COLUMN library_article_publications.cover_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_article_publications.cover_path IS 'The live cover''s object name in the library-covers bucket, derived from cover_image_id by apply_library_cover_path — what the public pages paint, readable without reading the admin-only catalogue. NULL exactly when cover_image_id is.';


--
-- Name: COLUMN library_article_publications.published_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_article_publications.published_at IS 'When the version now live was published. Every publish moves it.';


--
-- Name: COLUMN library_article_publications.first_published_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_article_publications.first_published_at IS 'When the article went live, kept by every republish while it stays live — the date the article page shows, which a later edit does not move. An unpublish deletes the row and takes the date with it, so publishing again after taking a mistake down starts a new one.';


--
-- Name: library_article_publications library_article_publications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_article_publications
    ADD CONSTRAINT library_article_publications_pkey PRIMARY KEY (article_id);


--
-- Name: idx_library_article_publications_cover_image_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_library_article_publications_cover_image_id ON public.library_article_publications USING btree (cover_image_id);


--
-- Name: idx_library_article_publications_first_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_library_article_publications_first_published ON public.library_article_publications USING btree (first_published_at DESC, article_id);


--
-- Name: library_article_publications trg_library_article_publications_apply_cover_path; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_library_article_publications_apply_cover_path BEFORE INSERT OR UPDATE ON public.library_article_publications FOR EACH ROW EXECUTE FUNCTION public.apply_library_cover_path();


--
-- Name: library_article_publications library_article_publications_article_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_article_publications
    ADD CONSTRAINT library_article_publications_article_id_fkey FOREIGN KEY (article_id) REFERENCES public.library_articles(id) ON DELETE CASCADE;


--
-- Name: library_article_publications library_article_publications_cover_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_article_publications
    ADD CONSTRAINT library_article_publications_cover_image_id_fkey FOREIGN KEY (cover_image_id) REFERENCES public.catalogue_images(id) ON DELETE SET NULL;


--
-- Name: library_article_publications everyone_reads_library_article_publications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY everyone_reads_library_article_publications ON public.library_article_publications FOR SELECT TO authenticated, anon USING (true);


--
-- Name: library_article_publications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.library_article_publications ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE library_article_publications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.library_article_publications TO anon;
GRANT SELECT ON TABLE public.library_article_publications TO authenticated;
GRANT ALL ON TABLE public.library_article_publications TO service_role;


