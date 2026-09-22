--
-- Name: record_required_consents(uuid, uuid, uuid, uuid, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_required_consents(p_product_id uuid, p_customer_id uuid, p_participant_id uuid, p_accepted_by uuid, p_consented_documents text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_required text[];
  v_missing  text[];
BEGIN
  -- FIRST, before anything reads the product: an array carrying a NULL element
  -- is refused outright. A NULL is not a slug, so it can never be an
  -- agreement to a document, and the only thing it has ever been good for is
  -- turning the membership test below into a three-valued expression that
  -- answers "nothing is missing" for a caller who agreed to nothing.
  -- `unnest(NULL::text[])` yields no rows, so an omitted array (the ordinary
  -- shape on a product that requires nothing) passes straight through here.
  IF EXISTS (
    SELECT 1 FROM unnest(p_consented_documents) AS c WHERE c IS NULL
  ) THEN
    RAISE EXCEPTION
      'the consented-document list contains a NULL entry, which is not a document'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT array_agg(prc.document_slug ORDER BY prc.document_slug)
    INTO v_required
    FROM public.product_required_consents prc
   WHERE prc.product_id = p_product_id;

  -- The overwhelmingly common case: a product with no required consents. It is
  -- not an error to send slugs anyway — an extra slug is a client that has not
  -- refreshed, not an attack — so nothing is written and nothing is refused.
  IF v_required IS NULL THEN
    RETURN;
  END IF;

  -- COALESCE rather than a NULL check: a caller who sent nothing and a caller
  -- who sent an empty array are making the same claim, and both must be refused
  -- with the same message naming what is missing.
  --
  -- NOT EXISTS rather than `NOT (r = ANY (...))`: the ANY form is three-valued
  -- and a NULL element makes it answer NULL instead of false for
  -- every required document, which drops every row from this ARRAY() and
  -- reports that nothing is missing. This form is two-valued — a NULL element
  -- fails `c = r` and contributes nothing — so a required document with no
  -- match stays missing whatever else is in the array. The guard at the top of
  -- this function already refuses that input; this is the second lock on the
  -- same door, and it is deliberate.
  v_missing := ARRAY(
    SELECT r
      FROM unnest(v_required) AS r
     WHERE NOT EXISTS (
       SELECT 1
         FROM unnest(COALESCE(p_consented_documents, ARRAY[]::text[])) AS c
        WHERE c = r
     )
  );

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'this product requires consent to % before enrolling',
      array_to_string(v_missing, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- One row per REQUIRED document — never one per slug the caller sent, so a
  -- client that ticks a document the product does not require records nothing
  -- extra. The version is resolved here and never taken from the caller: the
  -- greatest created_at for that slug, with `version DESC` as a tiebreaker so
  -- two revisions published in one transaction pick deterministically rather
  -- than arbitrarily (an arbitrary answer to "what is current" is worse than a
  -- wrong one, because it changes between reads).
  --
  -- A required slug with NO published version yields NULL here and the NOT NULL
  -- on document_version aborts the enrolment. That is the intended handling: it
  -- is a data error only a migration could create, and enrolling somebody
  -- against a document that has never been published is not a lesser outcome
  -- than failing loudly.
  --
  -- accepted_by is likewise the caller's to state and not the caller's to
  -- forge: every one of the three callers is SECURITY DEFINER and passes either
  -- the customer it already pinned or its own auth.uid(), so no wire field
  -- reaches this column.
  INSERT INTO public.consent_acceptances (
    customer_id, participant_id, product_id, document_slug, document_version,
    accepted_by
  )
  SELECT p_customer_id,
         p_participant_id,
         p_product_id,
         r,
         (SELECT cdv.version
            FROM public.consent_document_versions cdv
           WHERE cdv.document_slug = r
           ORDER BY cdv.created_at DESC, cdv.version DESC
           LIMIT 1),
         p_accepted_by
    FROM unnest(v_required) AS r;
END;
$$;


--
-- Name: FUNCTION record_required_consents(p_product_id uuid, p_customer_id uuid, p_participant_id uuid, p_accepted_by uuid, p_consented_documents text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.record_required_consents(p_product_id uuid, p_customer_id uuid, p_participant_id uuid, p_accepted_by uuid, p_consented_documents text[]) IS 'The enrolment-consent gate, and the only writer of consent_acceptances. Loads the product''s required document slugs, refuses the enrolment with check_violation unless the caller''s array covers ALL of them (naming the missing ones), and then writes one acceptance row per REQUIRED slug at that slug''s CURRENT version — the row with the greatest created_at, resolved server-side and never supplied by a caller. A product requiring nothing is a no-op, including when slugs are sent anyway. Carries no EXECUTE grant for any role, because every caller is SECURITY DEFINER and already holds the privilege as the owner. An array containing a NULL element is refused before anything else happens, and the missing-set test is a two-valued NOT EXISTS rather than `NOT (r = ANY (...))`: the ANY form answers SQL NULL — which NOT turns into NULL, not true — whenever the array holds a NULL and nothing matches, so ARRAY[NULL] would pass the gate for every required document and record acceptances nobody had given. It takes p_accepted_by, the profile that PERFORMED the act, and has THREE callers: create_participation and join_waitlist pass their own p_customer_id, because the parent ticked the boxes themselves, and admin_enroll_participant passes the acting admin''s auth.uid() while leaving customer_id the family''s. These consents are NON-REVOCABLE enrolment conditions — see the consent_acceptances table comment.';


--
-- Name: FUNCTION record_required_consents(p_product_id uuid, p_customer_id uuid, p_participant_id uuid, p_accepted_by uuid, p_consented_documents text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_required_consents(p_product_id uuid, p_customer_id uuid, p_participant_id uuid, p_accepted_by uuid, p_consented_documents text[]) FROM PUBLIC;


