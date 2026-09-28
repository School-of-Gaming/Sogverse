--
-- Name: gedu_group_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gedu_group_assignments (
    group_id uuid NOT NULL,
    gedu_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    role public.gedu_assignment_role DEFAULT 'primary'::public.gedu_assignment_role NOT NULL
);


--
-- Name: COLUMN gedu_group_assignments.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_group_assignments.role IS 'Which capacity this educator holds the group in: `primary` or `assistant`. A group holds ANY NUMBER of each — there is deliberately no exactly-one-primary rule, and an `assistant` on a product whose assistant fee is unset is allowed (the fee simply reads as not set wherever a fee is shown, and the admin attention queue goes on treating a missing assistant fee as "no assistant role" rather than as a defect). The ONLY thing the role decides is PAY: products carry a per-session fee for each. Readable wherever assignments already are, parents included through the existing policy, because it is a pay CLASS label and not a figure — the fee columns on `products` are already public. Written only by apply_group_changes, where a role change is one add that upserts this column.';


--
-- Name: gedu_group_assignments gedu_group_assignments_gedu_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_assignments
    ADD CONSTRAINT gedu_group_assignments_gedu_id_product_id_key UNIQUE (gedu_id, product_id);


--
-- Name: gedu_group_assignments gedu_group_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_assignments
    ADD CONSTRAINT gedu_group_assignments_pkey PRIMARY KEY (group_id, gedu_id);


--
-- Name: idx_gedu_group_assignments_gedu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gedu_group_assignments_gedu ON public.gedu_group_assignments USING btree (gedu_id);


--
-- Name: idx_gedu_group_assignments_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gedu_group_assignments_product ON public.gedu_group_assignments USING btree (product_id);


--
-- Name: gedu_group_assignments trg_validate_gedu_assignment_product; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_gedu_assignment_product BEFORE INSERT OR UPDATE OF group_id, product_id ON public.gedu_group_assignments FOR EACH ROW EXECUTE FUNCTION public.validate_gedu_assignment_product();


--
-- Name: gedu_group_assignments gedu_group_assignments_gedu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_assignments
    ADD CONSTRAINT gedu_group_assignments_gedu_id_fkey FOREIGN KEY (gedu_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: gedu_group_assignments gedu_group_assignments_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_assignments
    ADD CONSTRAINT gedu_group_assignments_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.product_groups(id) ON DELETE CASCADE;


--
-- Name: gedu_group_assignments gedu_group_assignments_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_assignments
    ADD CONSTRAINT gedu_group_assignments_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: gedu_group_assignments admin_full_access_gedu_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_gedu_assignments ON public.gedu_group_assignments TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: gedu_group_assignments customers_read_assignments_via_gamers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_assignments_via_gamers ON public.gedu_group_assignments FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND ( SELECT public.has_active_participation_on_product(gedu_group_assignments.product_id) AS has_active_participation_on_product)));


--
-- Name: gedu_group_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gedu_group_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: gedu_group_assignments gedus_read_own_assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedus_read_own_assignments ON public.gedu_group_assignments FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'gedu'::public.user_role) AND (gedu_id = ( SELECT auth.uid() AS uid))));


--
-- Name: TABLE gedu_group_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gedu_group_assignments TO anon;
GRANT ALL ON TABLE public.gedu_group_assignments TO service_role;
GRANT SELECT ON TABLE public.gedu_group_assignments TO authenticated;


