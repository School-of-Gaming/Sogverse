--
-- Name: family_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.family_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    stripe_subscription_id text NOT NULL,
    stripe_customer_id text NOT NULL,
    currency text NOT NULL,
    status text NOT NULL,
    current_period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    participation_id uuid NOT NULL,
    stripe_price_id text,
    CONSTRAINT family_subscriptions_currency_check CHECK ((currency = ANY (ARRAY['eur'::text, 'gbp'::text, 'usd'::text]))),
    CONSTRAINT family_subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'past_due'::text, 'cancelled'::text, 'incomplete'::text, 'canceling'::text])))
);


--
-- Name: family_subscriptions family_subscriptions_participation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_subscriptions
    ADD CONSTRAINT family_subscriptions_participation_id_key UNIQUE (participation_id);


--
-- Name: family_subscriptions family_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_subscriptions
    ADD CONSTRAINT family_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: family_subscriptions family_subscriptions_stripe_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_subscriptions
    ADD CONSTRAINT family_subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);


--
-- Name: idx_family_subscriptions_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_family_subscriptions_customer ON public.family_subscriptions USING btree (customer_id);


--
-- Name: idx_family_subscriptions_participation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_family_subscriptions_participation ON public.family_subscriptions USING btree (participation_id);


--
-- Name: family_subscriptions family_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER family_subscriptions_updated_at BEFORE UPDATE ON public.family_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: family_subscriptions family_subscriptions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_subscriptions
    ADD CONSTRAINT family_subscriptions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: family_subscriptions family_subscriptions_participation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.family_subscriptions
    ADD CONSTRAINT family_subscriptions_participation_id_fkey FOREIGN KEY (participation_id) REFERENCES public.participations(id) ON DELETE CASCADE;


--
-- Name: family_subscriptions admin_full_access_family_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_family_subscriptions ON public.family_subscriptions TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: family_subscriptions customer_select_own_family_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_select_own_family_subscriptions ON public.family_subscriptions FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (customer_id = ( SELECT auth.uid() AS uid))));


--
-- Name: family_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.family_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE family_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.family_subscriptions TO anon;
GRANT ALL ON TABLE public.family_subscriptions TO service_role;
GRANT SELECT ON TABLE public.family_subscriptions TO authenticated;


