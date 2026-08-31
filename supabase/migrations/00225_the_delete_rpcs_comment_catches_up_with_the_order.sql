-- The delete RPC's comment catches up with the order.
--
-- 00224 inverted photo removal: the route now deletes the storage OBJECT first
-- and the row second, with a check-only RPC proving the caller's authorization
-- in front of the privileged storage call. `delete_group_session_image` itself
-- is unchanged and needs no change — its guard still decides the row delete —
-- but its COMMENT still describes the route as deleting the object *afterwards*
-- and a failed object delete as logged and left, which is now false in both
-- halves. A migration cannot be amended once pushed, so the correction ships as
-- its own statement.
--
-- Comment only. No body, no signature, no grant is touched.

COMMENT ON FUNCTION public.delete_group_session_image(uuid) IS
  'Remove one photo''s ROW from a session''s report. Open to an ADMIN or to ANY '
  'gedu assigned to the group — there is no per-photo ownership, matching how '
  'the report itself is edited under the last-editor model. Guard-first on '
  'assert_role; the group is then resolved from the image''s own session row, '
  'and that resolution is the second half of the gate. A photo id that belongs '
  'to another group and one that belongs to nothing are refused identically '
  'with 42501, so this cannot be used as an oracle for real photo ids. The '
  'route calls this LAST: since 00224 it authorizes with assert_can_delete_'
  'session_image, removes the OBJECT through the Storage API (never with SQL '
  'against storage.objects, which orphans the backing file), and only then '
  'deletes the row here — so that a removal which failed to remove the picture '
  'leaves the photo on the card, visible and retryable, instead of taking the '
  'tile away while the object stands in a public bucket. This function''s own '
  'guard is not replaced by that check; it runs again on the actual delete. A '
  'row that survives a failed delete after its object is gone renders as a '
  'broken thumbnail, and the ordinary remove control is its repair: the storage '
  'API answers a delete of an absent object as success, so the retry reaches '
  'here and clears the row.';
