-- Complete the lockdown of _list_table_grants(text).
--
-- 00097 created the function with REVOKE ... FROM PUBLIC + an explicit
-- service_role GRANT -- sufficient on fresh stacks (no-default-grants
-- regime), but hosted DBs keep the legacy ALTER DEFAULT PRIVILEGES until
-- 2026-10-30, which auto-granted the new function to anon and authenticated
-- at creation. Those are explicit per-object grants, so REVOKE FROM PUBLIC
-- does not remove them. Note CI cannot catch this class of gap: fresh stacks
-- never see the hosted auto-grant, so the function looks locked down there
-- while staging/prod expose it. The schema.sql dump diff is where it shows.
-- Rule recorded in CLAUDE.md: until the hosted defaults flip, function
-- migrations keep explicit REVOKEs alongside their deliberate GRANTs.

REVOKE EXECUTE ON FUNCTION public._list_table_grants(text) FROM anon, authenticated;
