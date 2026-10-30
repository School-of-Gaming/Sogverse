--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    purchase_shape text,
    currency text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    school_of_gaming_marketing_opt_in boolean,
    status public.booking_status DEFAULT 'pending'::public.booking_status NOT NULL,
    stripe_checkout_session_id text,
    checkout_closes_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    settled_at timestamp with time zone,
    CONSTRAINT chk_bookings_currency CHECK ((currency = ANY (ARRAY['eur'::text, 'gbp'::text, 'usd'::text]))),
    CONSTRAINT chk_bookings_purchase_shape CHECK ((purchase_shape = ANY (ARRAY['subscription_monthly'::text, 'single_payment'::text, 'free'::text, 'external'::text]))),
    CONSTRAINT chk_bookings_shape_iff_currency CHECK (((purchase_shape IS NULL) = (currency IS NULL)))
);


--
-- Name: TABLE bookings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bookings IS 'One row per request a family made for a place on a product: who, what, the purchase shape, the currency and the answers they gave. Written by create_booking and join_waitlist; confirm_booking turns one into a seat. A pending booking holds no seat, because count_active_seats reads participations alone, so this is not a pre-payment hold: it blocks nothing and no job cleans one up. Abandoned is derived when read: pending AND (stripe_checkout_session_id IS NULL OR checkout_closes_at < now()). That label is for display only for the first 3 days after checkout_closes_at, because a Session that completed while the webhook was failing stays pending until Stripe redelivers it. Abandoned bookings are kept as booking history for support, and a booking goes only when its account or product does (ON DELETE CASCADE). Its status records whether the request has finished processing and says nothing about a seat: seat state lives only on participations, and nothing counts seats from this table. Read by the parent who booked; a gamer has no policy.';


--
-- Name: COLUMN bookings.product_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.product_id IS 'The product requested. A seat an admin later moves keeps its booking, so this can differ from the seat''s product_id: the booking records the request.';


--
-- Name: COLUMN bookings.participant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.participant_id IS 'Who the place is for: a gamer, or the customer on an adult''s own seat.';


--
-- Name: COLUMN bookings.customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.customer_id IS 'The parent who booked, and the only reader of the row.';


--
-- Name: COLUMN bookings.purchase_shape; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.purchase_shape IS 'subscription_monthly, single_payment, free or external. NULL exactly on a booking with no purchase in it, which is a waitlist join, and then currency is NULL too (chk_bookings_shape_iff_currency). A paid shape is what a seat''s payment marker reads.';


--
-- Name: COLUMN bookings.currency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.currency IS 'The currency of the purchase. NULL exactly when purchase_shape is.';


--
-- Name: COLUMN bookings.utm_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.utm_source IS 'The utm_source of the visit that led to this booking, or NULL. Written once, by create_booking or join_waitlist, and only when the request carried marketing cookie consent, the same server-side gate the account''s own UTM columns are written under: the routes read the values from the request and clean them with the UTM module''s sanitiser (src/lib/utm.ts) under that gate. Case preserved. Read by the Klaviyo enrolled and waitlisted events through participations.booking_id; a label that grants nothing.';


--
-- Name: COLUMN bookings.utm_medium; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.utm_medium IS 'The utm_medium of the visit that led to this booking, or NULL. Same rules as utm_source.';


--
-- Name: COLUMN bookings.utm_campaign; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.utm_campaign IS 'The utm_campaign of the visit that led to this booking, or NULL. Same rules as utm_source.';


--
-- Name: COLUMN bookings.utm_content; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.utm_content IS 'The utm_content of the visit that led to this booking, or NULL. Same rules as utm_source.';


--
-- Name: COLUMN bookings.utm_term; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.utm_term IS 'The utm_term of the visit that led to this booking, or NULL. Same rules as utm_source.';


--
-- Name: COLUMN bookings.school_of_gaming_marketing_opt_in; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.school_of_gaming_marketing_opt_in IS 'The parent''s answer to the product''s "I want emails from School of Gaming" box: true or false when the product asked (a school_of_gaming row in product_marketing_consents), NULL when it did not. A yes subscribes the parent to School of Gaming''s Klaviyo list once, when the event the seat''s own insert files is sent: enrolled for a seat taken at once, waitlisted for a waitlist join. A later promotion or demotion of the seat does not carry it again, and the answer itself is never an event property. It is never written to marketing_consents, because Klaviyo owns School of Gaming''s mailing consent.';


--
-- Name: COLUMN bookings.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.status IS 'pending, settled or duplicate; see the booking_status type. Set by confirm_booking, or to settled by join_waitlist, which has no money to wait for.';


--
-- Name: COLUMN bookings.stripe_checkout_session_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.stripe_checkout_session_id IS 'The Stripe Checkout Session for this booking, set by the checkout route right after creating it. NULL on a no-charge booking and a waitlist join. confirm_booking refuses a different session from the one stored here.';


--
-- Name: COLUMN bookings.checkout_closes_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.checkout_closes_at IS 'When the Checkout Session stops being payable: its expires_at, reset to now() when the checkout route expires it to replace it.';


--
-- Name: COLUMN bookings.settled_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.settled_at IS 'When the booking left pending.';


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_stripe_checkout_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_stripe_checkout_session_id_key UNIQUE (stripe_checkout_session_id);


--
-- Name: idx_bookings_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_customer ON public.bookings USING btree (customer_id);


--
-- Name: idx_bookings_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_participant ON public.bookings USING btree (participant_id);


--
-- Name: idx_bookings_product_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_product_participant ON public.bookings USING btree (product_id, participant_id);


--
-- Name: bookings bookings_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings customer_select_own_bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_select_own_bookings ON public.bookings FOR SELECT TO authenticated USING ((customer_id = ( SELECT auth.uid() AS uid)));


--
-- Name: TABLE bookings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.bookings TO service_role;
GRANT SELECT ON TABLE public.bookings TO authenticated;


