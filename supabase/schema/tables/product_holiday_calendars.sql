--
-- Name: product_holiday_calendars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_holiday_calendars (
    product_id uuid NOT NULL,
    calendar_id uuid NOT NULL
);


--
-- Name: TABLE product_holiday_calendars; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_holiday_calendars IS 'The holiday calendars a club follows: every date inside one of their breaks is missing from the club''s plan. Clubs only — consumer_club and municipality_club; a camp or an event has its own dates — which set_product_holiday_calendars enforces. Written only by that function, which create_product and update_product both call; no Data API role holds a write grant. Readable through the product''s own read predicate, exactly as product_required_consents is, because the plan reads it as its caller. ON DELETE CASCADE from products; ON DELETE RESTRICT from holiday_calendars, so a calendar a club follows cannot go out from under it.';


--
-- Name: product_holiday_calendars product_holiday_calendars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_holiday_calendars
    ADD CONSTRAINT product_holiday_calendars_pkey PRIMARY KEY (product_id, calendar_id);


--
-- Name: idx_product_holiday_calendars_calendar; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_holiday_calendars_calendar ON public.product_holiday_calendars USING btree (calendar_id);


--
-- Name: product_holiday_calendars product_holiday_calendars_calendar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_holiday_calendars
    ADD CONSTRAINT product_holiday_calendars_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES public.holiday_calendars(id) ON DELETE RESTRICT;


--
-- Name: product_holiday_calendars product_holiday_calendars_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_holiday_calendars
    ADD CONSTRAINT product_holiday_calendars_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_holiday_calendars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_holiday_calendars ENABLE ROW LEVEL SECURITY;

--
-- Name: product_holiday_calendars read_product_holiday_calendars_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_product_holiday_calendars_via_product ON public.product_holiday_calendars FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


--
-- Name: TABLE product_holiday_calendars; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_holiday_calendars TO anon;
GRANT SELECT ON TABLE public.product_holiday_calendars TO authenticated;
GRANT ALL ON TABLE public.product_holiday_calendars TO service_role;


