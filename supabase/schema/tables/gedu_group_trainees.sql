--
-- Name: gedu_group_trainees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gedu_group_trainees (
    group_id uuid NOT NULL,
    gedu_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE gedu_group_trainees; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gedu_group_trainees IS 'Trainee seats: a gedu placed on one group to shadow it before they are ready to run one. Shaped like gedu_group_assignments — (group_id, gedu_id, product_id, created_at), one seat per (gedu, product) — so a later reader can treat it as a second source of seats. Deliberately NOT a value of gedu_group_assignments.role: every staff gate reads that table and treats any row as full staff, so a trainee kept out of it is closed to all of them by default. A trainee is admitted only where a function asks gedu_trains_group: their own workspace and product documents, and their own group''s voice room and chat as a non-moderator. Independent of certification. A gedu holds an assignment or a trainee seat on a product, never both, which a trigger on each table enforces. Written only by apply_group_changes. An admin reads every row and a gedu their own; the group''s assigned gedus learn a trainee''s first name through their workspace document, and no family path reaches this table.';


--
-- Name: gedu_group_trainees gedu_group_trainees_gedu_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_trainees
    ADD CONSTRAINT gedu_group_trainees_gedu_id_product_id_key UNIQUE (gedu_id, product_id);


--
-- Name: gedu_group_trainees gedu_group_trainees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_trainees
    ADD CONSTRAINT gedu_group_trainees_pkey PRIMARY KEY (group_id, gedu_id);


--
-- Name: idx_gedu_group_trainees_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gedu_group_trainees_product ON public.gedu_group_trainees USING btree (product_id);


--
-- Name: gedu_group_trainees trg_validate_gedu_trainee_product; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_gedu_trainee_product BEFORE INSERT OR UPDATE OF group_id, product_id ON public.gedu_group_trainees FOR EACH ROW EXECUTE FUNCTION public.validate_gedu_assignment_product();


--
-- Name: gedu_group_trainees trg_validate_one_gedu_seat_per_product; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_one_gedu_seat_per_product BEFORE INSERT OR UPDATE OF gedu_id, product_id ON public.gedu_group_trainees FOR EACH ROW EXECUTE FUNCTION public.validate_one_gedu_seat_per_product();


--
-- Name: gedu_group_trainees gedu_group_trainees_gedu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_trainees
    ADD CONSTRAINT gedu_group_trainees_gedu_id_fkey FOREIGN KEY (gedu_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: gedu_group_trainees gedu_group_trainees_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_trainees
    ADD CONSTRAINT gedu_group_trainees_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: gedu_group_trainees gedu_group_trainees_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_trainees
    ADD CONSTRAINT gedu_group_trainees_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: gedu_group_trainees admins_read_gedu_group_trainees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_gedu_group_trainees ON public.gedu_group_trainees FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: gedu_group_trainees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gedu_group_trainees ENABLE ROW LEVEL SECURITY;

--
-- Name: gedu_group_trainees gedus_read_own_trainee_seats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedus_read_own_trainee_seats ON public.gedu_group_trainees FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'gedu'::public.user_role) AND (gedu_id = ( SELECT auth.uid() AS uid))));


--
-- Name: TABLE gedu_group_trainees; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gedu_group_trainees TO authenticated;
GRANT ALL ON TABLE public.gedu_group_trainees TO service_role;


