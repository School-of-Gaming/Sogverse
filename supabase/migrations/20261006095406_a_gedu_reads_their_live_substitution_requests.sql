-- A gedu reads their own live substitution requests.
--
-- WHAT THIS ADDS
--
-- Both ways into "I cannot make this session" — the Substitutions page's picker
-- and the Discord bot's `/sub` — list the gedu's upcoming sessions from their
-- seat reads, and neither read says which of those sessions the gedu has
-- already asked a substitute for. So those sessions were offered again, and a
-- gedu picking one went all the way through the form to be refused by the
-- write. This read closes that gap: the caller's own live requests, so the web
-- can show those sessions disabled and the bot can leave them out.
--
-- WHAT "LIVE" MEANS, AND WHY IT CANNOT DISAGREE WITH THE WRITE
--
-- A request is live while its status is anything but `withdrawn` — `open` and
-- `substituted` both mean the same thing about the person who filed it: they are
-- not coming. That is the first clause of gedu_is_expected_at_session, the
-- derivation the filing write is authorized by, and it is exactly the condition
-- under which that write refuses a second filing with 42501. A withdrawn request
-- is history and lets the gedu ask again, so it is not here.
--
-- Two deliberate inclusions and one bound:
--
--   * A request on a CANCELLED session is still live. Cancelling hides a request
--     rather than withdrawing it, and the write still refuses a second filing
--     there with 42501 before it reaches the cancellation check — so the list
--     says what the write would.
--   * A request somebody stood in on (`substituted`) is live: the filer is no
--     more expected there than at an open one.
--   * Bounded below at today in the PRODUCT's timezone, which is the write's own
--     past-session bound: a request on an earlier date is one no filing could be
--     made against again, so no list of sessions to file on needs it.
--
-- THE SHAPE
--
-- An array of request documents, built by substitution_request_document — the
-- one wire shape of a request — as the requester reads their own: who is absent
-- (themselves), the offer count, and no reason or note, exactly as the filing
-- write returns it. The surfaces need only the (group, date) pair today; the
-- whole document is what the caller may see of their own requests, and a read
-- returning one page's slice would turn the next field into a migration.
--
-- THE THREE FUNCTIONS
--
-- The same split the seat reads and the filing write have: an internal body
-- that takes the gedu, granted to nobody; the web's role-gated `auth.uid()`
-- wrapper; and the Discord bot's wrapper, granted to service_role alone, which
-- resolves the Discord user id first and refuses with P0031 when no gedu is
-- linked.

CREATE FUNCTION public.gedu_live_substitution_requests(p_gedu_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
           jsonb_agg(
             public.substitution_request_document(r, false, p_gedu_id)
             ORDER BY r.session_date, r.group_id
           ),
           '[]'::jsonb
         )
    FROM public.session_substitution_requests r
    JOIN public.product_groups g ON g.id = r.group_id
    JOIN public.products p       ON p.id = g.product_id
   WHERE r.requested_by = p_gedu_id
     -- The first clause of gedu_is_expected_at_session: a non-withdrawn
     -- request, open or substituted, means its filer is not coming.
     AND r.status <> 'withdrawn'::public.substitution_request_status
     -- The filing write's own past-session bound, in the product's zone.
     AND r.session_date >= (now() AT TIME ZONE p.timezone)::date;
$$;

COMMENT ON FUNCTION public.gedu_live_substitution_requests(p_gedu_id uuid) IS 'Internal: the given gedu''s LIVE substitution requests — every request they filed whose status is not withdrawn (open or substituted), dated today or later in the product''s timezone — as an array of request documents read as the requester reads their own (substitution_request_document with no reason, the viewer being the gedu), ordered by date then group. "Live" is the first clause of gedu_is_expected_at_session, so a (group, date) here is exactly one file_session_substitution_request refuses with 42501, and a withdrawn request, which lets the gedu ask again, is never here. A request on a cancelled session is included, because cancelling hides a request rather than withdrawing it and the write still refuses a second filing there. The lower bound is the write''s own past-session bound. Behind get_my_live_substitution_requests (the web, for auth.uid()) and get_live_substitution_requests_for_discord_user (the Discord bot, for the linked gedu); makes no role test of its own. Granted to nobody.';

REVOKE ALL ON FUNCTION public.gedu_live_substitution_requests(p_gedu_id uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_my_live_substitution_requests() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN public.gedu_live_substitution_requests((SELECT auth.uid()));
END;
$$;

COMMENT ON FUNCTION public.get_my_live_substitution_requests() IS 'The calling gedu''s live substitution requests, exactly as gedu_live_substitution_requests describes them for that gedu: gedu-gated on its first statement, then that function for auth.uid(). The Substitutions page''s absence picker reads it to show the sessions the gedu has already asked a substitute for as disabled; get_live_substitution_requests_for_discord_user is the Discord bot''s way in.';

REVOKE ALL ON FUNCTION public.get_my_live_substitution_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_live_substitution_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_live_substitution_requests() TO service_role;

CREATE FUNCTION public.get_live_substitution_requests_for_discord_user(p_discord_user_id text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_gedu_id uuid;
BEGIN
  v_gedu_id := public.require_discord_linked_gedu(p_discord_user_id);

  RETURN public.gedu_live_substitution_requests(v_gedu_id);
END;
$$;

COMMENT ON FUNCTION public.get_live_substitution_requests_for_discord_user(p_discord_user_id text) IS 'get_my_live_substitution_requests for the gedu a Discord user id acts as: require_discord_linked_gedu (P0031 when none), then gedu_live_substitution_requests for that gedu, so the requests are the very ones the web reads. The /sub command leaves those sessions out of its list. For the Discord bot, on the service-role client: granted to service_role alone.';

REVOKE ALL ON FUNCTION public.get_live_substitution_requests_for_discord_user(p_discord_user_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_substitution_requests_for_discord_user(p_discord_user_id text) TO service_role;
