-- A photo is authorized before its object is deleted.
--
-- 00222 shipped photo removal as row-first: the delete RPC took the row out on
-- the caller's own client, and the route then removed the object with the admin
-- client, logging a failure and answering 204 regardless. That order makes one
-- outcome unreachable, and it is the outcome the owner asked for: a removal that
-- did not actually remove the picture must be VISIBLE to the gedu, with the
-- photo still on the card so they can try again. Row-first cannot offer that —
-- the row is what every surface reads, so once it is gone the tile is gone and
-- there is nothing left to retry against, while the object (the thing the
-- removal exists to destroy, and the only kill switch for every emailed copy of
-- its URL) may still be sitting in a public bucket.
--
-- So the route now deletes the OBJECT first and the row second. That inversion
-- creates the problem this migration exists to solve: the object delete runs on
-- the SERVICE-ROLE client, because the bucket carries no policies at all, and
-- the caller's authorization used to be proved by the row delete — which now
-- happens afterwards. An admin client must never remove an object on behalf of a
-- caller whose right to do so has not been established, so the authorization has
-- to move in front of it.
--
-- WHY A CHECK-ONLY RPC AND NOT A SECOND ARGUMENT ON THE DELETE
--
-- This function performs NO mutation. It answers exactly one question — "may
-- this caller remove this photo?" — on the caller's own client, so the answer
-- comes from auth.uid() and the same two-part gate every session writer carries.
-- The route then removes the object and calls delete_group_session_image, which
-- re-runs its own guard on the actual delete: the check here does not replace
-- that guard and must not be read as doing so. What it removes is the window in
-- which a privileged storage call would run unauthorized; the window it leaves —
-- between this check and the row delete — is cosmetic, because nothing in it can
-- widen what the caller may do (losing an assignment mid-request only makes the
-- second call fail, never succeed).
--
-- Splitting the check out rather than folding a "dry run" flag into the delete
-- keeps each function's body one thing: a caller reading delete_group_session_
-- image still sees a function that deletes, and the spine still classifies both
-- as ordinary guard-first, role-gated writers with no mode parameter to reason
-- about.
--
-- WHY THE REFUSAL STAYS ORACLE-FREE
--
-- Byte for byte the delete RPC's own gate, including the arm where a photo id
-- belonging to nothing and one belonging to another group are refused
-- IDENTICALLY. A check-only function is exactly the shape that would tempt
-- somebody to distinguish them "for a better error message", and doing so would
-- turn it into an oracle for real photo ids — which name objects in a public
-- bucket, where an unguessable name IS the access control.

CREATE FUNCTION public.assert_can_delete_session_image(p_image_id uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  -- Deliberately not STABLE, though the body only reads: it is a GUARD, and a
  -- guard is not something the planner should be free to evaluate once and reuse
  -- within a statement. The two functions it wraps are the same ones the delete
  -- RPC calls, in the same order.
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_group_id uuid;
BEGIN
  -- An admin, or a gedu. Guard-first on the first statement, in the shape the
  -- authorization spine reads and every other session RPC carries.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  SELECT s.group_id
    INTO v_group_id
    FROM public.group_session_images i
    JOIN public.group_sessions s ON s.id = i.session_id
   WHERE i.id = p_image_id;

  -- No row and somebody else's row answer the same way, exactly as they do in
  -- delete_group_session_image. The caller has no right to learn which it was.
  IF v_group_id IS NULL
     OR (NOT public.is_admin() AND NOT public.gedu_teaches_group(v_group_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The id it validated, so a caller has a positive answer rather than the
  -- absence of an error. Returning it discloses nothing: it is the id the caller
  -- just sent, and it comes back only on the path where they were allowed.
  RETURN p_image_id;
END;
$$;

COMMENT ON FUNCTION public.assert_can_delete_session_image(uuid) IS
  'May this caller remove this photo? A CHECK-ONLY function: it mutates '
  'nothing, and it exists because the route deletes the storage object BEFORE '
  'the row, on the service-role client, and an admin client must never act for '
  'a caller whose authorization has not been proved. Object-first is what makes '
  'a failed removal visible and retryable — the row is what every surface '
  'reads, so deleting it first would take the tile away and leave the object '
  'standing in a public bucket with nothing left to retry against. The gate is '
  'byte for byte delete_group_session_image''s: guard-first on assert_role for '
  'an ADMIN or a gedu, then the group resolved from the image''s own session '
  'row, with a photo id belonging to another group and one belonging to nothing '
  'refused IDENTICALLY with 42501 — never distinguish them, or this becomes an '
  'oracle for real photo ids, which name objects whose unguessable names are '
  'the access control. Returns the id it validated. It does not replace the '
  'delete RPC''s own guard, which still runs on the actual delete afterwards; '
  'the window between the two is cosmetic, because nothing inside it can widen '
  'what a caller may do.';

REVOKE EXECUTE ON FUNCTION public.assert_can_delete_session_image(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_can_delete_session_image(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_can_delete_session_image(uuid)
  TO service_role;
