--
-- Name: approve_substitution_offer_as(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_substitution_offer_as(p_admin_id uuid, p_offer_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_request_id uuid;
  v_sub_id     uuid;
  v_group_id   uuid;
  v_row        public.session_substitution_requests;
BEGIN
  -- Only an OFFER can be approved: a declined row is not found.
  SELECT o.request_id, o.gedu_id INTO v_request_id, v_sub_id
    FROM public.session_substitution_offers o
   WHERE o.id = p_offer_id
     AND o.response = 'offer'::public.substitution_offer_response;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Substitution offer not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT r.group_id INTO v_group_id
    FROM public.session_substitution_requests r
   WHERE r.id = v_request_id;

  -- The (group, date) serialization point, taken first by every admin write.
  PERFORM 1 FROM public.product_groups g WHERE g.id = v_group_id FOR UPDATE;

  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = v_request_id
     FOR UPDATE;

  -- The answer is read again under the request's lock, which every answer
  -- takes too: a gedu who declined between the lookup above and the lock is
  -- not seated.
  IF NOT EXISTS (
       SELECT 1
         FROM public.session_substitution_offers o
        WHERE o.id = p_offer_id
          AND o.response = 'offer'::public.substitution_offer_response
     ) THEN
    RAISE EXCEPTION 'Substitution offer not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status <> 'open'::public.substitution_request_status THEN
    RAISE EXCEPTION 'this substitution request is already %', v_row.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- THE ABSENT GEDU MUST STILL HOLD THE SEAT THEY FILED AGAINST. An admin can
  -- remove a gedu from a group through the groups panel while a request of
  -- theirs is open, and approving an offer on an orphaned request would seat a
  -- sub to substitute for nobody — and hand them the group's workspace for it.
  -- The panel sweeps the requests it orphans, so this is the second line of
  -- defence rather than the first.
  --
  -- A REFUSAL rather than a withdraw-and-refuse, and that is forced rather than
  -- chosen: the RAISE aborts the transaction, so a withdraw written first would
  -- be rolled back with it.
  IF NOT public.gedu_holds_seat_at_session(
           v_row.requested_by, v_row.group_id, v_row.session_date
         ) THEN
    RAISE EXCEPTION 'gedu % no longer holds a seat on group % (%), so there is nothing to substitute for',
                    v_row.requested_by, v_row.group_id, v_row.session_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- Re-asked under the lock, because an offer can go stale between being made
  -- and being approved: the offerer may since have been assigned to the group,
  -- been seated as somebody else's sub on the same date, filed an absence of
  -- their own, or been de-certified.
  IF NOT public.gedu_may_substitute_session(
           v_sub_id, v_row.group_id, v_row.session_date, v_row.requested_by
         ) THEN
    RAISE EXCEPTION 'gedu % can no longer substitute on group % on %',
                    v_sub_id, v_row.group_id, v_row.session_date
      USING ERRCODE = 'check_violation';
  END IF;

  -- The other answers are deliberately untouched: "not selected" is derived
  -- from the request being substituted by somebody else.
  UPDATE public.session_substitution_requests
     SET status        = 'substituted'::public.substitution_request_status,
         substitute_id = v_sub_id,
         approved_by   = p_admin_id,
         approved_at   = now()
   WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN public.substitution_request_document(v_row, true, p_admin_id);
END;
$$;


--
-- Name: FUNCTION approve_substitution_offer_as(p_admin_id uuid, p_offer_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.approve_substitution_offer_as(p_admin_id uuid, p_offer_id uuid) IS 'Internal: the admin p_admin_id picks one offer, and its gedu becomes the substitute — `open` -> `substituted`, stamping substitute_id, approved_by = p_admin_id and approved_at. The body behind approve_session_substitution_offer (the web) and approve_session_substitution_offer_for_slack_user (Slack). Only a row whose response is `offer` is approvable: a declined row is refused as not found (P0002), asked again under the request''s lock so a decline racing the approval wins. Takes the group row''s lock and then the request''s FOR UPDATE, so two admins approving two offers on one session serialize and the second is refused ("is already", check_violation). Re-asks under that lock whether the ABSENT gedu still holds a seat at the session (gedu_holds_seat_at_session; "no longer holds a seat", check_violation) — approving an orphaned request would seat a sub for nobody — and whether the offerer may still substitute (gedu_may_substitute_session; "can no longer substitute", check_violation), because an offer goes stale: the offerer gets assigned to the group, seated as somebody else''s sub on the same date, files an absence of their own, or is de-certified. A refusal rather than a withdraw-and-refuse, because the RAISE would roll a withdraw back with the rest of the transaction. The OTHER ANSWERS ARE NOT TOUCHED: "not selected" is derived from the request being substituted by somebody else, which is why no approved_offer_id exists. Returns the admin document. Granted to nobody.';


--
-- Name: FUNCTION approve_substitution_offer_as(p_admin_id uuid, p_offer_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.approve_substitution_offer_as(p_admin_id uuid, p_offer_id uuid) FROM PUBLIC;


