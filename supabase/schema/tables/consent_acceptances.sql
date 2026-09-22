--
-- Name: consent_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_acceptances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    product_id uuid NOT NULL,
    document_slug text NOT NULL,
    document_version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_by uuid NOT NULL
);


--
-- Name: TABLE consent_acceptances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.consent_acceptances IS 'One row per (enrolment, required document): the whole of what the platform records about a parent agreeing to a product''s enrolment conditions. INSERT-ONLY — nothing updates or deletes a row here, and no Data API role holds a write grant, because every field a forger would want is stamped server-side by record_required_consents, which is the only writer and is reachable only from inside create_participation and join_waitlist. DELIBERATELY carries no unique constraint: enrolling a second child, or leaving and re-joining a term later, each produce fresh rows, and those are history rather than duplicates — a constraint would make the second enrolment silently inherit the first one''s agreement. These consents are NON-REVOCABLE enrolment conditions and are not the (future, separate) revocable marketing/media consent system; there is no revoked_at column and there must never be one on this table.';


--
-- Name: COLUMN consent_acceptances.customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_acceptances.customer_id IS 'The adult who agreed — the purchasing customer, taken from the enrolment in hand rather than from anything the caller supplied separately. Same FK and same cascade as participations.customer_id.';


--
-- Name: COLUMN consent_acceptances.participant_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_acceptances.participant_id IS 'Whose seat the agreement conditions: the child being enrolled, or the adult themselves on a product whose audience admits parents (participant_id = customer_id is what a self seat looks like, exactly as on participations).';


--
-- Name: COLUMN consent_acceptances.product_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_acceptances.product_id IS 'The product enrolled onto. ON DELETE CASCADE, matching participations: a deleted product takes its seats with it, and an agreement to conditions of an enrolment that no longer exists conditions nothing.';


--
-- Name: COLUMN consent_acceptances.document_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_acceptances.document_version IS 'The version that was CURRENT for this slug at the moment of enrolment, resolved server-side — never supplied by a caller. Together with document_slug it is a foreign key into consent_document_versions, so a row can only ever name a document the platform actually published.';


--
-- Name: COLUMN consent_acceptances.accepted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_acceptances.accepted_at IS 'When the agreement was recorded, stamped by the server. A client never supplies it — a timestamp the agreeing party chooses proves nothing about when they agreed.';


--
-- Name: COLUMN consent_acceptances.accepted_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.consent_acceptances.accepted_by IS 'The profile that PERFORMED the consent act — a different question from customer_id, which names the adult the agreement binds. On both family paths they are the same id, because the parent ticked the boxes themselves; on the admin comp-enrolment path this is the acting admin''s own profile while customer_id stays the family''s, so a staff-made record can never be read back as a parent''s own click. Taken from auth.uid() on that path and from the enrolment in hand on the others — never from a caller argument. No cascade on the FK, matching products.created_by: the profile that made a legal record is part of it, so it cannot be hard-deleted while the record stands; the family''s own removal runs through customer_id, which does cascade.';


--
-- Name: consent_acceptances consent_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_acceptances
    ADD CONSTRAINT consent_acceptances_pkey PRIMARY KEY (id);


--
-- Name: idx_consent_acceptances_accepted_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consent_acceptances_accepted_by ON public.consent_acceptances USING btree (accepted_by);


--
-- Name: idx_consent_acceptances_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consent_acceptances_customer ON public.consent_acceptances USING btree (customer_id);


--
-- Name: idx_consent_acceptances_product_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consent_acceptances_product_participant ON public.consent_acceptances USING btree (product_id, participant_id);


--
-- Name: consent_acceptances consent_acceptances_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_acceptances
    ADD CONSTRAINT consent_acceptances_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.profiles(id);


--
-- Name: consent_acceptances consent_acceptances_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_acceptances
    ADD CONSTRAINT consent_acceptances_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: consent_acceptances consent_acceptances_document_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_acceptances
    ADD CONSTRAINT consent_acceptances_document_fkey FOREIGN KEY (document_slug, document_version) REFERENCES public.consent_document_versions(document_slug, version);


--
-- Name: consent_acceptances consent_acceptances_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_acceptances
    ADD CONSTRAINT consent_acceptances_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: consent_acceptances consent_acceptances_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_acceptances
    ADD CONSTRAINT consent_acceptances_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: consent_acceptances admins_read_consent_acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_consent_acceptances ON public.consent_acceptances FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: consent_acceptances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consent_acceptances ENABLE ROW LEVEL SECURITY;

--
-- Name: consent_acceptances customers_read_own_consent_acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_own_consent_acceptances ON public.consent_acceptances FOR SELECT TO authenticated USING ((customer_id = ( SELECT auth.uid() AS uid)));


--
-- Name: TABLE consent_acceptances; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.consent_acceptances TO authenticated;
GRANT ALL ON TABLE public.consent_acceptances TO service_role;


