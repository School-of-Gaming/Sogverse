--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    amount_cents integer NOT NULL,
    currency text NOT NULL,
    purpose public.payment_purpose NOT NULL,
    stripe_payment_intent_id text,
    stripe_invoice_id text,
    stripe_event_id text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT payments_currency_check CHECK ((currency = ANY (ARRAY['eur'::text, 'gbp'::text, 'usd'::text])))
);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_stripe_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_stripe_event_id_key UNIQUE (stripe_event_id);


--
-- Name: idx_payments_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_customer ON public.payments USING btree (customer_id);


--
-- Name: idx_payments_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_invoice ON public.payments USING btree (stripe_invoice_id) WHERE (stripe_invoice_id IS NOT NULL);


--
-- Name: idx_payments_payment_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_payment_intent ON public.payments USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);


--
-- Name: payments payments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: payments admin_full_access_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_payments ON public.payments TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: payments customer_select_own_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_select_own_payments ON public.payments FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (customer_id = ( SELECT auth.uid() AS uid))));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.payments TO anon;
GRANT ALL ON TABLE public.payments TO service_role;
GRANT SELECT ON TABLE public.payments TO authenticated;


