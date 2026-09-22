--
-- Name: participations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    group_id uuid,
    participant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    status public.participation_status NOT NULL,
    signed_up_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    waitlisted_at timestamp with time zone,
    stripe_checkout_session_id text,
    group_joined_at timestamp with time zone,
    seat_offer_sent_at timestamp with time zone,
    seat_offer_expiry_notified_at timestamp with time zone,
    CONSTRAINT chk_participations_offer_notice_needs_offer CHECK (((seat_offer_expiry_notified_at IS NULL) OR (seat_offer_sent_at IS NOT NULL))),
    CONSTRAINT chk_participations_offer_only_when_waitlisted CHECK (((seat_offer_sent_at IS NULL) OR (status = 'waitlisted'::public.participation_status))),
    CONSTRAINT chk_participations_waitlisted_has_timestamp CHECK (((status <> 'waitlisted'::public.participation_status) OR (waitlisted_at IS NOT NULL)))
);


--
-- Name: TABLE participations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.participations IS 'One row per seat on a product: who holds it, who pays for it, which group they sit in and what state the seat is in. Some of its columns are settled by triggers rather than by any caller, and are therefore invisible at the call site: updated_at is touched on every write, product_id is reconciled against the group''s product by trg_validate_participations_group, and group_joined_at is stamped by trg_participations_stamp_group_joined_at whenever group_id is set, changed or cleared — group_id has at least five writers, including the ON DELETE SET NULL cascade from product_groups, which is why the stamp lives in a trigger and not in an RPC. Do not set group_joined_at by hand.';


--
-- Name: COLUMN participations.participant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.participations.participant_id IS 'The profile occupying this seat: a gamer enrolled by their parent, or — on a product whose audience admits adults — the paying customer themselves (participant_id = customer_id is what a self seat looks like). The column is named for what it means rather than for any one role that fills it.';


--
-- Name: COLUMN participations.stripe_checkout_session_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.participations.stripe_checkout_session_id IS 'Stripe Checkout Session that paid for this seat. NULL for no-charge seats (free, municipality, admin enrollment, waitlist) and for rows predating the create-on-confirmation flow.';


--
-- Name: COLUMN participations.group_joined_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.participations.group_joined_at IS 'When this seat entered its CURRENT group. NULL when the seat holds no group, and only then — the rows that predated the column were backfilled from their own signed_up_at in 00243, which retired 00203''s deliberate refusal to do so. That refusal was argued against the newcomer badge, the column''s only consumer; 00243 answers it on the merits and states the cost, which is that "unknown" and "derived from signup" are no longer distinguishable. Signup is a provable lower bound on the true join — a seat cannot enter a group of a product it does not hold — so a backfilled value can only ever understate how new a member is. A move between two groups of one product RESETS the stamp: the member is new to THAT group, which is the whole claim the newcomer badge makes, and it is also the floor the session register measures its expectations from (00243). Stamped only by trg_participations_stamp_group_joined_at, which is the column''s only ongoing writer — no RPC and no policy-driven UPDATE sets it, because group_id has at least five writers (including the ON DELETE SET NULL cascade from product_groups) and a trigger is the only point that sees all of them.';


--
-- Name: COLUMN participations.seat_offer_sent_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.participations.seat_offer_sent_at IS 'When a seat offer was last sent to this waitlisted family, truncated to milliseconds. NULL on every row that has never been offered a seat and on every row whose offer has been answered — accepting clears it, declining deletes the row, and re-offering after expiry replaces it. Only ever set on a waitlisted row (chk_participations_offer_only_when_waitlisted), which is what lets every status transition treat "clear the offer" as unconditional. Whether the offer is LIVE is derived from this and nothing else: seat_offer_sent_at + interval ''5 days'' > now(). The millisecond truncation is load-bearing rather than cosmetic — the emailed token is signed over this exact instant and compared back through JavaScript, whose Date cannot represent microseconds.';


--
-- Name: COLUMN participations.seat_offer_expiry_notified_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.participations.seat_offer_expiry_notified_at IS 'When staff were emailed that this offer ran out with no answer. Orthogonal to whether the offer is live or expired: it records that a notification happened, not the offer''s standing. Claimed atomically by claim_expired_seat_offer_notifications, whose UPDATE ... WHERE seat_offer_expiry_notified_at IS NULL is what makes the mail exactly-once under concurrency with no lock held across the send. Cleared whenever a fresh offer is stamped, so a re-offer that expires again notifies again.';


--
-- Name: participations participations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participations
    ADD CONSTRAINT participations_pkey PRIMARY KEY (id);


--
-- Name: idx_participations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_active ON public.participations USING btree (product_id) WHERE (status = 'active'::public.participation_status);


--
-- Name: idx_participations_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_customer ON public.participations USING btree (customer_id);


--
-- Name: idx_participations_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_group ON public.participations USING btree (group_id) WHERE (group_id IS NOT NULL);


--
-- Name: idx_participations_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_participant ON public.participations USING btree (participant_id);


--
-- Name: idx_participations_unnotified_seat_offers; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_unnotified_seat_offers ON public.participations USING btree (seat_offer_sent_at) WHERE ((seat_offer_sent_at IS NOT NULL) AND (seat_offer_expiry_notified_at IS NULL));


--
-- Name: idx_participations_waitlisted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participations_waitlisted ON public.participations USING btree (product_id, waitlisted_at) WHERE (status = 'waitlisted'::public.participation_status);


--
-- Name: uq_participations_active_or_waitlisted; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_participations_active_or_waitlisted ON public.participations USING btree (product_id, participant_id) WHERE (status = ANY (ARRAY['active'::public.participation_status, 'waitlisted'::public.participation_status, 'completed'::public.participation_status]));


--
-- Name: uq_participations_checkout_session; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_participations_checkout_session ON public.participations USING btree (stripe_checkout_session_id) WHERE (stripe_checkout_session_id IS NOT NULL);


--
-- Name: participations participations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER participations_updated_at BEFORE UPDATE ON public.participations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: participations trg_participations_refresh_counts_del; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_participations_refresh_counts_del AFTER DELETE ON public.participations FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_product_seat_counts();


--
-- Name: participations trg_participations_refresh_counts_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_participations_refresh_counts_ins AFTER INSERT ON public.participations FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_product_seat_counts();


--
-- Name: participations trg_participations_refresh_counts_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_participations_refresh_counts_upd AFTER UPDATE OF status, product_id ON public.participations FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_product_seat_counts();


--
-- Name: participations trg_participations_stamp_group_joined_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_participations_stamp_group_joined_at BEFORE INSERT OR UPDATE OF group_id ON public.participations FOR EACH ROW EXECUTE FUNCTION public.stamp_participation_group_joined_at();


--
-- Name: participations trg_validate_participations_group; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_participations_group BEFORE INSERT OR UPDATE OF group_id, product_id ON public.participations FOR EACH ROW EXECUTE FUNCTION public.validate_participations_group();


--
-- Name: participations participations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participations
    ADD CONSTRAINT participations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: participations participations_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participations
    ADD CONSTRAINT participations_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE SET NULL;


--
-- Name: participations participations_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participations
    ADD CONSTRAINT participations_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: participations participations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participations
    ADD CONSTRAINT participations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: participations admin_full_access_participations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_participations ON public.participations TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: participations customer_select_own_participations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_select_own_participations ON public.participations FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND (customer_id = ( SELECT auth.uid() AS uid))));


--
-- Name: participations gamer_select_own_participations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gamer_select_own_participations ON public.participations FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'gamer'::public.user_role) AND (participant_id = ( SELECT auth.uid() AS uid))));


--
-- Name: participations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.participations ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE participations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.participations TO anon;
GRANT ALL ON TABLE public.participations TO service_role;
GRANT SELECT ON TABLE public.participations TO authenticated;


