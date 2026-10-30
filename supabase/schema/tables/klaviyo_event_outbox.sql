--
-- Name: klaviyo_event_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.klaviyo_event_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind public.klaviyo_event_kind NOT NULL,
    source_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    product_id uuid,
    occurred_at timestamp with time zone NOT NULL,
    facts jsonb DEFAULT '{}'::jsonb NOT NULL,
    enqueued_at timestamp with time zone DEFAULT now() NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    leased_until timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    unique_id text NOT NULL,
    CONSTRAINT klaviyo_event_outbox_attempts_nonnegative CHECK ((attempts >= 0)),
    CONSTRAINT klaviyo_event_outbox_facts_object CHECK ((jsonb_typeof(facts) = 'object'::text))
);


--
-- Name: TABLE klaviyo_event_outbox; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.klaviyo_event_outbox IS 'Things that happened to a parent that Klaviyo has not yet been told as events: one row per Klaviyo unique id, filed by enqueue_klaviyo_event from the triggers that see them happen, and deleted by finish_klaviyo_event_job once sent. An event is a fact about a moment, so its row records that moment''s facts when it is filed and never changes; filing the same unique id again while it waits does nothing, and Klaviyo''s own deduplication on the unique id absorbs one filed again after it was sent. No foreign keys: the source row may be gone by the time the event is sent (a cancelled seat), and the event still happened. A parent''s waiting events are deleted with the parent, because an event about somebody Klaviyo is about to forget is pointless. Leased, backed off and parked exactly as klaviyo_profile_outbox is. Service role only; RLS on with no policy.';


--
-- Name: COLUMN klaviyo_event_outbox.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.klaviyo_event_outbox.id IS 'The outbox row''s own id, which claim_klaviyo_event_jobs hands out and get_klaviyo_events and finish_klaviyo_event_job take.';


--
-- Name: COLUMN klaviyo_event_outbox.source_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.klaviyo_event_outbox.source_id IS 'The row the event is about: the parent''s profile id for account_created, a participation for enrolled, waitlisted and seat_offered, a family subscription for subscription_cancelled, a session_attendance row for session.';


--
-- Name: COLUMN klaviyo_event_outbox.customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.klaviyo_event_outbox.customer_id IS 'The parent the event happened to. Not a foreign key; the parent''s delete deletes the row.';


--
-- Name: COLUMN klaviyo_event_outbox.product_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.klaviyo_event_outbox.product_id IS 'The product the event concerns, when one does — read when it was filed. Not a foreign key: a product deleted since leaves the event without one.';


--
-- Name: COLUMN klaviyo_event_outbox.occurred_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.klaviyo_event_outbox.occurred_at IS 'When it happened, taken from the source row: the profile''s creation, the participation''s activation, waitlisting or seat offer, the subscription''s update, the attendance mark''s recorded_at.';


--
-- Name: COLUMN klaviyo_event_outbox.facts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.klaviyo_event_outbox.facts IS 'The facts of the moment, as they stood when the event was filed. enrolled: seat_holder (parent or gamer), gamer_birth_year and gamer_gender (null on a parent''s own seat), the seat''s utm_source, utm_medium, utm_campaign, utm_content, utm_term and marketing_opt_in (its school_of_gaming_marketing_opt_in on the booking itself, null on every later activation). session: attended, session_date, session_starts_at, and the same seat_holder, gamer_birth_year and gamer_gender. subscription_cancelled: the subscription''s status and current_period_end. waitlisted: the row''s utm_source, utm_medium, utm_campaign, utm_content, utm_term and marketing_opt_in (its school_of_gaming_marketing_opt_in on the waitlist join itself, null when a seat is demoted onto the waitlist). Empty for account_created and seat_offered.';


--
-- Name: COLUMN klaviyo_event_outbox.unique_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.klaviyo_event_outbox.unique_id IS 'Klaviyo''s unique id for the event, which it deduplicates on: `<kind>:<source id>` for every kind but session, whose id is `session:<session id>:<participant id>:<status>` so that a mark corrected to another status is a second event.';


--
-- Name: klaviyo_event_outbox klaviyo_event_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.klaviyo_event_outbox
    ADD CONSTRAINT klaviyo_event_outbox_pkey PRIMARY KEY (id);


--
-- Name: klaviyo_event_outbox klaviyo_event_outbox_unique_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.klaviyo_event_outbox
    ADD CONSTRAINT klaviyo_event_outbox_unique_id_key UNIQUE (unique_id);


--
-- Name: klaviyo_event_outbox_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX klaviyo_event_outbox_customer_id_idx ON public.klaviyo_event_outbox USING btree (customer_id);


--
-- Name: klaviyo_event_outbox_next_attempt_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX klaviyo_event_outbox_next_attempt_at_idx ON public.klaviyo_event_outbox USING btree (next_attempt_at);


--
-- Name: klaviyo_event_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.klaviyo_event_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE klaviyo_event_outbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.klaviyo_event_outbox TO service_role;


