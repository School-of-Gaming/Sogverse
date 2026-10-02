--
-- Name: library_articles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_articles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid,
    category public.library_article_category,
    cover_image_id uuid,
    cover_path text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_saved_by uuid,
    last_saved_via uuid
);


--
-- Name: TABLE library_articles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.library_articles IS 'The WORKING COPY of each Library article — what an admin is editing, which may be saved incomplete: the category and cover here, and the text per language in library_article_translations. The public never reads this table: what is live is the article''s row in library_article_publications, copied from this one by publish_library_article, so saving here never changes the live article. The id is the article''s URL. Admin-only end to end: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant at all — the only writers are create_library_article, save_library_article, the partial writers save_library_article_version, set_library_article_category and set_library_article_cover, and the catalogue''s repoint_library_covers. No delete: an article that has to come down is unpublished.';


--
-- Name: COLUMN library_articles.author_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_articles.author_id IS 'The admin who created the article, stamped from auth.uid() by create_library_article and never changed. Kept as a record and shown nowhere. SET NULL rather than CASCADE when that account goes, because an article outlives the account that wrote it.';


--
-- Name: COLUMN library_articles.category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_articles.category IS 'One of the five categories, or NULL while a draft has none — publishing refuses a draft without one.';


--
-- Name: COLUMN library_articles.cover_image_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_articles.cover_image_id IS 'The cover: a library_cover entry in the shared image catalogue, or NULL for none. SET NULL when the entry is removed from the catalogue; moved to the new entry by the catalogue''s replace (repoint_library_covers).';


--
-- Name: COLUMN library_articles.cover_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_articles.cover_path IS 'The cover''s object name in the library-covers bucket, derived from cover_image_id by apply_library_cover_path and never written by anything else. NULL exactly when cover_image_id is.';


--
-- Name: COLUMN library_articles.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_articles.updated_at IS 'When the working copy was last saved, its versions included, maintained by the library_articles_updated_at trigger on an update of category, cover_image_id or updated_at: every Library writer names one of them, and so do the catalogue''s replace and removal, which move the cover. Publishing does not touch it, and neither does a profile deletion''s SET NULL on author_id or last_saved_by. Who saved it, and through which app, are last_saved_by and last_saved_via.';


--
-- Name: COLUMN library_articles.last_saved_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_articles.last_saved_by IS 'The admin whose write last changed the working copy, stamped from auth.uid() by stamp_library_article_saver and never supplied by a statement. NULL when that write had no signed-in caller (a server-side write under the service role, or a hand write over psql), when the account has since gone (SET NULL), and on articles last saved before the column existed.';


--
-- Name: COLUMN library_articles.last_saved_via; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.library_articles.last_saved_via IS 'The OAuth client — an AI app connected through the MCP endpoint — that last_saved_by''s write came through: auth.oauth_clients.id, read from the token''s client_id claim by stamp_library_article_saver. NULL for a write made in Sogverse itself, and whenever last_saved_by is NULL. No foreign key: the client belongs to Supabase Auth, and the record that a save came through an app outlives it. Deleting a client only marks it deleted, so get_oauth_client still names it; a client removed outright names nothing.';


--
-- Name: library_articles library_articles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_articles
    ADD CONSTRAINT library_articles_pkey PRIMARY KEY (id);


--
-- Name: idx_library_articles_cover_image_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_library_articles_cover_image_id ON public.library_articles USING btree (cover_image_id);


--
-- Name: library_articles library_articles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER library_articles_updated_at BEFORE UPDATE OF category, cover_image_id, updated_at ON public.library_articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: library_articles trg_library_articles_apply_cover_path; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_library_articles_apply_cover_path BEFORE INSERT OR UPDATE ON public.library_articles FOR EACH ROW EXECUTE FUNCTION public.apply_library_cover_path();


--
-- Name: library_articles trg_library_articles_stamp_saver; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_library_articles_stamp_saver BEFORE INSERT OR UPDATE OF category, cover_image_id, updated_at ON public.library_articles FOR EACH ROW EXECUTE FUNCTION public.stamp_library_article_saver();


--
-- Name: library_articles library_articles_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_articles
    ADD CONSTRAINT library_articles_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: library_articles library_articles_cover_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_articles
    ADD CONSTRAINT library_articles_cover_image_id_fkey FOREIGN KEY (cover_image_id) REFERENCES public.catalogue_images(id) ON DELETE SET NULL;


--
-- Name: library_articles library_articles_last_saved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_articles
    ADD CONSTRAINT library_articles_last_saved_by_fkey FOREIGN KEY (last_saved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: library_articles admins_read_library_articles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_library_articles ON public.library_articles FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: library_articles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.library_articles ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE library_articles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.library_articles TO authenticated;
GRANT ALL ON TABLE public.library_articles TO service_role;


