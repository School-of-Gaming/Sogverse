--
-- Name: voice_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    name text,
    icon text NOT NULL,
    color text NOT NULL,
    is_locked boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT voice_zones_name_check CHECK (((name IS NULL) OR ((char_length(name) >= 1) AND (char_length(name) <= 40))))
);

ALTER TABLE ONLY public.voice_zones REPLICA IDENTITY FULL;


--
-- Name: voice_zones voice_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_zones
    ADD CONSTRAINT voice_zones_pkey PRIMARY KEY (id);


--
-- Name: voice_zones_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voice_zones_group_id_idx ON public.voice_zones USING btree (group_id);


--
-- Name: voice_zones voice_zones_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER voice_zones_updated_at BEFORE UPDATE ON public.voice_zones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: voice_zones voice_zones_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_zones
    ADD CONSTRAINT voice_zones_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: voice_zones voice_zones_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_zones
    ADD CONSTRAINT voice_zones_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: voice_zones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voice_zones ENABLE ROW LEVEL SECURITY;

--
-- Name: voice_zones voice_zones_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_zones_delete ON public.voice_zones FOR DELETE TO authenticated USING (public.is_voice_group_moderator(group_id));


--
-- Name: voice_zones voice_zones_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_zones_insert ON public.voice_zones FOR INSERT TO authenticated WITH CHECK ((public.is_voice_group_moderator(group_id) AND (created_by = ( SELECT auth.uid() AS uid))));


--
-- Name: voice_zones voice_zones_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_zones_select ON public.voice_zones FOR SELECT TO authenticated USING (public.is_voice_group_member(group_id));


--
-- Name: voice_zones voice_zones_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_zones_update ON public.voice_zones FOR UPDATE TO authenticated USING (public.is_voice_group_moderator(group_id)) WITH CHECK (public.is_voice_group_moderator(group_id));


--
-- Name: TABLE voice_zones; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.voice_zones TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.voice_zones TO service_role;


