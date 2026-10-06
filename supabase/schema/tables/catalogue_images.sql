--
-- Name: catalogue_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.catalogue_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    sha256 text NOT NULL,
    path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    purpose public.catalogue_image_purpose NOT NULL,
    CONSTRAINT chk_catalogue_images_label_length CHECK (((length(label) >= 1) AND (length(label) <= 120))),
    CONSTRAINT chk_catalogue_images_path_matches_sha256 CHECK ((path ~ (('^'::text || sha256) || '\.(jpg|png|webp|avif)$'::text))),
    CONSTRAINT chk_catalogue_images_path_not_empty CHECK ((path <> ''::text)),
    CONSTRAINT chk_catalogue_images_sha256_is_a_hash CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: TABLE catalogue_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.catalogue_images IS 'The catalogue of pictures admins pick from for content: product pictures, Library article covers and landing page pictures, each entry marked with its purpose. One row per distinct image per purpose, identified by the sha256 of its bytes; the object key is <sha256>.<ext> in the public bucket of the entry''s purpose (product-images, library-covers or landing-images). A row is immutable except for its label — the bytes behind a path never change, which is what makes the image optimizer''s one-year cache floor safe. Admin-only: no anon grant and no anon policy, because nothing family-facing reads this table. Products reference it by products.image_id, Library article copies by cover_image_id, and landing page copies by the image ids in their sections; the served products.image_path, cover_path and image_paths are derived from those links by triggers and are what every reader reads.';


--
-- Name: COLUMN catalogue_images.sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.catalogue_images.sha256 IS 'Lowercase hex sha256 of the stored bytes. UNIQUE within a purpose, and that uniqueness IS the dedup mechanism: uploading the same file twice for one purpose resolves to this row. The same bytes uploaded for another purpose are another object in another bucket, and another row.';


--
-- Name: COLUMN catalogue_images.path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.catalogue_images.path IS 'Object key in the public bucket of this entry''s purpose, <sha256>.<ext>. Never changes for a given row, and no object is ever overwritten. UNIQUE within a purpose, because each purpose''s bucket is its own namespace.';


--
-- Name: COLUMN catalogue_images.purpose; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.catalogue_images.purpose IS 'What this picture is for, which decides the bucket its object lives in and the exact size it was cropped to. Set once, when the entry is created, and never changed: a replace creates an entry of the same purpose. A product may link only a ''product'' entry (apply_product_image_path refuses anything else), a Library cover only a ''library_cover'' one (apply_library_cover_path), and a landing page only ''landing_image'' ones (apply_landing_image_paths). An UPDATE changing it is refused by trg_catalogue_images_purpose_is_fixed.';


--
-- Name: CONSTRAINT chk_catalogue_images_path_matches_sha256 ON catalogue_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT chk_catalogue_images_path_matches_sha256 ON public.catalogue_images IS 'The object key is the hash plus a stored extension and nothing else. Uploads are JPEG only (the accept list in src/services/catalogue-images/catalogue-images.contracts.ts, where jpeg is normalised to jpg before anything is stored), so jpg is the only extension a new row gets; png, webp and avif stay admitted for entries uploaded before that. Widening the accept list means widening this list in the same change, or an upload the route accepts is a row this constraint refuses after the bytes are already in the bucket. The pattern is built by concatenating the sha256 column into a regex, which is only safe because chk_catalogue_images_sha256_is_a_hash guarantees that column holds no regex metacharacters — relax that constraint and this one silently becomes a wildcard.';


--
-- Name: CONSTRAINT chk_catalogue_images_sha256_is_a_hash ON catalogue_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT chk_catalogue_images_sha256_is_a_hash ON public.catalogue_images IS 'Lowercase hex, exactly 64 characters. The column IS the identity of a picture, so a value that is not a hash is a row that can never be found again by the bytes it claims to name.';


--
-- Name: catalogue_images catalogue_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogue_images
    ADD CONSTRAINT catalogue_images_pkey PRIMARY KEY (id);


--
-- Name: catalogue_images catalogue_images_purpose_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogue_images
    ADD CONSTRAINT catalogue_images_purpose_path_key UNIQUE (purpose, path);


--
-- Name: catalogue_images catalogue_images_purpose_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.catalogue_images
    ADD CONSTRAINT catalogue_images_purpose_sha256_key UNIQUE (purpose, sha256);


--
-- Name: catalogue_images trg_catalogue_images_purpose_is_fixed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_catalogue_images_purpose_is_fixed BEFORE UPDATE ON public.catalogue_images FOR EACH ROW EXECUTE FUNCTION public.refuse_catalogue_image_purpose_change();


--
-- Name: catalogue_images trg_catalogue_images_unlink_landing_pages; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_catalogue_images_unlink_landing_pages BEFORE DELETE ON public.catalogue_images FOR EACH ROW EXECUTE FUNCTION public.unlink_removed_landing_image();


--
-- Name: catalogue_images admin_full_access_catalogue_images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_catalogue_images ON public.catalogue_images TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: catalogue_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.catalogue_images ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE catalogue_images; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.catalogue_images TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.catalogue_images TO service_role;


