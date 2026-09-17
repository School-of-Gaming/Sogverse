-- The guardian-declaration table's comment says who may write it, correctly.
--
-- WHY
--
-- 00250 created `public.gamer_consent_acceptances` and described it as
-- "INSERT-ONLY and insert-only from ONE place: no Data API role holds a write
-- grant". The first half is the intent and is true; the second half is not what
-- the migration did. Its own grants are:
--
--   GRANT SELECT ON TABLE ... TO authenticated;
--   GRANT ALL    ON TABLE ... TO service_role;
--
-- and `ALL` is INSERT, UPDATE and DELETE among the rest. `service_role` is a
-- Data API role, so a reader taking the comment at its word would conclude that
-- an UPDATE or a DELETE against this table is impossible through PostgREST when
-- in fact the admin client can make one. That is the worst kind of wrong
-- comment on a table holding legal records: it describes a guarantee the
-- database is not making, and the thing it is wrong about is exactly what
-- somebody would check before trusting a row.
--
-- The grants themselves are RIGHT and are deliberately not touched. Every table
-- in this schema gives `service_role` the full set — it is the role the DB
-- suite's admin client and every server-side fixture act as, and narrowing this
-- one table to INSERT would make it the single exception with no way to clean
-- up after a test. What the design actually guarantees is narrower and still
-- worth stating: no `authenticated` or `anon` write grant exists, so no browser
-- session can write a row by any path, and `create_gamer` is the only intended
-- writer — which is what makes the declaration and the child arrive in one
-- transaction or not at all.
--
-- WHY A NEW MIGRATION FOR A COMMENT
--
-- 00250 is already applied on staging, and an applied migration is never edited
-- (supabase/CLAUDE.md, "Never amend a pushed migration"): the CLI matches on
-- version, so an edit to that file would never execute on staging and only CI's
-- fresh-from-migrations database would ever see the new text. A comment is
-- metadata and changing it in place would have been harmless to run — but it
-- would not have RUN, which is the whole failure mode the rule exists to stop.
-- So the corrected text ships the ordinary way, as its own migration.
--
-- Nothing but the COMMENT is re-issued. No table, column, policy, grant or
-- function changes here, so no generated type moves.

COMMENT ON TABLE public.gamer_consent_acceptances IS
  'One row per (gamer, document VERSION) an adult has accepted ABOUT THAT '
  'CHILD — the third subject in the 00210 consent system, beside '
  'consent_acceptances (per enrolment) and account_consent_acceptances (per '
  'account). What it exists for is the guardian declaration: the statement '
  'that this specific child is the adult''s own or that the adult is their '
  'legal guardian, made at the moment the child''s account is created and '
  'recorded against the wording that was on screen. An account-level '
  'declaration could not answer that, because an account that adds a second '
  'child later never said anything about the second one. NEVER REVOKED — a row '
  'is a statement that something was declared at an instant, and a statement '
  'about the past cannot be un-made, so there is no revoked_at column and there '
  'must never be one (the revocable photo consents are 00244 and are a separate '
  'system). INSERT-ONLY BY INTENT, and written from one place: neither '
  '`authenticated` nor `anon` holds any write grant, so no browser session can '
  'write a row by any path — they hold SELECT, gated by the two policies to a '
  'linked parent and to admins. `service_role` holds the usual full set, as it '
  'does on every table here, and create_gamer — service_role only — is the sole '
  'intended writer, which is what makes the declaration and the child arrive in '
  'one transaction or not at all.';
