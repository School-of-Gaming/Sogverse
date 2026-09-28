--
-- Name: gedu_contract_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gedu_contract_acceptances (
    gedu_id uuid NOT NULL,
    contract_version text NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL,
    signed_name text NOT NULL,
    CONSTRAINT chk_gedu_contract_acceptances_signed_name_not_empty CHECK ((btrim(signed_name) <> ''::text))
);


--
-- Name: TABLE gedu_contract_acceptances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gedu_contract_acceptances IS 'One row per (gedu, contract version) accepted: the whole of what the platform records about a gedu agreeing to the contract. The primary key is what makes acceptance idempotent — a gedu accepting the same version twice is the same fact, not a second one — and version-keyed, so a new version leaves the old row standing and re-prompts. Because the version string carries its language, a gedu who signed both texts of one version holds two rows: two signatures on one agreement, not a contradiction, and either alone makes them current. Carries no write grant for any Data API role: every field a forger would want is stamped server-side by accept_gedu_contract, which is the only way in, the same arrangement gedu_profiles and set_gedu_certified have. Acceptance gates NOTHING — admin certification is the only blocking lever over an educator; this table informs that decision and does not pre-empt it.';


--
-- Name: COLUMN gedu_contract_acceptances.gedu_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_contract_acceptances.gedu_id IS 'The educator who accepted. References gedu_profiles rather than profiles because only a gedu has a contract to accept, so the FK states that rather than leaving it to the RPC alone. ON DELETE CASCADE: an account that is gone has no contract standing.';


--
-- Name: COLUMN gedu_contract_acceptances.contract_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_contract_acceptances.contract_version IS 'Which version was accepted, FK into the whitelist, stored and displayed as the full encoded <base>/<language> string — the language is half of what was signed and the record would be incomplete without it. Not free text: the version decides whether the gedu is re-prompted, so a value the platform does not know about would be unanswerable rather than merely wrong. Re-prompting compares the BASE, so a gedu who signed the Finnish text stands as current against the English one — both ARE the current version.';


--
-- Name: COLUMN gedu_contract_acceptances.accepted_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_contract_acceptances.accepted_at IS 'When the acceptance was recorded, stamped by the server inside accept_gedu_contract. A client never supplies it — a timestamp the signer chooses proves nothing about when they signed.';


--
-- Name: COLUMN gedu_contract_acceptances.signed_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.gedu_contract_acceptances.signed_name IS 'The signer''s full name AS IT STOOD when they signed, snapshotted from profiles by the RPC. Deliberately not a join: a profile name is editable by its owner, so resolving it at read time would answer what this person is called today when the question is who signed this. It is the identity half of the legal record and must not drift.';


--
-- Name: gedu_contract_acceptances gedu_contract_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_contract_acceptances
    ADD CONSTRAINT gedu_contract_acceptances_pkey PRIMARY KEY (gedu_id, contract_version);


--
-- Name: gedu_contract_acceptances gedu_contract_acceptances_contract_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_contract_acceptances
    ADD CONSTRAINT gedu_contract_acceptances_contract_version_fkey FOREIGN KEY (contract_version) REFERENCES public.gedu_contract_versions(version);


--
-- Name: gedu_contract_acceptances gedu_contract_acceptances_gedu_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gedu_contract_acceptances
    ADD CONSTRAINT gedu_contract_acceptances_gedu_id_fkey FOREIGN KEY (gedu_id) REFERENCES public.gedu_profiles(user_id) ON DELETE CASCADE;


--
-- Name: gedu_contract_acceptances admins_read_gedu_contract_acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_gedu_contract_acceptances ON public.gedu_contract_acceptances FOR SELECT TO authenticated USING (( SELECT public.is_admin() AS is_admin));


--
-- Name: gedu_contract_acceptances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gedu_contract_acceptances ENABLE ROW LEVEL SECURITY;

--
-- Name: gedu_contract_acceptances gedus_read_own_contract_acceptances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gedus_read_own_contract_acceptances ON public.gedu_contract_acceptances FOR SELECT TO authenticated USING ((gedu_id = ( SELECT auth.uid() AS uid)));


--
-- Name: TABLE gedu_contract_acceptances; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.gedu_contract_acceptances TO authenticated;
GRANT ALL ON TABLE public.gedu_contract_acceptances TO service_role;


