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
    voice_join_instructions text,
    CONSTRAINT product_translations_long_description_check CHECK (((long_description IS NULL) OR (btrim(long_description, ' 	
'::text) <> ''::text))),
    CONSTRAINT product_translations_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT product_translations_voice_join_instructions_check CHECK (((voice_join_instructions IS NULL) OR (voice_join_instructions ~ '[^[:space:]]'::text)))
);


--
-- Name: COLUMN product_translations.voice_join_instructions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_translations.voice_join_instructions IS 'PUBLIC TO EVERYONE, LOGGED-OUT VISITORS INCLUDED. product_translations carries a table-level SELECT grant for anon and its read policy admits the translations of every product, so anybody can read these instructions through the Data API without an account or a seat. That is a KNOWN AND ACCEPTED RISK, decided by the owner: do not write anything here that must stay private. How to join the product''s sessions in this locale when the product''s voice_room_mode is none, as plain text the team writes per locale; NULL where this locale has none, never blank. A reader is shown one locale''s version through the app''s translation picker, like the rest of the row. A product of mode none carries instructions in at least one translation, and a product of any other mode in none — a rule across two tables, held at commit by the deferred constraint triggers trg_products_voice_instructions_iff_no_room and trg_product_translations_voice_instructions_iff_no_room, so a direct write cannot break it either. A STOPGAP like products.external_voice_url, to be removed with the none mode once Sogverse rooms can hold more than 50 people — see docs/investigations/voice-room-scale.md.';


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
-- Name: product_translations trg_product_translations_voice_instructions_iff_no_room; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_product_translations_voice_instructions_iff_no_room AFTER INSERT OR DELETE OR UPDATE OF voice_join_instructions, product_id ON public.product_translations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.ensure_voice_join_instructions_iff_no_voice_room();


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


