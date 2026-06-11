-- Proactively flip hosted DBs to the no-default-grants regime.
--
-- Hosted projects keep the legacy auto-expose ALTER DEFAULT PRIVILEGES until
-- Supabase's platform flip on 2026-10-30, while fresh local stacks (CI) have
-- run the new regime since CLI v2.106.0. That asymmetry produced a class of
-- gap CI cannot catch: a function created by 00097 looked locked down on
-- every fresh stack while staging auto-granted it to anon/authenticated
-- (repaired in 00098). Rather than carrying a transition-window rule, this
-- migration removes the asymmetry: it replays the CLI's revoke on hosted, so
-- explicit GRANTs are the only access path in every environment.
--
-- Scope: the FOR ROLE postgres entries only -- migrations and the dashboard
-- SQL editor both run as postgres, so this covers everything we author. The
-- supabase_admin-scoped entries belong to platform machinery and cannot be
-- altered by postgres; Supabase retires them on 2026-10-30. Idempotent with
-- that flip, and a no-op on fresh stacks (already revoked by the CLI).
--
-- Affects FUTURE objects only; every existing grant is untouched.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;

-- PostgreSQL's built-in default also grants EXECUTE on new functions to
-- PUBLIC (every role, including anon). Override it so functions created by
-- postgres are born truly private; intended-public functions carry their own
-- explicit GRANTs per CLAUDE.md.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
