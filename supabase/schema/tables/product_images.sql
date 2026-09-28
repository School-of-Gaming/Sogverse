--
-- Name: product_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    sha256 text NOT NULL,
    path text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_product_images_label_length CHECK (((length(label) >= 1) AND (length(label) <= 120))),
    CONSTRAINT chk_product_images_path_matches_sha256 CHECK ((path ~ (('^'::text || sha256) || '\.(jpg|png|webp|avif|svg)$'::text))),
    CONSTRAINT chk_product_images_path_not_empty CHECK ((path <> ''::text)),
    CONSTRAINT chk_product_images_sha256_is_a_hash CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: TABLE product_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_images IS 'The catalogue of pictures admins pick from for a product. One row per distinct image, identified by the sha256 of its bytes; the object key is <sha256>.<ext> in the public product-images bucket. A row is immutable except for its label — the bytes behind a path never change, which is what makes the image optimizer''s one-year cache floor safe. Admin-only: no anon grant and no anon policy, because nothing family-facing reads this table. Products reference it by products.image_id; products.image_path is derived from it by trg_products_apply_image_path and is what every reader still reads.';


--
-- Name: COLUMN product_images.sha256; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_images.sha256 IS 'Lowercase hex sha256 of the stored bytes. UNIQUE, and that uniqueness IS the dedup mechanism: uploading the same file twice resolves to this row.';


--
-- Name: COLUMN product_images.path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_images.path IS 'Object key in the public product-images bucket, <sha256>.<ext>. Never changes for a given row, and no object is ever overwritten.';


--
-- Name: CONSTRAINT chk_product_images_path_matches_sha256 ON product_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT chk_product_images_path_matches_sha256 ON public.product_images IS 'The object key is the hash plus a stored extension and nothing else. The extension list is the accept list in src/services/product-images/product-images.contracts.ts minus jpeg, which is accepted on upload and normalised to jpg before anything is stored — the two lists must be widened in the same change or an upload the route accepts is a row this constraint refuses after the bytes are already in the bucket. The pattern is built by concatenating the sha256 column into a regex, which is only safe because chk_product_images_sha256_is_a_hash guarantees that column holds no regex metacharacters — relax that constraint and this one silently becomes a wildcard.';


--
-- Name: CONSTRAINT chk_product_images_sha256_is_a_hash ON product_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT chk_product_images_sha256_is_a_hash ON public.product_images IS 'Lowercase hex, exactly 64 characters. The column IS the identity of a picture, so a value that is not a hash is a row that can never be found again by the bytes it claims to name.';


--
-- Name: product_images product_images_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_path_key UNIQUE (path);


--
-- Name: product_images product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_pkey PRIMARY KEY (id);


--
-- Name: product_images product_images_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_sha256_key UNIQUE (sha256);


--
-- Name: product_images admin_full_access_product_images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_images ON public.product_images TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: product_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE product_images; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_images TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_images TO service_role;


