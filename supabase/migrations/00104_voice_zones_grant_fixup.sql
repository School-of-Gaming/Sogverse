-- Fixup for 00103_voice_zones.sql — two access-control gaps the DB tests caught
-- after 00103 had already been applied to staging (so the fix lands here rather
-- than in 00103, mirroring the 00095–00099 append-only grant-repair sequence).
-- Both statements are idempotent, so a fresh stack that already ran the
-- corrected intent is unaffected.

-- 1. The admin client (service_role) needs table grants too: new tables have no
--    Data API access by default, *not even for service_role* (root CLAUDE.md).
--    The token endpoint (locked-room flow) and the db-test seeding both write
--    these via the admin client. RLS is bypassed by service_role; the grant is
--    what the PostgREST layer checks.
grant select, insert, update, delete on public.voice_zones to service_role;
grant select, insert, delete on public.voice_locked_placements to service_role;

-- 2. CREATE FUNCTION grants EXECUTE to PUBLIC by default. 00103's explicit
--    `GRANT ... TO authenticated` doesn't displace that, so anon could call the
--    helpers — the bidirectional access-control test flags it. Strip the PUBLIC
--    grant; the deliberate `TO authenticated` from 00103 still stands (the
--    policies evaluate these in the caller's context, same as can_read_product).
revoke all on function public.is_voice_group_member(uuid) from public;
revoke all on function public.is_voice_group_moderator(uuid) from public;
