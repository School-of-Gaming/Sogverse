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
    participation_id uuid,
    product_id uuid,
    CONSTRAINT payments_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT payments_currency_check CHECK ((currency = ANY (ARRAY['eur'::text, 'gbp'::text, 'usd'::text])))
);


--
-- Name: COLUMN payments.participation_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.participation_id IS 'The seat this payment paid for. Set on a checkout that bought a seat (single_payment, and the first subscription_invoice of a club) and on every club renewal (subscription_invoice, through its family_subscriptions row). NULL on reservation_duplicate, which bought no seat (the seat the family already held is metadata.existingParticipationId); on a checkout that completed after its seat had already ended; on a renewal recorded before seats were kept, whose seat had been deleted; and after the seat is erased (ON DELETE SET NULL: the payment is an accounting record and outlives it).';


--
-- Name: COLUMN payments.product_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.product_id IS 'The product this payment paid for: the seat''s product at the moment it was paid, which a club switch can later move the seat away from. Set on every checkout (single_payment, subscription_invoice, reservation_duplicate) and every renewal. NULL only on a row written before this column whose product could not be recovered — a renewal whose seat had been deleted, or a bundle row carrying no product. ON DELETE RESTRICT: a product money was taken for is not deleted.';


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
-- Name: idx_payments_participation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_participation ON public.payments USING btree (participation_id) WHERE (participation_id IS NOT NULL);


--
-- Name: idx_payments_payment_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_payment_intent ON public.payments USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);


--
-- Name: idx_payments_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_product ON public.payments USING btree (product_id) WHERE (product_id IS NOT NULL);


--
-- Name: payments payments_klaviyo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER payments_klaviyo AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.klaviyo_payment_recorded();


--
-- Name: payments payments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: payments payments_participation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_participation_id_fkey FOREIGN KEY (participation_id) REFERENCES public.participations(id) ON DELETE SET NULL;


--
-- Name: payments payments_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


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


