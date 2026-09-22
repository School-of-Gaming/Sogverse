--
-- Name: product_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_translations (
    product_id uuid NOT NULL,
    locale text NOT NULL,
    name text NOT NULL,
    short_description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    long_description text,
    CONSTRAINT product_translations_long_description_check CHECK (((long_description IS NULL) OR (btrim(long_description, ' 	
'::text) <> ''::text))),
    CONSTRAINT product_translations_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0))
);


--
-- Name: product_translations product_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_translations
    ADD CONSTRAINT product_translations_pkey PRIMARY KEY (product_id, locale);


--
-- Name: idx_product_translations_locale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_translations_locale ON public.product_translations USING btree (locale);


--
-- Name: product_translations product_translations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_translations_updated_at BEFORE UPDATE ON public.product_translations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_translations trg_ensure_product_keeps_at_least_one_translation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ensure_product_keeps_at_least_one_translation BEFORE DELETE ON public.product_translations FOR EACH ROW EXECUTE FUNCTION public.ensure_product_keeps_at_least_one_translation();


--
-- Name: product_translations product_translations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_translations
    ADD CONSTRAINT product_translations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_translations admin_full_access_product_translations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_translations ON public.product_translations TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: product_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: product_translations read_product_translations_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_product_translations_via_product ON public.product_translations FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


--
-- Name: TABLE product_translations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_translations TO anon;
GRANT ALL ON TABLE public.product_translations TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_translations TO authenticated;


