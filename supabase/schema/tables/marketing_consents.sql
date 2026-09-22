--
-- Name: marketing_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_consents (
    customer_id uuid NOT NULL,
    consent_type public.marketing_consent_type NOT NULL,
    granted boolean NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE marketing_consents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_consents IS 'The CURRENT answer to "may we mail this parent about this thing" — one row per (customer, consent type), and the row every send reads. Deliberately not derived from marketing_consent_events: a send must not fold a history to learn whether it may run, and the present tense must not depend on a log a retention policy could one day trim. An ABSENT row means never asked or never answered, which is not the same as `granted = false` (a parent who said no) — both are "do not mail", and only one of them is a decision the parent made. Account-level on purpose: the subject of a marketing consent is a mailbox, and a mailbox belongs to one adult rather than to one seat, which is the exact inverse of consent_acceptances and its per-enrolment key. REVOCABLE by construction — that is what makes this a separate system from the non-revocable enrolment conditions, which mandate the split. Written by set_marketing_consent and by the register route''s service-role client and by nothing else: no Data API role holds a write grant.';


--
-- Name: COLUMN marketing_consents.customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_consents.customer_id IS 'The adult who holds the permission, always a profile with role `customer`. Gamers and gedus hold none — a child''s synthetic address reaches nobody, and a gedu''s relationship with us is a contract rather than a mailing list — and the RPC''s role guard is what enforces that rather than a CHECK, because a role is a mutable property of a profile and a CHECK would freeze it at insert time. ON DELETE CASCADE: a permission to mail somebody who no longer exists is not a record worth keeping, and the audit trail cascades with them for the same reason.';


--
-- Name: COLUMN marketing_consents.granted; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_consents.granted IS 'True means we may mail; false means the parent said no. NOT NULL and no third state — "not asked" is the absence of the row, so a NULL here would be a second spelling of a state the primary key already expresses by omission.';


--
-- Name: COLUMN marketing_consents.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_consents.updated_at IS 'When this state was last CHANGED, stamped server-side. Not a call counter: set_marketing_consent leaves the row untouched when the submitted state already matches, so this is the moment the parent last actually moved the toggle. The full history is in marketing_consent_events.';


--
-- Name: marketing_consents marketing_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_consents
    ADD CONSTRAINT marketing_consents_pkey PRIMARY KEY (customer_id, consent_type);


--
-- Name: marketing_consents marketing_consents_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_consents
    ADD CONSTRAINT marketing_consents_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: marketing_consents admins_read_marketing_consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_marketing_consents ON public.marketing_consents FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: marketing_consents customers_read_own_marketing_consents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_read_own_marketing_consents ON public.marketing_consents FOR SELECT TO authenticated USING ((customer_id = ( SELECT auth.uid() AS uid)));


--
-- Name: marketing_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE marketing_consents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.marketing_consents TO authenticated;
GRANT ALL ON TABLE public.marketing_consents TO service_role;


