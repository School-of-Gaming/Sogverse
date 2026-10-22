--
-- Name: guide_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guide_files (
    guide_id uuid NOT NULL,
    locale text NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    byte_size integer NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    uploaded_by uuid,
    uploaded_via uuid,
    CONSTRAINT chk_guide_files_byte_size CHECK (((byte_size >= 1) AND (byte_size <= 4194304))),
    CONSTRAINT chk_guide_files_file_name_present CHECK (((btrim(file_name) <> ''::text) AND (char_length(file_name) <= 255))),
    CONSTRAINT chk_guide_files_locale_format CHECK ((locale ~ '^[a-z]{2,3}(-[a-z]{2})?$'::text)),
    CONSTRAINT chk_guide_files_path_scheme CHECK (((storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z]{2,3}(-[a-z]{2})?/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'::text) AND (split_part(storage_path, '/'::text, 1) = (guide_id)::text) AND (split_part(storage_path, '/'::text, 2) = locale)))
);


--
-- Name: TABLE guide_files; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.guide_files IS 'One language''s file of a guide: the PDF a reader of that site locale downloads. Any set of locales, at least one per guide: create_guide writes the first and remove_guide_file refuses the last. Readers get the file of their locale, else English, else the first written. Admin-only for the Data API, as guides is.';


--
-- Name: COLUMN guide_files.locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guide_files.locale IS 'A site locale code (en, fi, sv, ...), the same code set as profiles.locale. Not a spoken language.';


--
-- Name: COLUMN guide_files.storage_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guide_files.storage_path IS 'The object in the private guides bucket: <guide id>/<locale>/<random uuid>.pdf (chk_guide_files_path_scheme). Every upload is a fresh path, so replacing a file never serves the old bytes from any cache under the new address; the writers answer the path a replace or a removal let go, and the caller deletes that object.';


--
-- Name: COLUMN guide_files.file_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guide_files.file_name IS 'The file name the PDF was uploaded under, which a download is offered as. Trimmed, required, at most 255 characters.';


--
-- Name: COLUMN guide_files.byte_size; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guide_files.byte_size IS 'The object''s size in bytes, measured by the uploader before it stored the object: at most 4 MB, the guides bucket''s own cap.';


--
-- Name: COLUMN guide_files.uploaded_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guide_files.uploaded_at IS 'When this file was uploaded, stamped by stamp_guide_file_uploader on every new object.';


--
-- Name: COLUMN guide_files.uploaded_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guide_files.uploaded_by IS 'The admin who uploaded this file, stamped from auth.uid() by stamp_guide_file_uploader. NULL when the upload had no signed-in caller, or the account has since gone (SET NULL).';


--
-- Name: COLUMN guide_files.uploaded_via; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.guide_files.uploaded_via IS 'The OAuth client the upload came through, read from the token''s client_id claim by stamp_guide_file_uploader. NULL for an upload made in Sogverse itself, and whenever uploaded_by is NULL.';


--
-- Name: guide_files guide_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guide_files
    ADD CONSTRAINT guide_files_pkey PRIMARY KEY (guide_id, locale);


--
-- Name: guide_files uq_guide_files_storage_path; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guide_files
    ADD CONSTRAINT uq_guide_files_storage_path UNIQUE (storage_path);


--
-- Name: guide_files trg_guide_files_stamp_uploader; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guide_files_stamp_uploader BEFORE INSERT OR UPDATE OF storage_path ON public.guide_files FOR EACH ROW EXECUTE FUNCTION public.stamp_guide_file_uploader();


--
-- Name: guide_files guide_files_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guide_files
    ADD CONSTRAINT guide_files_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guides(id) ON DELETE CASCADE;


--
-- Name: guide_files guide_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guide_files
    ADD CONSTRAINT guide_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: guide_files admins_read_guide_files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_guide_files ON public.guide_files FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: guide_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guide_files ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE guide_files; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.guide_files TO authenticated;
GRANT ALL ON TABLE public.guide_files TO service_role;


