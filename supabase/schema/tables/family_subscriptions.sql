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
    ended_at timestamp with time zone,
    CONSTRAINT chk_family_subscriptions_ended_is_cancelled CHECK (((ended_at IS NULL) OR (status = 'cancelled'::text))),
    CONSTRAINT family_subscriptions_currency_check CHECK ((currency = ANY (ARRAY['eur'::text, 'gbp'::text, 'usd'::text]))),
    CONSTRAINT family_subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'past_due'::text, 'cancelled'::text, 'incomplete'::text, 'canceling'::text])))
);


--
-- Name: COLUMN family_subscriptions.ended_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.family_subscriptions.ended_at IS 'When this subscription ended together with its seat, set by end_participation alongside status cancelled (chk_family_subscriptions_ended_is_cancelled). A row with it set is terminal: trg_family_subscriptions_ended_is_terminal refuses any update moving it off cancelled or changing the stamp, so a late Stripe event cannot revive it. NULL on every other row, including a cancelled one whose seat is still held — a subscription Stripe gave up on after failed payments is stored cancelled while its seat lives on until an admin removes it, and that row stays updatable.';


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
-- Name: family_subscriptions family_subscriptions_klaviyo_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER family_subscriptions_klaviyo_changed AFTER UPDATE OF status, current_period_end ON public.family_subscriptions FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) OR (old.current_period_end IS DISTINCT FROM new.current_period_end))) EXECUTE FUNCTION public.klaviyo_family_subscription_changed();


--
-- Name: family_subscriptions family_subscriptions_klaviyo_written; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER family_subscriptions_klaviyo_written AFTER INSERT OR DELETE ON public.family_subscriptions FOR EACH ROW EXECUTE FUNCTION public.klaviyo_family_subscription_changed();


--
-- Name: family_subscriptions family_subscriptions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER family_subscriptions_updated_at BEFORE UPDATE ON public.family_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: family_subscriptions trg_family_subscriptions_ended_is_terminal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_family_subscriptions_ended_is_terminal BEFORE UPDATE ON public.family_subscriptions FOR EACH ROW EXECUTE FUNCTION public.family_subscription_ended_is_terminal();


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


