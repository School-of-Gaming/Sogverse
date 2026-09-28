--
-- Name: schedule_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    weekday smallint NOT NULL,
    start_time time without time zone NOT NULL,
    duration_minutes integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT schedule_slots_duration_minutes_check CHECK ((duration_minutes > 0)),
    CONSTRAINT schedule_slots_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);


--
-- Name: COLUMN schedule_slots.weekday; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.schedule_slots.weekday IS '0=Monday .. 6=Sunday (ISO-style, matches products-redesign.md §4.2).';


--
-- Name: schedule_slots schedule_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_slots
    ADD CONSTRAINT schedule_slots_pkey PRIMARY KEY (id);


--
-- Name: schedule_slots schedule_slots_product_id_weekday_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_slots
    ADD CONSTRAINT schedule_slots_product_id_weekday_key UNIQUE (product_id, weekday);


--
-- Name: idx_schedule_slots_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_slots_product ON public.schedule_slots USING btree (product_id);


--
-- Name: schedule_slots schedule_slots_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER schedule_slots_updated_at BEFORE UPDATE ON public.schedule_slots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: schedule_slots schedule_slots_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_slots
    ADD CONSTRAINT schedule_slots_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: schedule_slots admin_full_access_schedule_slots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_schedule_slots ON public.schedule_slots TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: schedule_slots read_schedule_slots_via_product; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY read_schedule_slots_via_product ON public.schedule_slots FOR SELECT TO authenticated, anon USING (public.can_read_product(product_id));


--
-- Name: schedule_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedule_slots ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE schedule_slots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.schedule_slots TO anon;
GRANT ALL ON TABLE public.schedule_slots TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.schedule_slots TO authenticated;


