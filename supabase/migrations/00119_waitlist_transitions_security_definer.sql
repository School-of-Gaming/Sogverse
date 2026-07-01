-- Fix: promote_from_waitlist / demote_to_waitlist must be SECURITY DEFINER.
--
-- 00118 created both as plain (SECURITY INVOKER) plpgsql functions. They run an
-- UPDATE on participations, but the authenticated `admin` caller has no UPDATE
-- grant on that table (writes go through SECURITY DEFINER RPCs by design), so
-- every call failed with "permission denied for table participations" (42501).
-- Their sibling apply_group_changes is SECURITY DEFINER for exactly this reason.
--
-- Safe to elevate: both self-gate on get_user_role() = 'admin' as their first
-- statement, both already SET search_path TO '' and fully schema-qualify, and
-- the existing grants (authenticated + service_role) are unchanged by ALTER.
ALTER FUNCTION public.promote_from_waitlist(uuid, uuid) SECURITY DEFINER;
ALTER FUNCTION public.demote_to_waitlist(uuid) SECURITY DEFINER;
