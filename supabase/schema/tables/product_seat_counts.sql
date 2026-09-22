--
-- Name: product_seat_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_seat_counts (
    product_id uuid NOT NULL,
    active_count integer DEFAULT 0 NOT NULL,
    waitlist_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_seat_counts_active_count_check CHECK ((active_count >= 0)),
    CONSTRAINT product_seat_counts_waitlist_count_check CHECK ((waitlist_count >= 0))
);


--
-- Name: product_seat_counts product_seat_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_seat_counts
    ADD CONSTRAINT product_seat_counts_pkey PRIMARY KEY (product_id);


--
-- Name: product_seat_counts product_seat_counts_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_seat_counts
    ADD CONSTRAINT product_seat_counts_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_seat_counts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_seat_counts ENABLE ROW LEVEL SECURITY;

--
-- Name: product_seat_counts public_read_product_seat_counts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY public_read_product_seat_counts ON public.product_seat_counts FOR SELECT TO authenticated, anon USING (true);


--
-- Name: TABLE product_seat_counts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_seat_counts TO service_role;
GRANT SELECT ON TABLE public.product_seat_counts TO anon;
GRANT SELECT ON TABLE public.product_seat_counts TO authenticated;


