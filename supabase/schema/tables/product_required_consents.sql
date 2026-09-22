--
-- Name: product_required_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_required_consents (
    product_id uuid NOT NULL,
    document_slug text NOT NULL
);


--
-- Name: TABLE product_required_consents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_required_consents IS 'The admin-picked set: which consent documents a parent must agree to before enrolling on this product. Empty for almost every product — the Roblox programme is what this exists for. Written only by set_product_required_consents, which create_product and update_product both call; no Data API role holds a write grant, so the join table has exactly one writer. Readable through the product''s own read predicate, exactly as product_prices and schedule_slots are, because the shop has to tell a stranger what enrolling would commit them to. ON DELETE CASCADE from products: a requirement is a property of a product and means nothing without it. NO cascade from consent_documents, deliberately — a slug that products still require must not be deletable out from under them.';


--
-- Name: COLUMN product_required_consents.document_slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_required_consents.document_slug IS 'The DOCUMENT, never a version. Which version a parent actually agreed to is resolved at the moment of enrolment and stored on the acceptance row, so a republished document reaches every product that requires it without a single row changing here.';


--
-- Name: product_required_consents product_required_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_required_consents
    ADD CONSTRAINT product_required_consents_pkey PRIMARY KEY (product_id, document_slug);


--
-- Name: product_required_consents product_required_consents_document_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_required_consents
    ADD CONSTRAINT product_required_consents_document_slug_fkey FOREIGN KEY (document_slug) REFERENCES public.consent_documents(slug);


--
-- Name: product_required_consents product_required_consents_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_required_consents
    ADD CONSTRAINT product_required_consents_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_required_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_required_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: product_required_consents read_product_required_consents_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_product_required_consents_via_product ON public.product_required_consents FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


--
-- Name: TABLE product_required_consents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_required_consents TO anon;
GRANT SELECT ON TABLE public.product_required_consents TO authenticated;
GRANT ALL ON TABLE public.product_required_consents TO service_role;


