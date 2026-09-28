--
-- Name: voice_private_zone_occupants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voice_private_zone_occupants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    zone_id uuid NOT NULL,
    user_id uuid NOT NULL,
    group_id uuid NOT NULL,
    placed_by uuid NOT NULL,
    session_opens_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.voice_private_zone_occupants REPLICA IDENTITY FULL;


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_private_zone_occupants
    ADD CONSTRAINT voice_private_zone_occupants_group_id_user_id_key UNIQUE (group_id, user_id);


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_private_zone_occupants
    ADD CONSTRAINT voice_private_zone_occupants_pkey PRIMARY KEY (id);


--
-- Name: voice_private_zone_occupants_group_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voice_private_zone_occupants_group_id_idx ON public.voice_private_zone_occupants USING btree (group_id);


--
-- Name: voice_private_zone_occupants_zone_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voice_private_zone_occupants_zone_id_idx ON public.voice_private_zone_occupants USING btree (zone_id);


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_private_zone_occupants
    ADD CONSTRAINT voice_private_zone_occupants_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_placed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_private_zone_occupants
    ADD CONSTRAINT voice_private_zone_occupants_placed_by_fkey FOREIGN KEY (placed_by) REFERENCES public.profiles(id);


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_private_zone_occupants
    ADD CONSTRAINT voice_private_zone_occupants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voice_private_zone_occupants
    ADD CONSTRAINT voice_private_zone_occupants_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.voice_zones(id) ON DELETE CASCADE;


--
-- Name: voice_private_zone_occupants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voice_private_zone_occupants ENABLE ROW LEVEL SECURITY;

--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_private_zone_occupants_delete ON public.voice_private_zone_occupants FOR DELETE TO authenticated USING (public.is_voice_group_moderator(group_id));


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_private_zone_occupants_insert ON public.voice_private_zone_occupants FOR INSERT TO authenticated WITH CHECK ((public.is_voice_group_moderator(group_id) AND (placed_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.voice_zones z
  WHERE ((z.id = voice_private_zone_occupants.zone_id) AND (z.group_id = voice_private_zone_occupants.group_id) AND (z.is_locked = true))))));


--
-- Name: voice_private_zone_occupants voice_private_zone_occupants_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY voice_private_zone_occupants_select ON public.voice_private_zone_occupants FOR SELECT TO authenticated USING (public.is_voice_group_member(group_id));


--
-- Name: TABLE voice_private_zone_occupants; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.voice_private_zone_occupants TO authenticated;
GRANT SELECT,INSERT,DELETE ON TABLE public.voice_private_zone_occupants TO service_role;


