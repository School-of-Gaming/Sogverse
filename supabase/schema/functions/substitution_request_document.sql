--
-- Name: substitution_request_document(public.session_substitution_requests, boolean, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.substitution_request_document(p_request public.session_substitution_requests, p_include_reason boolean, p_viewer_id uuid, p_reveal_requester boolean DEFAULT false) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'id',           p_request.id,
    'group_id',     p_request.group_id,
    'session_date', p_request.session_date,
    'role',         p_request.role,
    'status',       p_request.status,
    'created_at',   p_request.created_at,
    -- WHO IS ABSENT travels for three readers and no others: an admin
    -- (p_include_reason, which every admin path already passes), the requester
    -- themselves, and a caller that has explicitly asked to reveal it because
    -- its own reader is staff on the group — which is the gedu workspace feed
    -- and nothing else. A volunteer answering the pool gets JSON null here,
    -- because the pool names the session and never the person.
    --
    -- Emitted as null rather than omitted, exactly as reason and offer_count
    -- are: the document keeps ONE shape for every reader, so no client schema
    -- branches on which keys arrived.
    'requested_by',
      CASE WHEN p_include_reason
                OR p_reveal_requester
                OR p_request.requested_by = p_viewer_id
           THEN p_request.requested_by
      END,
    'requested_by_first_name',
      CASE WHEN p_include_reason
                OR p_reveal_requester
                OR p_request.requested_by = p_viewer_id
           THEN (
             SELECT pr.first_name
               FROM public.profiles pr
              WHERE pr.id = p_request.requested_by
           )
      END,
    'substitute_id',   p_request.substitute_id,
    'substitute_first_name', (
      SELECT pr.first_name FROM public.profiles pr WHERE pr.id = p_request.substitute_id
    ),
    'approved_at',  p_request.approved_at,
    -- Whether the VIEWER is the absent gedu. The card shows a status line and a
    -- Withdraw button off this, and nothing else needs it.
    'is_requester', COALESCE(p_request.requested_by = p_viewer_id, false),
    -- How many offers are waiting — for the REQUESTER (their own status line)
    -- and for an admin (the queue). A colleague sees null: how many people
    -- volunteered for somebody else's absence is not their business, and
    -- offerers never learn who else offered.
    'offer_count',
      CASE WHEN p_include_reason OR p_request.requested_by = p_viewer_id
           THEN (
             SELECT count(*)::integer
               FROM public.session_substitution_offers o
              WHERE o.request_id = p_request.id
           )
      END,
    -- Admin-only, and emitted as JSON null rather than omitted so the document
    -- keeps ONE shape for both readers — a client schema that had to branch on
    -- which keys are present would be a second place the rule lives.
    'reason',      CASE WHEN p_include_reason THEN p_request.reason END,
    'reason_note', CASE WHEN p_include_reason THEN p_request.reason_note END
  );
$$;


--
-- Name: FUNCTION substitution_request_document(p_request public.session_substitution_requests, p_include_reason boolean, p_viewer_id uuid, p_reveal_requester boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.substitution_request_document(p_request public.session_substitution_requests, p_include_reason boolean, p_viewer_id uuid, p_reveal_requester boolean) IS 'Internal: the ONE wire shape of a substitution request. Every substitution write returns it and both staff feeds'' `substitutions` arrays are built from it, so no surface can drift about what a request is. Takes the ROW rather than an id, so a feed aggregates it over a query and a writer hands over the row it just wrote. THREE fields are keyed to the reader rather than to the RPC, and all three are emitted as JSON null when the reader is not entitled to them rather than omitted, so the document keeps one shape for every reader and no client schema branches on which keys arrived. `reason`/`reason_note` travel on p_include_reason, the ADMIN flag, alone. `offer_count` travels for an admin and for the requester themselves, because how many people volunteered for a colleague''s absence is not their business. And WHO IS ABSENT — requested_by with its first name — travels for an admin, for a viewer who IS the requester, and for a caller that passed p_reveal_requester because its own reader is staff on the group; that flag DEFAULTS TO FALSE, so a caller added later that forgets it conceals, and the only caller passing it today is get_gedu_group_feed, whose reader reached the group''s workspace and whose session card''s staffing line names who is away. The two offer RPCs pass false explicitly: a volunteer decides on the session and never on the person, which is the same rule the pool list keeps by never naming them at all. Not granted to `authenticated`.';


--
-- Name: FUNCTION substitution_request_document(p_request public.session_substitution_requests, p_include_reason boolean, p_viewer_id uuid, p_reveal_requester boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.substitution_request_document(p_request public.session_substitution_requests, p_include_reason boolean, p_viewer_id uuid, p_reveal_requester boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.substitution_request_document(p_request public.session_substitution_requests, p_include_reason boolean, p_viewer_id uuid, p_reveal_requester boolean) TO service_role;


