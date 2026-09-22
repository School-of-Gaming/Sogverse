--
-- Name: product_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    public_note text,
    gedu_note text,
    CONSTRAINT chk_product_groups_name_not_blank CHECK ((length(btrim(name)) > 0))
);


--
-- Name: COLUMN product_groups.public_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_groups.public_note IS 'Standing family-facing note about the group. Plain text (rich text for group/site notes is an open question).';


--
-- Name: COLUMN product_groups.gedu_note; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_groups.gedu_note IS 'Standing gedu + admin note about the group. Never shown to families. Plain text.';


--
-- Name: product_groups product_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_groups
    ADD CONSTRAINT product_groups_pkey PRIMARY KEY (id);


--
-- Name: idx_product_groups_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_groups_product ON public.product_groups USING btree (product_id);


--
-- Name: product_groups product_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_groups_updated_at BEFORE UPDATE ON public.product_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_groups product_groups_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_groups
    ADD CONSTRAINT product_groups_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_groups admin_full_access_product_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_groups ON public.product_groups TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK (( SELECT public.is_admin() AS is_admin));


--
-- Name: product_groups customers_read_groups_via_gamers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_groups_via_gamers ON public.product_groups FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'customer'::public.user_role) AND ( SELECT public.has_active_participation_in_group(product_groups.id) AS has_active_participation_in_group)));


--
-- Name: product_groups gamers_read_own_group; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gamers_read_own_group ON public.product_groups FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'gamer'::public.user_role) AND ( SELECT public.has_active_participation_in_group(product_groups.id) AS has_active_participation_in_group)));


--
-- Name: product_groups gedus_read_assigned_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedus_read_assigned_groups ON public.product_groups FOR SELECT TO authenticated USING (((( SELECT public.get_user_role() AS get_user_role) = 'gedu'::public.user_role) AND ((id IN ( SELECT ga.group_id
   FROM public.gedu_group_assignments ga
  WHERE (ga.gedu_id = ( SELECT auth.uid() AS uid)))) OR ( SELECT public.gedu_substitutes_group(product_groups.id) AS gedu_substitutes_group))));


--
-- Name: product_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE product_groups; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.product_groups TO anon;
GRANT ALL ON TABLE public.product_groups TO service_role;
GRANT SELECT ON TABLE public.product_groups TO authenticated;


