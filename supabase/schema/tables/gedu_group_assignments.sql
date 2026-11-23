--
-- Name: gedu_group_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gedu_group_assignments (
    group_id uuid NOT NULL,
    gedu_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    role public.gedu_assignment_role DEFAULT 'primary'::public.gedu_assignment_role NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    CONSTRAINT chk_gedu_group_assignments_ends_after_start CHECK (((ended_at IS NULL) OR (ended_at > started_at)))
);


--
-- Name: TABLE gedu_group_assignments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gedu_group_assignments IS 'Who staffs a group, as PERIODS: a row is one gedu holding one group in one role from started_at until ended_at, and ended_at is NULL while the period is current. A session belongs to the period containing its start instant, [started_at, ended_at), for planned and stored sessions alike — group_assignments_at is that rule and group_session_starts_at the start it is applied to. A row is never deleted to take a gedu off a group: removing them ends the period, adding them again starts a new row, and the gap between belongs to neither. A role change ends one period and starts the next, so a past session keeps the role it was taught in. One live period per (gedu, product), by a partial unique index, and no two periods of one (gedu, product) overlap, by the validate_gedu_assignment_periods trigger, which also refuses moving a start or re-ending an ended period. A group holds any number of gedus. Every reader says whether it means the gedus on the group now (ended_at IS NULL) or at a session. Written only by apply_group_changes; deleted only with its group or product, or by erasure.';


--
-- Name: COLUMN gedu_group_assignments.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_group_assignments.role IS 'Which capacity this educator holds the group in for this period: `primary` or `assistant`. A group holds ANY NUMBER of each — there is deliberately no exactly-one-primary rule, and an `assistant` on a product whose assistant fee is unset is allowed (the fee simply reads as not set wherever a fee is shown, and the admin attention queue goes on treating a missing assistant fee as "no assistant role" rather than as a defect). The ONLY thing the role decides is PAY: products carry a per-session fee for each. Readable wherever assignments already are, parents included through the existing policy, because it is a pay CLASS label and not a figure — the fee columns on `products` are already public. Written only by apply_group_changes, where a role change ends the current period and starts a new one in the new role, so a session keeps the role of the period it fell in.';


--
-- Name: COLUMN gedu_group_assignments.started_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_group_assignments.started_at IS 'The instant this period began: the clock instant of the admin batch that added the gedu or changed their role. No default — every writer names it. Never changed once written.';


--
-- Name: COLUMN gedu_group_assignments.ended_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_group_assignments.ended_at IS 'The instant this period ended, exclusive — a session starting at exactly this instant belongs to whoever was added then, not to this period. NULL while the period is current. Set once and never moved.';


--
-- Name: gedu_group_assignments gedu_group_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_group_assignments
    ADD CONSTRAINT gedu_group_assignments_pkey PRIMARY KEY (id);


--
-- Name: idx_gedu_group_assignments_gedu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gedu_group_assignments_gedu ON public.gedu_group_assignments USING btree (gedu_id);


--
-- Name: idx_gedu_group_assignments_group_gedu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gedu_group_assignments_group_gedu ON public.gedu_group_assignments USING btree (group_id, gedu_id);


--
-- Name: idx_gedu_group_assignments_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gedu_group_assignments_product ON public.gedu_group_assignments USING btree (product_id);


--
-- Name: uq_gedu_group_assignments_live_per_product; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_gedu_group_assignments_live_per_product ON public.gedu_group_assignments USING btree (gedu_id, product_id) WHERE (ended_at IS NULL);


--
-- Name: gedu_group_assignments trg_validate_gedu_assignment_periods; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_gedu_assignment_periods BEFORE INSERT OR UPDATE OF gedu_id, product_id, started_at, ended_at ON public.gedu_group_assignments FOR EACH ROW EXECUTE FUNCTION public.validate_gedu_assignment_periods();


--
-- Name: gedu_group_assignments trg_validate_gedu_assignment_product; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_gedu_assignment_product BEFORE INSERT OR UPDATE OF group_id, product_id ON public.gedu_group_assignments FOR EACH ROW EXECUTE FUNCTION public.validate_gedu_assignment_product();


--
-- Name: gedu_group_assignments trg_validate_one_gedu_seat_per_product; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_one_gedu_seat_per_product BEFORE INSERT OR UPDATE OF gedu_id, product_id ON public.gedu_group_assignments FOR EACH ROW EXECUTE FUNCTION public.validate_one_gedu_seat_per_product();


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

CREATE POLICY customers_read_assignments_via_gamers ON public.gedu_group_assignments FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND ( SELECT public.has_active_participation_on_product(gedu_group_assignments.product_id) AS has_active_participation_on_product) AND (ended_at IS NULL)));


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


