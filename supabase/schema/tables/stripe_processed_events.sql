--
-- Name: stripe_processed_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_processed_events (
    stripe_event_id text NOT NULL,
    event_type text NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE stripe_processed_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stripe_processed_events IS 'One row per Stripe event the products webhook has finished handling: the route checks it before handling an event and writes it after the handler''s last write, so a redelivery of a finished event does nothing and one that died part-way runs again (every write it makes is idempotent on replay; the UNIQUE on payments.stripe_event_id is the net under the payment). Holds only the four event types the route handles, whether or not an event turned out to concern us. Events finished before this table existed were copied in from payments.stripe_event_id, typed from the row''s shape and stamped with its created_at. Service role only.';


--
-- Name: stripe_processed_events stripe_processed_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_processed_events
    ADD CONSTRAINT stripe_processed_events_pkey PRIMARY KEY (stripe_event_id);


--
-- Name: stripe_processed_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stripe_processed_events ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE stripe_processed_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.stripe_processed_events TO service_role;


