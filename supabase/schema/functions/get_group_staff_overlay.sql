--
-- Name: get_group_staff_overlay(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_group_staff_overlay(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_type public.product_type;
  v_members      jsonb;
BEGIN
  -- Guard-first, in the shape set_group_notes established and the authorization
  -- spine reads: the role half admits an admin or a gedu and refuses everyone
  -- else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. An admin passes it outright; a gedu has to teach some
  -- group of this group's product.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group_product(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The product type travels because the voice room has NO other route to it:
  -- /voice/group/[id] is passed a group id and a back link, VoiceRoomContext
  -- carries groupId and isModerator, and the token deliberately puts nothing
  -- staff-shaped on itself. The newcomer badge is a clubs-only PRESENTATION
  -- rule and the join stamp is a FACT, so the fact is emitted unconditionally
  -- and the client applies the rule — one shared helper instead of the same
  -- decision baked into four RPCs.
  SELECT p.product_type INTO v_product_type
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  -- One entry per ACTIVE participation of the group, note or no note, stamp or
  -- no stamp — the same map shape get_gedu_group_feed already uses for
  -- attendance. So the map's own keys name exactly the people a note may be
  -- written about, which is the seat-holder set the room needs; a separate ids
  -- array would be a second list of the same people to keep true. A participant
  -- id absent from the map — a visiting admin, the gedu themselves, a stale
  -- peer — simply gets no flair.
  --
  -- No join can fan a row out: gamer_group_notes and gamer_group_creations are
  -- each keyed on exactly (group_id, participant_id) and profiles.id is a
  -- primary key.
  SELECT COALESCE(jsonb_object_agg(part.participant_id, jsonb_build_object(
           'group_joined_at',            part.group_joined_at,
           'note',                       n.note,
           'note_updated_by_first_name', ed.first_name,
           -- 00227. Always an array, never null: absence of a row means an
           -- empty list, and the reader should not have to know that.
           'creations',                  COALESCE(cr.creations, '[]'::jsonb)
         )), '{}'::jsonb)
    INTO v_members
    FROM public.participations part
    LEFT JOIN public.gamer_group_notes n
           ON n.group_id       = part.group_id
          AND n.participant_id = part.participant_id
    LEFT JOIN public.profiles ed ON ed.id = n.updated_by
    LEFT JOIN public.gamer_group_creations cr
           ON cr.group_id       = part.group_id
          AND cr.participant_id = part.participant_id
   WHERE part.group_id = p_group_id
     AND part.status   = 'active'::public.participation_status;

  RETURN jsonb_build_object(
    'product_type', v_product_type,
    'members',      v_members
  );
END;
$$;


--
-- Name: FUNCTION get_group_staff_overlay(p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_group_staff_overlay(p_group_id uuid) IS 'The staff-only marks for one group''s active roster, in one document: product_type, and a map keyed by participant id whose entries carry group_joined_at, note, note_updated_by_first_name and — since 00227 — creations. Open to an ADMIN or to any gedu assigned to any group of the group''s product, guard-first on assert_role with the ownership question as a second 42501 — the same shape set_group_notes uses. Built for the voice room, which has no other route to these marks: staff-only data must never ride the Daily token or user_name, because that channel is broadcast to every peer including children. A refused caller means the flair is gated by data access rather than by a viewer prop. Note that `creations` is the one entry here that is NOT staff-only — the gamer''s own family reads the same list on their product page — but it rides this document because the per-gamer dialog is identical in every mount, including in-session. It is emitted as [] rather than null when there is no row, because a list has a real empty value where a note does not. product_type is on the document because the room knows only a group id, and the clubs-only newcomer rule is applied client-side from it. Every active member appears whether or not they have a note or a creation, so the map''s keys are the seat-holder set. An unknown group id returns a null-shaped document to an admin rather than raising.';


--
-- Name: FUNCTION get_group_staff_overlay(p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_group_staff_overlay(p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_group_staff_overlay(p_group_id uuid) TO authenticated;


