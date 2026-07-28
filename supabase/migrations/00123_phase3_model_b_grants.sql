-- Phase 3 of the DB authorization refactor (docs/db-authorization-architecture.md
-- §5 Phase 3), batch 2 of 3: the grants and policies the Model B client swaps
-- need.
--
-- Four routes touched only ordinary tables through the service-role client. Each
-- moves to the user-bound client, which means PostgreSQL's grant layer and the
-- table's RLS policies become the second and third checks behind the route's own
-- `requireRole` — instead of the route being the only check there was.
--
-- Every change here is ADDITIVE except the last, which removes a grant that
-- authorizes nothing today, so nothing currently deployed against this database
-- can be broken by pushing it ahead of the code (see 00122's header for why that
-- constraint governs this whole phase).

-- ---------------------------------------------------------------------------
-- locations — admin reference data
-- ---------------------------------------------------------------------------
-- `admin_manage_locations` is already FOR ALL with an admin predicate on both
-- halves; the table simply had no DML grant for `authenticated`, so the policy
-- was unreachable and writes had to bypass it. Granting exactly the two verbs
-- the location routes use (create, rename) leaves DELETE with no path other than
-- the service-role client, which matches the absence of a delete route.

GRANT INSERT, UPDATE ON TABLE public.locations TO authenticated;

-- ---------------------------------------------------------------------------
-- minecraft_accounts — the owner's own linked account
-- ---------------------------------------------------------------------------
-- Reads were already self-scoped (own row, plus a parent's view of a linked
-- gamer's). Writes had neither grant nor policy, so linking a Minecraft name ran
-- on the service-role client. These two policies are the write half of the same
-- shape: the target row IS the caller, so actor and target are the same check.
--
-- Deliberately NOT extended to a parent writing their linked gamer's row: the
-- parent-facing path goes through /api/gamers/[id], which is bound to the Auth
-- Admin API for the rest of its work and stays Model A. Widening the policy for
-- a route that cannot use it would be an unbacked grant.

GRANT INSERT, UPDATE ON TABLE public.minecraft_accounts TO authenticated;

CREATE POLICY users_insert_own_minecraft_account
  ON public.minecraft_accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY users_update_own_minecraft_account
  ON public.minecraft_accounts
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- profiles.locale — the fifth safe self-editable column
-- ---------------------------------------------------------------------------
-- `users_update_own_profile` already scopes profile UPDATEs to the caller's own
-- row and pins `role` to its current value; the locale route bypassed it only
-- because `locale` was missing from the column-level grant list. Locale decides
-- which translation of the UI you see and nothing else — it carries no
-- privilege, holds no money, and gates no enrollment — so it belongs with
-- first_name / last_name / phone / spoken_languages rather than behind an RPC.

GRANT UPDATE(locale) ON TABLE public.profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- whatsapp_messages — remove the dead UPDATE grant
-- ---------------------------------------------------------------------------
-- Found by Phase 2's column-grant audit: `authenticated` held UPDATE on this
-- table with no UPDATE policy behind it, so it authorized nothing — but it is
-- one unscoped CREATE POLICY away from authorizing the rewriting of message
-- history. The outbound-send route (the only authenticated writer, as of this
-- batch) inserts and never updates; the inbound webhook updates delivery status
-- through the service-role client, which is unaffected.

REVOKE UPDATE ON TABLE public.whatsapp_messages FROM authenticated;
