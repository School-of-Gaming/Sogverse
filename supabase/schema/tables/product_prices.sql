--
-- Name: product_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_prices (
    product_id uuid NOT NULL,
    currency text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    price_cents integer NOT NULL,
    CONSTRAINT product_prices_currency_check CHECK ((currency = ANY (ARRAY['eur'::text, 'gbp'::text, 'usd'::text]))),
    CONSTRAINT product_prices_price_cents_check CHECK ((price_cents >= 0))
);


--
-- Name: product_prices product_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_pkey PRIMARY KEY (product_id, currency);


--
-- Name: product_prices product_prices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_prices_updated_at BEFORE UPDATE ON public.product_prices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_prices product_prices_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_prices admin_full_access_product_prices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_prices ON public.product_prices TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: product_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: product_prices read_product_prices_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_product_prices_via_product ON public.product_prices FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


--
-- Name: TABLE product_prices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_prices TO anon;
GRANT ALL ON TABLE public.product_prices TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_prices TO authenticated;


