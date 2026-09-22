--
-- Name: product_gamer_photo_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_gamer_photo_consents (
    product_id uuid NOT NULL,
    consent_type public.gamer_photo_consent_type NOT NULL
);


--
-- Name: TABLE product_gamer_photo_consents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_gamer_photo_consents IS 'The admin-picked set: which photo consents a product''s signup panel ASKS a parent about, and — downstream — which products show a gedu the roster''s photo permissions at all. Empty for almost every product; the Roblox Programme delivered with Lynx Educate is what this exists for. A row here is an ask and never a requirement: declining is a complete answer and the seat is unaffected, which is the whole line between this table and product_required_consents (00210). The question is PUT only when the selected participant is a gamer — a parent taking an adult seat is not a subject this consent can have. Written only by admin_set_product_gamer_photo_consents; no Data API role holds a write grant, so the join table has exactly one writer. Readable through the product''s own read predicate, exactly as product_prices, schedule_slots, product_required_consents and product_marketing_consents are, because the shop has to tell a stranger what signing up would ask them. ON DELETE CASCADE from products: an ask is a property of a product and means nothing without it.';


--
-- Name: COLUMN product_gamer_photo_consents.consent_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_gamer_photo_consents.consent_type IS 'Which permission the panel asks for. The consent itself is held on the GAMER and not on the enrolment, so a child asked about on two products has one answer — this column decides whether the question is PUT, never where the answer is stored.';


--
-- Name: product_gamer_photo_consents product_gamer_photo_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_gamer_photo_consents
    ADD CONSTRAINT product_gamer_photo_consents_pkey PRIMARY KEY (product_id, consent_type);


--
-- Name: product_gamer_photo_consents product_gamer_photo_consents_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_gamer_photo_consents
    ADD CONSTRAINT product_gamer_photo_consents_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_gamer_photo_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_gamer_photo_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: product_gamer_photo_consents read_product_gamer_photo_consents_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_product_gamer_photo_consents_via_product ON public.product_gamer_photo_consents FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


--
-- Name: TABLE product_gamer_photo_consents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_gamer_photo_consents TO anon;
GRANT SELECT ON TABLE public.product_gamer_photo_consents TO authenticated;
GRANT ALL ON TABLE public.product_gamer_photo_consents TO service_role;


