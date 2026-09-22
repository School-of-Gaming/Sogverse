--
-- Name: record_account_consents(uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_account_consents(p_customer_id uuid, p_document_slugs text[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_missing  text[];
  v_inserted integer;
BEGIN
  IF p_customer_id IS NULL
     OR p_document_slugs IS NULL
     OR array_length(p_document_slugs, 1) IS NULL
  THEN
    RAISE EXCEPTION
      'an account consent needs a customer and at least one document'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A NULL element is refused rather than skipped. `= ANY` and `unnest` both
  -- treat one as an unknown that quietly contributes nothing, so skipping it
  -- would record fewer documents than the caller asked for and say nothing
  -- about it — on a legal record, the wrong direction to fail in.
  IF array_position(p_document_slugs, NULL) IS NOT NULL THEN
    RAISE EXCEPTION
      'an account consent cannot name a NULL document'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = p_customer_id
       AND p.role = 'customer'
  ) THEN
    RAISE EXCEPTION
      'an account consent belongs to a customer profile (% is not one)',
      p_customer_id
      USING ERRCODE = 'raise_exception';
  END IF;

  -- Every named slug must have a published version, and the refusal names the
  -- ones that do not. Left to the NOT NULL on document_version this would abort
  -- with a constraint message naming no slug; a data error only a migration can
  -- create deserves a sentence saying which document is missing its text.
  v_missing := ARRAY(
    SELECT s
      FROM unnest(p_document_slugs) AS s
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.consent_document_versions cdv
        WHERE cdv.document_slug = s
     )
  );

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'no published version exists for %',
      array_to_string(v_missing, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- ON CONFLICT DO NOTHING, and the primary key is what gives it meaning: a
  -- retried registration request re-records the same (account, slug, version)
  -- and writes nothing, while a parent who later accepts a NEW revision gets a
  -- second row rather than an overwrite. DISTINCT so a caller sending the same
  -- slug twice cannot make one statement fail the other in the same statement.
  WITH written AS (
    INSERT INTO public.account_consent_acceptances (
      customer_id, document_slug, document_version
    )
    SELECT p_customer_id,
           s,
           (SELECT cdv.version
              FROM public.consent_document_versions cdv
             WHERE cdv.document_slug = s
             ORDER BY cdv.created_at DESC, cdv.version DESC
             LIMIT 1)
      FROM (SELECT DISTINCT unnest(p_document_slugs) AS s) AS slugs
    ON CONFLICT (customer_id, document_slug, document_version) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM written;

  RETURN v_inserted;
END;
$$;


--
-- Name: FUNCTION record_account_consents(p_customer_id uuid, p_document_slugs text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.record_account_consents(p_customer_id uuid, p_document_slugs text[]) IS 'Record that an account holder accepted the named consent documents, each at that document''s CURRENT version — the only writer of account_consent_acceptances. Called by the parent register route after the account exists, with the fixed set the sign-up form asks about. The version is resolved here and never supplied by a caller: greatest created_at for the slug, version DESC to break a tie, the same derivation record_required_consents uses. Refuses a NULL or empty array, a NULL element, a slug with no published version, and a profile that is not a `customer` — the invariant assert_role gives a self-service writer, read off the named profile because no session exists at registration. The customer IS a parameter because of that missing session, which is exactly why the only EXECUTE grant is to service_role: a parameter naming the subject can be aimed at somebody, so nothing a browser can reach may call it. Idempotent on (account, slug, version), so a retried registration writes nothing twice while a later revision of a document is a fresh row rather than an overwrite. Returns the number of rows written.';


--
-- Name: FUNCTION record_account_consents(p_customer_id uuid, p_document_slugs text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_account_consents(p_customer_id uuid, p_document_slugs text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_account_consents(p_customer_id uuid, p_document_slugs text[]) TO service_role;


