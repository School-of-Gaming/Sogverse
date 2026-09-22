--
-- Name: product_staff_details; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_staff_details (
    product_id uuid NOT NULL,
    material_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE product_staff_details; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_staff_details IS 'Admin + gedu only facts about a product, split off `products` because that table is anon-readable by column selection. One sparse row per product; a product with nothing staff-only recorded has no row. Reached by families through no path at all: admins read and write it under an admin-only RLS policy, gedus see only what get_gedu_group_feed hands them.';


--
-- Name: COLUMN product_staff_details.material_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_staff_details.material_url IS 'Gedu/admin-only lesson-material link, surfaced in the gedu group workspace. Never rendered to parents or gamers.';


--
-- Name: product_staff_details product_staff_details_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_staff_details
    ADD CONSTRAINT product_staff_details_pkey PRIMARY KEY (product_id);


--
-- Name: product_staff_details product_staff_details_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_staff_details_updated_at BEFORE UPDATE ON public.product_staff_details FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_staff_details product_staff_details_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_staff_details
    ADD CONSTRAINT product_staff_details_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_staff_details admin_full_access_product_staff_details; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_full_access_product_staff_details ON public.product_staff_details TO authenticated USING (( SELECT public.is_admin() AS is_admin)) WITH CHECK ((( SELECT public.is_admin() AS is_admin) AND (EXISTS ( SELECT 1
   FROM public.products p
  WHERE (p.id = product_staff_details.product_id)))));


--
-- Name: product_staff_details; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_staff_details ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE product_staff_details; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.product_staff_details TO authenticated;
GRANT ALL ON TABLE public.product_staff_details TO service_role;


