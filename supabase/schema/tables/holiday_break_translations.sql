--
-- Name: holiday_break_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holiday_break_translations (
    break_id uuid NOT NULL,
    locale text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_holiday_break_translations_name_present CHECK ((btrim(name) <> ''::text))
);


--
-- Name: TABLE holiday_break_translations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.holiday_break_translations IS 'A holiday break''s name in one locale — "Autumn break", "Syysloma" — one row per break per locale, as product_translations is for a product. Every break has at least one: the writers refuse a break with none. Readable exactly where its break is.';


--
-- Name: holiday_break_translations holiday_break_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holiday_break_translations
    ADD CONSTRAINT holiday_break_translations_pkey PRIMARY KEY (break_id, locale);


--
-- Name: holiday_break_translations holiday_break_translations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER holiday_break_translations_updated_at BEFORE UPDATE ON public.holiday_break_translations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: holiday_break_translations holiday_break_translations_break_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holiday_break_translations
    ADD CONSTRAINT holiday_break_translations_break_id_fkey FOREIGN KEY (break_id) REFERENCES public.holiday_breaks(id) ON DELETE CASCADE;


--
-- Name: holiday_break_translations admins_read_holiday_break_translations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_holiday_break_translations ON public.holiday_break_translations FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: holiday_break_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.holiday_break_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: holiday_break_translations read_holiday_break_translations_of_followed_calendars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_holiday_break_translations_of_followed_calendars ON public.holiday_break_translations FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM (public.holiday_breaks b
     JOIN public.product_holiday_calendars phc ON ((phc.calendar_id = b.calendar_id)))
  WHERE (b.id = holiday_break_translations.break_id))));


--
-- Name: TABLE holiday_break_translations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.holiday_break_translations TO anon;
GRANT SELECT ON TABLE public.holiday_break_translations TO authenticated;
GRANT ALL ON TABLE public.holiday_break_translations TO service_role;


