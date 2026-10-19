--
-- Name: holiday_calendars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holiday_calendars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_holiday_calendars_name_present CHECK ((btrim(name) <> ''::text))
);


--
-- Name: TABLE holiday_calendars; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.holiday_calendars IS 'A named list of holiday breaks a club can follow — a school''s or a municipality''s term holidays, say — lasting across years. The name is the admin''s handle for it and is shown to nobody else: families read the breaks of a calendar their club follows, and each break''s own names, never this row. Admin-only: SELECT for authenticated behind an admin policy, nothing for anon, and no write grant at all — the only writers are create_holiday_calendar and update_holiday_calendar. Never deleted: a calendar a club no longer wants is detached from it, and the link from product_holiday_calendars is ON DELETE RESTRICT.';


--
-- Name: COLUMN holiday_calendars.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.holiday_calendars.name IS 'The admin''s name for the calendar. Unique ignoring case and surrounding space, because two calendars an admin cannot tell apart in a picker are one calendar too many.';


--
-- Name: holiday_calendars holiday_calendars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holiday_calendars
    ADD CONSTRAINT holiday_calendars_pkey PRIMARY KEY (id);


--
-- Name: holiday_calendars_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX holiday_calendars_name_key ON public.holiday_calendars USING btree (lower(btrim(name)));


--
-- Name: holiday_calendars holiday_calendars_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER holiday_calendars_updated_at BEFORE UPDATE ON public.holiday_calendars FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: holiday_calendars admins_read_holiday_calendars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_holiday_calendars ON public.holiday_calendars FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: holiday_calendars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.holiday_calendars ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE holiday_calendars; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.holiday_calendars TO authenticated;
GRANT ALL ON TABLE public.holiday_calendars TO service_role;


