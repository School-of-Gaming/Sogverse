--
-- Name: cascade_withdraw_orphaned_substitution_requests(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cascade_withdraw_orphaned_substitution_requests(p_group_id uuid, p_session_date date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_changed integer;
BEGIN
  LOOP
    UPDATE public.session_substitution_requests r
       SET status      = 'withdrawn'::public.substitution_request_status,
           substitute_id  = NULL,
           approved_by = NULL,
           approved_at = NULL
     WHERE r.group_id     = p_group_id
       AND r.session_date = p_session_date
       AND r.status <> 'withdrawn'::public.substitution_request_status
       AND NOT public.gedu_holds_seat_at_session(
                 r.requested_by, p_group_id, p_session_date
               );

    GET DIAGNOSTICS v_changed = ROW_COUNT;
    EXIT WHEN v_changed = 0;
  END LOOP;
END;
$$;


--
-- Name: FUNCTION cascade_withdraw_orphaned_substitution_requests(p_group_id uuid, p_session_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cascade_withdraw_orphaned_substitution_requests(p_group_id uuid, p_session_date date) IS 'Internal: after an admin edit that can unseat somebody — clear, withdraw, or the replace inside set_session_substitution — withdraw every non-withdrawn request on that (group, date) whose requester no longer holds a seat there, meaning neither assigned nor the substitute_id of a live substituted request. A FIXPOINT sweep rather than one statement, because unseating cascades: clearing X''s substitution withdraws X''s own request, which unseats whoever was substituting that, and so on until a pass changes nothing. Withdrawing a substituted row blanks its three substitution columns — chk_substitution_state forbids a withdrawn row from carrying a sub — which is deliberate: an admin unwinding a mistake leaves no phantom substitution behind for invoicing to bill. Withdrawing a request whose requester was meanwhile unassigned restores nobody and is allowed. Not granted to `authenticated`; called only from inside the admin RPCs. Since 00276 "no longer holds a seat" is gedu_holds_seat_at_session rather than two inline NOT EXISTS clauses, and apply_group_changes joins the callers: removing a gedu from a group through the admin groups panel unseats them without touching a substitution row, so that writer now sweeps every date the removed gedu held a live request on.';


--
-- Name: FUNCTION cascade_withdraw_orphaned_substitution_requests(p_group_id uuid, p_session_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cascade_withdraw_orphaned_substitution_requests(p_group_id uuid, p_session_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cascade_withdraw_orphaned_substitution_requests(p_group_id uuid, p_session_date date) TO service_role;


