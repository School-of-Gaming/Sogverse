--
-- Name: get_substitution_notification_snapshot(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_substitution_notification_snapshot(p_request_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_row     public.session_substitution_requests;
  v_group   public.product_groups;
  v_product public.products;
BEGIN
  SELECT * INTO v_row
    FROM public.session_substitution_requests r
   WHERE r.id = p_request_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_group FROM public.product_groups g WHERE g.id = v_row.group_id;
  SELECT * INTO v_product FROM public.products p WHERE p.id = v_group.product_id;

  RETURN jsonb_build_object(
    'request', jsonb_build_object(
      'id',           v_row.id,
      'status',       v_row.status,
      'group_id',     v_row.group_id,
      'group_name',   v_group.name,
      'session_date', v_row.session_date,
      'role',         v_row.role,
      -- The fee for THIS role, null when the product has not set one — the
      -- pool's own rule.
      'fee_cents',
        CASE v_row.role
          WHEN 'primary'::public.gedu_assignment_role
            THEN v_product.primary_gedu_fee_cents
          ELSE v_product.assistant_gedu_fee_cents
        END,
      'reason',       v_row.reason,
      'reason_note',  v_row.reason_note,
      'created_at',   v_row.created_at,
      'approved_at',  v_row.approved_at,
      'requester', (
        SELECT jsonb_build_object('id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name)
          FROM public.profiles pr
         WHERE pr.id = v_row.requested_by
      ),
      'substitute', (
        SELECT jsonb_build_object('id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name)
          FROM public.profiles pr
         WHERE pr.id = v_row.substitute_id
      ),
      'approver', (
        SELECT jsonb_build_object('id', pr.id, 'first_name', pr.first_name, 'last_name', pr.last_name)
          FROM public.profiles pr
         WHERE pr.id = v_row.approved_by
      )
    ),
    'product',                 public.session_product_document(v_product),
    'required_qualifications', to_jsonb(public.product_required_qualifications(v_product.product_type, v_product.tag)),
    'is_cancelled',            public.group_session_is_cancelled(v_row.group_id, v_row.session_date),
    'product_today',           (now() AT TIME ZONE v_product.timezone)::date,
    'candidates', COALESCE((
      WITH eligible AS (
        -- Exactly the pool's four tests, so a DM goes to exactly the gedus
        -- whose pool lists the request.
        SELECT pr.id
          FROM public.profiles pr
         WHERE pr.role = 'gedu'::public.user_role
           AND public.gedu_may_substitute_session(
                 pr.id, v_row.group_id, v_row.session_date, v_row.requested_by
               )
           AND public.gedu_holds_session_qualifications(pr.id, v_row.group_id)
           AND public.gedu_speaks_session_language(pr.id, v_row.group_id)
           AND public.gedu_covers_product_site(pr.id, v_product.id)
      ),
      candidate AS (
        SELECT e.id AS gedu_id FROM eligible e
        UNION
        SELECT o.gedu_id
          FROM public.session_substitution_offers o
         WHERE o.request_id = v_row.id
        UNION
        SELECT d.gedu_id
          FROM public.substitution_notification_dms d
         WHERE d.request_id = v_row.id
        UNION
        -- The seated substitute, who may never have answered or been sent a
        -- DM (an admin can seat anyone) and is no longer eligible once
        -- expected at the session — the sync still owes them their DM.
        SELECT v_row.substitute_id
         WHERE v_row.substitute_id IS NOT NULL
      )
      SELECT jsonb_agg(
               jsonb_build_object(
                 'gedu_id',    c.gedu_id,
                 'first_name', pr.first_name,
                 'last_name',  pr.last_name,
                 'locale',     pr.locale,
                 -- Only the Discord account that ACTS as this gedu: one linked
                 -- to a second gedu account more recently answers for that
                 -- account, and a DM to it would be answered as the wrong
                 -- person.
                 'discord_user_id', (
                   SELECT l.discord_user_id
                     FROM public.discord_links l
                    WHERE l.profile_id = c.gedu_id
                      AND public.discord_acting_gedu(l.discord_user_id) = c.gedu_id
                 ),
                 'eligible',     EXISTS (SELECT 1 FROM eligible e WHERE e.id = c.gedu_id),
                 'response',     o.response,
                 'offer_id',     o.id,
                 'responded_at', o.responded_at
               )
               ORDER BY pr.first_name, pr.last_name, c.gedu_id
             )
        FROM candidate c
        JOIN public.profiles pr ON pr.id = c.gedu_id
        LEFT JOIN public.session_substitution_offers o
               ON o.request_id = v_row.id
              AND o.gedu_id    = c.gedu_id
    ), '[]'::jsonb),
    'notification', (
      SELECT to_jsonb(n)
        FROM public.substitution_notifications n
       WHERE n.request_id = v_row.id
    ),
    'dms', COALESCE((
      SELECT jsonb_agg(to_jsonb(d) ORDER BY d.gedu_id)
        FROM public.substitution_notification_dms d
       WHERE d.request_id = v_row.id
    ), '[]'::jsonb)
  );
END;
$$;


--
-- Name: FUNCTION get_substitution_notification_snapshot(p_request_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_substitution_notification_snapshot(p_request_id uuid) IS 'Everything the notification sync renders a substitution request''s Slack message and Discord DMs from, or NULL when the request does not exist. `request`: the row with its group name, the fee for its role (null when unset), the reason and note, and the requester, substitute and approver as {id, first_name, last_name} (null when unset). `product`: session_product_document, the shell every substitution surface shares. `required_qualifications`, `is_cancelled` (group_session_is_cancelled), and `product_today`, the date in the product''s zone, which tells a passed request from an open one. `candidates`: every gedu eligible now — exactly the pool''s four tests, gedu_may_substitute_session, gedu_holds_session_qualifications, gedu_speaks_session_language and gedu_covers_product_site — together with every gedu who has answered, every gedu who was sent a DM and the seated substitute, each with their name, locale, `eligible`, their answer (response, offer_id, responded_at; null when none) and discord_user_id, which is non-null only when that Discord account acts as this gedu (discord_acting_gedu). `notification` and `dms`: the message records as stored. Carries the reason, so it is for the service role alone.';


--
-- Name: FUNCTION get_substitution_notification_snapshot(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_substitution_notification_snapshot(p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_substitution_notification_snapshot(p_request_id uuid) TO service_role;


