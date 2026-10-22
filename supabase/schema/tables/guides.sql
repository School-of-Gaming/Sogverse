--
-- Name: guides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    created_via uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_saved_by uuid,
    last_saved_via uuid,
    CONSTRAINT chk_guides_label_length CHECK ((char_length(label) <= 200)),
    CONSTRAINT chk_guides_label_present CHECK ((btrim(label) <> ''::text))
);


--
-- Name: TABLE guides; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.guides IS 'Marketing''s store of guides — PDFs a landing page hands out, one file per site locale in guide_files: the admin-only label and the record of who created each and who last saved it. Admin-only for the Data API: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant — the writers are create_guide, save_guide_label, save_guide_file and remove_guide_file, and nothing deletes a guide: once created it stays. The public reads only which locales and sizes a live landing page''s guides have, through list_landing_page_guides; a signed-in reader''s download is authorized by get_guide_download_files.';


--
-- Name: COLUMN guides.label; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guides.label IS 'What the admins call the guide in their lists and pickers. Never shown to a reader: the landing page section placing the guide carries the words a reader sees. Trimmed, required, at most 200 characters.';


--
-- Name: COLUMN guides.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guides.created_at IS 'When the guide was created, stamped by stamp_guide_saver and never moved.';


--
-- Name: COLUMN guides.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guides.created_by IS 'The admin who created the guide, stamped from auth.uid() by stamp_guide_saver. NULL when the create had no signed-in caller (a migration, the service role, psql) or the account has since gone (SET NULL).';


--
-- Name: COLUMN guides.created_via; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guides.created_via IS 'The OAuth client — an AI app connected through the MCP endpoint — the create came through, read from the token''s client_id claim by stamp_guide_saver. NULL for a create made in Sogverse itself, and whenever created_by is NULL. No foreign key: the client belongs to Supabase Auth, and the record outlives it.';


--
-- Name: COLUMN guides.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guides.updated_at IS 'When the guide was last saved — its label or any of its files — stamped by stamp_guide_saver: every writer names this column, which is what fires the trigger.';


--
-- Name: COLUMN guides.last_saved_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guides.last_saved_by IS 'The admin whose write last saved the guide, stamped from auth.uid() by stamp_guide_saver. NULL when that write had no signed-in caller, or the account has since gone (SET NULL).';


--
-- Name: COLUMN guides.last_saved_via; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guides.last_saved_via IS 'The OAuth client the last save came through, read from the token''s client_id claim by stamp_guide_saver. NULL for a save made in Sogverse itself, and whenever last_saved_by is NULL. No foreign key, as created_via.';


--
-- Name: guides guides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guides
    ADD CONSTRAINT guides_pkey PRIMARY KEY (id);


--
-- Name: guides trg_guides_stamp_saver; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guides_stamp_saver BEFORE INSERT OR UPDATE OF updated_at ON public.guides FOR EACH ROW EXECUTE FUNCTION public.stamp_guide_saver();


--
-- Name: guides guides_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guides
    ADD CONSTRAINT guides_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: guides guides_last_saved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guides
    ADD CONSTRAINT guides_last_saved_by_fkey FOREIGN KEY (last_saved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: guides admins_read_guides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_guides ON public.guides FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: guides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE guides; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.guides TO authenticated;
GRANT ALL ON TABLE public.guides TO service_role;


