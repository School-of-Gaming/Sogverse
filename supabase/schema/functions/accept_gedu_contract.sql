--
-- Name: accept_gedu_contract(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_gedu_contract(p_version text) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid         uuid := (SELECT auth.uid());
  v_accepted_at timestamptz;
  v_signed_name text;
BEGIN
  -- Guard-first, in the one shape the authorization spine reads. A gedu is the
  -- only role with a contract to accept; everyone else is refused with 42501 on
  -- the first statement. The FK to gedu_profiles stands behind this as the
  -- schema's own claim — a profile that says 'gedu' with no gedu_profiles row is
  -- a data error, and the insert below fails loudly rather than writing an
  -- acceptance for an educator record that does not exist.
  PERFORM public.assert_role('gedu');

  -- Pre-empt the foreign key so the refusal names the real cause: a version the
  -- platform has never heard of, which is what a stale client sends after a new
  -- version ships. A NULL p_version lands here too — nothing matches it — which
  -- is the right answer to "accept nothing".
  IF NOT EXISTS (
    SELECT 1 FROM public.gedu_contract_versions v WHERE v.version = p_version
  ) THEN
    RAISE EXCEPTION 'accept_gedu_contract: % is not a contract version this platform knows', p_version
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Idempotent by design: accepting the same version twice is the same fact, so
  -- the first acceptance stands and its stamp is the answer. Re-stamping would
  -- quietly rewrite the legal record every time somebody reloaded the page.
  SELECT ca.accepted_at
    INTO v_accepted_at
    FROM public.gedu_contract_acceptances ca
   WHERE ca.gedu_id = v_uid
     AND ca.contract_version = p_version;

  IF FOUND THEN
    RETURN v_accepted_at;
  END IF;

  -- The identity snapshot. Both columns are NOT NULL on profiles (last_name
  -- defaults to the empty string), so the concatenation cannot be NULL and the
  -- btrim is what keeps a gedu with no surname from signing as "Aino ".
  SELECT btrim(pr.first_name || ' ' || pr.last_name)
    INTO v_signed_name
    FROM public.profiles pr
   WHERE pr.id = v_uid;

  INSERT INTO public.gedu_contract_acceptances (
    gedu_id, contract_version, accepted_at, signed_name
  )
  VALUES (v_uid, p_version, now(), v_signed_name)
  ON CONFLICT (gedu_id, contract_version) DO NOTHING
  RETURNING accepted_at INTO v_accepted_at;

  -- DO NOTHING fired, which means a concurrent call — the same gedu's second
  -- click — committed the row between the read above and this insert. The row
  -- that landed IS the acceptance, so read its stamp rather than raising: the
  -- caller asked for a fact to be true and it is.
  IF v_accepted_at IS NULL THEN
    SELECT ca.accepted_at
      INTO v_accepted_at
      FROM public.gedu_contract_acceptances ca
     WHERE ca.gedu_id = v_uid
       AND ca.contract_version = p_version;
  END IF;

  RETURN v_accepted_at;
END;
$$;


--
-- Name: FUNCTION accept_gedu_contract(p_version text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.accept_gedu_contract(p_version text) IS 'Record that the CALLER accepted one version of the gedu contract, and return the acceptance timestamp. Gedu-only, guard-first on assert_role. There is no target parameter: the row is keyed to auth.uid(), so a caller cannot accept on anyone else''s behalf, and accepted_at and signed_name are both stamped server-side — the name as a snapshot taken from profiles at this moment, because a profile name is editable and the legal record must not drift. p_version is the full encoded version string — <base>/<language>, e.g. 2026-2027/fi — naming which of the equally binding texts was read, and it is checked against gedu_contract_versions and refused with foreign_key_violation if unknown. Idempotent per encoded version: accepting the same string twice returns the first acceptance''s stamp and writes nothing, including when the duplicate arrives concurrently. Signing the other language of the same version writes a second row, which is a second signature on one agreement and not a re-acceptance. Accepting gates nothing — admin certification remains the only blocking lever over an educator.';


--
-- Name: FUNCTION accept_gedu_contract(p_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.accept_gedu_contract(p_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_gedu_contract(p_version text) TO authenticated;


