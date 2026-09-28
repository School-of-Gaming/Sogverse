--
-- Name: product_subscription_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_subscription_prices (
    product_id uuid NOT NULL,
    currency text NOT NULL,
    stripe_price_id text NOT NULL,
    unit_amount_cents integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_subscription_prices_currency_check CHECK ((currency = ANY (ARRAY['eur'::text, 'gbp'::text, 'usd'::text]))),
    CONSTRAINT product_subscription_prices_unit_amount_cents_check CHECK ((unit_amount_cents >= 0))
);


--
-- Name: product_subscription_prices product_subscription_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_subscription_prices
    ADD CONSTRAINT product_subscription_prices_pkey PRIMARY KEY (product_id, currency);


--
-- Name: product_subscription_prices product_subscription_prices_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_subscription_prices
    ADD CONSTRAINT product_subscription_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_subscription_prices admin_full_access_product_subscription_prices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_subscription_prices ON public.product_subscription_prices TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: product_subscription_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_subscription_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE product_subscription_prices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_subscription_prices TO anon;
GRANT ALL ON TABLE public.product_subscription_prices TO service_role;


