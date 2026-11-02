--
-- Name: product_marketing_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_marketing_consents (
    product_id uuid NOT NULL,
    consent_type public.marketing_consent_type NOT NULL
);


--
-- Name: TABLE product_marketing_consents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_marketing_consents IS 'The admin-picked set: which marketing consents a product''s signup panel ASKS a parent about. Empty for most products. A row here is an ask and never a requirement: declining is a complete answer and the seat is unaffected, which is the whole line between this table and product_required_consents. A lynx_educate answer is recorded account-wide by set_marketing_consent; a school_of_gaming answer is recorded on the booking it was given with (bookings.school_of_gaming_marketing_opt_in) and goes to Klaviyo, which owns School of Gaming''s mailing consent. Written only by admin_set_product_marketing_consents; no Data API role holds a write grant, so the join table has exactly one writer. Readable through the product''s own read predicate, exactly as product_prices, schedule_slots and product_required_consents are, because the shop has to tell a stranger what signing up would ask them. ON DELETE CASCADE from products: an ask is a property of a product and means nothing without it.';


--
-- Name: COLUMN product_marketing_consents.consent_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_marketing_consents.consent_type IS 'Which permission the panel asks for. This column decides whether the question is PUT, never where the answer is stored: a lynx_educate consent is account-level, so a parent who already answered on another product is asked once and their existing answer stands; a school_of_gaming answer is asked with every booking and stored on that seat.';


--
-- Name: product_marketing_consents product_marketing_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_marketing_consents
    ADD CONSTRAINT product_marketing_consents_pkey PRIMARY KEY (product_id, consent_type);


--
-- Name: product_marketing_consents product_marketing_consents_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_marketing_consents
    ADD CONSTRAINT product_marketing_consents_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_marketing_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_marketing_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: product_marketing_consents read_product_marketing_consents_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_product_marketing_consents_via_product ON public.product_marketing_consents FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


--
-- Name: TABLE product_marketing_consents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_marketing_consents TO anon;
GRANT SELECT ON TABLE public.product_marketing_consents TO authenticated;
GRANT ALL ON TABLE public.product_marketing_consents TO service_role;


