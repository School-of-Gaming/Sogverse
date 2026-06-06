-- Rename commit_group_changes → apply_group_changes.
--
-- The admin groups panel is moving from a stage-many-then-commit workflow to
-- per-action auto-save. With client-side batching gone, "commit" no longer
-- describes what this function does: it applies a set of group-structure
-- changes atomically — one change or many. The new name matches the route
-- (POST /api/admin/products/[id]/groups/apply) and the service method
-- (applyChanges), so the whole stack speaks one verb.
--
-- ALTER ... RENAME preserves the body, SECURITY DEFINER, search_path, and the
-- grants (REVOKE from public/anon/authenticated + GRANT to authenticated set in
-- 00049 and carried through the 00072 rename), so no further statements are
-- needed. The function still self-gates on get_user_role() = 'admin' internally.
--
-- Only the 7-arg form exists: the legacy 5-arg overload was dropped in 00071.

ALTER FUNCTION public.commit_group_changes(
  p_product_id uuid,
  p_added_groups jsonb,
  p_renamed_groups jsonb,
  p_deleted_group_ids uuid[],
  p_gedu_assignments_added jsonb,
  p_gedu_assignments_removed jsonb,
  p_participation_moves jsonb
) RENAME TO apply_group_changes;
