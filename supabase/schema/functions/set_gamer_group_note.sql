--
-- Name: set_gamer_group_note(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_row  public.gamer_group_notes;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ACTOR half: an admin, or a gedu who teaches this group's product. Read
  -- and write parity between the two is deliberate — refusing a substitute
  -- standing in for another group would make the feature useless in the one
  -- situation it matters most.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group_product(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The TARGET half: a note may only be written about somebody who sits in the
  -- group it is filed under. Without this an authorized gedu could file a note
  -- against any profile id on the platform. The table carries no write grant,
  -- so it is correctly outside the write-IDOR loop's completeness check — these
  -- two checks together are what stands in for an entry there, and the db tests
  -- assert both halves negatively.
  --
  -- ANY status counts, not just active: a note about somebody on the group's
  -- waitlist is a coherent thing to write, and narrowing it buys nothing. What
  -- it does exclude is a member who has LEFT the group, which is why an
  -- orphaned note cannot be edited back into life.
  IF NOT EXISTS (
    SELECT 1 FROM public.participations part
     WHERE part.group_id       = p_group_id
       AND part.participant_id = p_participant_id
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- A trimmed-empty save DELETES the row. Clearing a note is how a gedu retires
  -- guidance that no longer applies, and the absence of a row is what "no note"
  -- means on every surface — so the empty save has to produce that absence
  -- rather than an empty string standing in for it. The returned document is
  -- the null shape, so a caller merges the same keys either way.
  IF v_note IS NULL THEN
    DELETE FROM public.gamer_group_notes
     WHERE group_id = p_group_id AND participant_id = p_participant_id;

    RETURN jsonb_build_object(
      'group_id',                   p_group_id,
      'participant_id',             p_participant_id,
      'note',                       NULL,
      'note_updated_by_first_name', NULL,
      'updated_at',                 NULL
    );
  END IF;

  -- Upsert, last-write-wins, no history: only the last editor is stored.
  -- updated_at is left to the touch trigger. Length is NOT checked here — the
  -- CHECK refuses anything over 2000 with 23514, and since the dialog caps at
  -- 2000 a longer write can only come from a non-UI caller, which deserves a
  -- loud refusal rather than a silent truncation.
  INSERT INTO public.gamer_group_notes AS n
         (group_id, participant_id, note, updated_by)
  VALUES (p_group_id, p_participant_id, v_note, (SELECT auth.uid()))
  ON CONFLICT (group_id, participant_id) DO UPDATE
     SET note       = EXCLUDED.note,
         updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'group_id',       v_row.group_id,
    'participant_id', v_row.participant_id,
    'note',           v_row.note,
    -- Resolved at read time on purpose, unlike the signed-name snapshot on a
    -- contract acceptance: this line answers "who should I ask about this
    -- note", so the name they go by today is the right answer. NULL when the
    -- editor's account is gone (updated_by is ON DELETE SET NULL), and the
    -- surface then shows the note with no editor line.
    'note_updated_by_first_name',
      (SELECT pr.first_name FROM public.profiles pr WHERE pr.id = v_row.updated_by),
    'updated_at',     v_row.updated_at
  );
END;
$$;


--
-- Name: FUNCTION set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text) IS 'Write, replace or clear the staff note about one member of one group, and return the resulting document (group_id, participant_id, note, note_updated_by_first_name, updated_at). Open to an ADMIN or to any gedu assigned to any group of the group''s product, with full read/write parity between the two; guard-first on assert_role, then two further 42501s — the ACTOR half (staff reach over the product) and the TARGET half (the participant actually holds a participation in that group, at ANY status). The target half is what stands in for a write-IDOR loop entry, since the table carries no write grant for any client role. A trimmed-empty note DELETES the row and returns the null-shaped document, because absence of a row is what "no note" means everywhere else. Over-long notes are refused by the table''s CHECK (23514) rather than truncated. Last-write-wins, and only the last editor is stored — there is no history. A note does not follow a member moved to another group: it stays where it was written.';


--
-- Name: FUNCTION set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_gamer_group_note(p_group_id uuid, p_participant_id uuid, p_note text) TO authenticated;


