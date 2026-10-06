--
-- Name: landing_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landing_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid,
    sections jsonb NOT NULL,
    sections_md5 text GENERATED ALWAYS AS (md5((sections)::text)) STORED,
    image_paths jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_saved_by uuid,
    last_saved_via uuid
);


--
-- Name: TABLE landing_pages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.landing_pages IS 'The WORKING COPY of each landing page — what an admin is editing, which may be saved incomplete: the section structure here, shared by every language, and the words per language in landing_page_translations. The public never reads this table: what is live is the page''s row in landing_page_publications, copied from this one by publish_landing_page. The id is the page''s id address. Admin-only end to end: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are create_landing_page, save_landing_page, save_landing_page_structure, save_landing_page_version and remove_landing_page_version, and the catalogue''s repoint_landing_images and removal trigger. No delete: a page that has to come down is unpublished.';


--
-- Name: COLUMN landing_pages.author_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_pages.author_id IS 'The admin who created the page, stamped from auth.uid() by create_landing_page and never changed. SET NULL when that account goes.';


--
-- Name: COLUMN landing_pages.sections; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_pages.sections IS 'The ordered section structure, a JSON array of {id, type, ...shared fields}: pictures, button targets, icons, and the ids and order of a section''s items. Its shape is landing_sections_problem''s; the writers refuse anything it names. The text of each section is per language, in landing_page_translations.section_texts, keyed by the section''s id.';


--
-- Name: COLUMN landing_pages.sections_md5; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_pages.sections_md5 IS 'md5 of sections, generated, so the admin list can tell whether the structure differs from the live one without comparing either.';


--
-- Name: COLUMN landing_pages.image_paths; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_pages.image_paths IS 'Each catalogue entry the sections show, as {entry id: object name in the landing-images bucket}, derived from sections by apply_landing_image_paths and never written by anything else.';


--
-- Name: COLUMN landing_pages.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_pages.updated_at IS 'When the working copy was last saved, its versions included, maintained by the landing_pages_updated_at trigger on an update of sections or updated_at: every writer names one of them, and so do the catalogue''s replace and removal. Publishing does not touch it.';


--
-- Name: COLUMN landing_pages.last_saved_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_pages.last_saved_by IS 'The admin whose write last changed the working copy, stamped from auth.uid() by stamp_landing_page_saver and never supplied by a statement. NULL when that write had no signed-in caller, or the account has since gone (SET NULL).';


--
-- Name: COLUMN landing_pages.last_saved_via; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.landing_pages.last_saved_via IS 'The OAuth client — an AI app connected through the MCP endpoint — that last_saved_by''s write came through: auth.oauth_clients.id, read from the token''s client_id claim by stamp_landing_page_saver. NULL for a write made in Sogverse itself, and whenever last_saved_by is NULL. No foreign key: the client belongs to Supabase Auth, and the record outlives it.';


--
-- Name: landing_pages landing_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages
    ADD CONSTRAINT landing_pages_pkey PRIMARY KEY (id);


--
-- Name: landing_pages landing_pages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER landing_pages_updated_at BEFORE UPDATE OF sections, updated_at ON public.landing_pages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: landing_pages trg_landing_pages_apply_image_paths; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_landing_pages_apply_image_paths BEFORE INSERT OR UPDATE ON public.landing_pages FOR EACH ROW EXECUTE FUNCTION public.apply_landing_image_paths();


--
-- Name: landing_pages trg_landing_pages_cascade_structure; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_landing_pages_cascade_structure AFTER UPDATE OF sections ON public.landing_pages FOR EACH ROW EXECUTE FUNCTION public.cascade_landing_structure();


--
-- Name: landing_pages trg_landing_pages_stamp_saver; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_landing_pages_stamp_saver BEFORE INSERT OR UPDATE OF sections, updated_at ON public.landing_pages FOR EACH ROW EXECUTE FUNCTION public.stamp_landing_page_saver();


--
-- Name: landing_pages landing_pages_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages
    ADD CONSTRAINT landing_pages_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: landing_pages landing_pages_last_saved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landing_pages
    ADD CONSTRAINT landing_pages_last_saved_by_fkey FOREIGN KEY (last_saved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: landing_pages admins_read_landing_pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_landing_pages ON public.landing_pages FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: landing_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE landing_pages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.landing_pages TO authenticated;
GRANT ALL ON TABLE public.landing_pages TO service_role;


