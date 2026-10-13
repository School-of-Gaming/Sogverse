--
-- Name: holiday_breaks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holiday_breaks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    calendar_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_holiday_breaks_end_not_before_start CHECK ((end_date >= start_date))
);


--
-- Name: TABLE holiday_breaks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.holiday_breaks IS 'One break of a holiday calendar: every date from start_date to end_date, both inclusive, is a holiday for each club following the calendar. The dates are bare calendar dates, read in each product''s own zone, so one calendar serves clubs in different zones. Breaks of one calendar never overlap — the writers refuse it, there being no btree_gist for an exclusion constraint — while breaks of two calendars may, and a club following both is off on their union. No length limit, by owner decision. Readable by anyone, anon included, for a calendar some product follows, and by an admin for every calendar: planned_session_dates reads them as its caller, and the dates a club does not meet are as public as the dates it does. No write grant; written only by the calendar writers.';


--
-- Name: holiday_breaks holiday_breaks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holiday_breaks
    ADD CONSTRAINT holiday_breaks_pkey PRIMARY KEY (id);


--
-- Name: idx_holiday_breaks_calendar_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_holiday_breaks_calendar_start ON public.holiday_breaks USING btree (calendar_id, start_date);


--
-- Name: holiday_breaks holiday_breaks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER holiday_breaks_updated_at BEFORE UPDATE ON public.holiday_breaks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: holiday_breaks holiday_breaks_calendar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holiday_breaks
    ADD CONSTRAINT holiday_breaks_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES public.holiday_calendars(id) ON DELETE CASCADE;


--
-- Name: holiday_breaks admins_read_holiday_breaks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_holiday_breaks ON public.holiday_breaks FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: holiday_breaks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.holiday_breaks ENABLE ROW LEVEL SECURITY;

--
-- Name: holiday_breaks read_holiday_breaks_of_followed_calendars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_holiday_breaks_of_followed_calendars ON public.holiday_breaks FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.product_holiday_calendars phc
  WHERE (phc.calendar_id = holiday_breaks.calendar_id))));


--
-- Name: TABLE holiday_breaks; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.holiday_breaks TO anon;
GRANT SELECT ON TABLE public.holiday_breaks TO authenticated;
GRANT ALL ON TABLE public.holiday_breaks TO service_role;


