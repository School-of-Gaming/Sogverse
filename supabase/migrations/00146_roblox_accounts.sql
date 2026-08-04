-- Roblox identity gets a home, the way Minecraft has one.
--
-- The lookup has existed for a while (username -> numeric account id -> avatar
-- renders, all server-side) but nothing kept the answer: a child typed a Roblox
-- handle, the row verified it, and the page forgot it on reload. This migration
-- is the persistence half — a table shaped like minecraft_accounts, the same
-- self-write RLS, and the two account-creation RPCs threading a Roblox handle
-- through the same transaction they already thread a Minecraft one through.
--
-- WHY THE COLUMN TYPES DIFFER FROM MINECRAFT'S
--
-- Mojang's key is a dashed UUID and lives in a `text` column. Roblox's is an
-- int64 account id — the primary key every other Roblox API takes — so it is
-- `bigint`, not text. The two key spaces are deliberately not pretended to be
-- one: nothing in the app does arithmetic or string work on either, because the
-- only question ever asked of an account key is whether it is present.
--
-- NO UNIQUENESS, ON PURPOSE
--
-- 00135 dropped the UNIQUE constraint on minecraft_accounts.minecraft_uuid
-- because two siblings sharing one game account while holding separate Sogverse
-- accounts is a reasonable thing for a family to do, and the constraint forbade
-- it outright. Nothing about that reasoning is Minecraft-specific, so this table
-- is born without one rather than repeating the mistake and dropping it later.
--
-- AND NO SECONDARY INDEX, ALSO ON PURPOSE
--
-- 00135 replaced the dropped unique index with a plain one, because a reverse
-- lookup by Minecraft UUID is what the game server's join check does. Roblox has
-- no such endpoint and no such caller: every read of this table is by `user_id`,
-- which the primary key already serves. An index with no query behind it is
-- write cost for nothing, so `roblox_user_id` gets none until something asks a
-- question keyed on it.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE public.roblox_accounts (
  user_id        uuid PRIMARY KEY
                 REFERENCES public.profiles(id) ON DELETE CASCADE,
  roblox_username text,
  roblox_user_id  bigint
);

COMMENT ON TABLE public.roblox_accounts IS
  'One row per Sogverse account that has given a Roblox handle. Mirrors minecraft_accounts: the row key IS the profile, unlinking clears the columns rather than deleting the row, and two accounts may hold the same Roblox account (siblings share).';

COMMENT ON COLUMN public.roblox_accounts.roblox_username IS
  'The handle as Roblox spells it when a lookup confirmed one, or as the person typed it when no lookup could. Never rejected for being taken: a shared account is legitimate.';

COMMENT ON COLUMN public.roblox_accounts.roblox_user_id IS
  'Roblox''s int64 account id, present only when a lookup confirmed the account — its presence is the whole of "verified". Deliberately NOT unique: siblings sharing one Roblox account across two Sogverse accounts is supported, exactly as it is for Minecraft (00135).';

ALTER TABLE public.roblox_accounts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. Policies — the same four minecraft_accounts carries
-- ---------------------------------------------------------------------------
--
-- Reads: your own row; a parent's view of a linked gamer's row; an admin's view
-- of everything. Writes: your own row and no one else's. The target row IS the
-- caller on every write policy, so actor and target are the same check and
-- there is no id in the statement for an attacker to aim elsewhere.
--
-- Deliberately NOT extended to a parent writing their linked gamer's row: the
-- parent-facing edit path goes through /api/gamers/[id], which is bound to the
-- Auth Admin API for the rest of its work and writes on the service-role
-- client. Widening the policy for a route that cannot use it would be an
-- unbacked grant.

CREATE POLICY users_read_own_roblox_account
  ON public.roblox_accounts
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY users_insert_own_roblox_account
  ON public.roblox_accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY users_update_own_roblox_account
  ON public.roblox_accounts
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY parents_read_linked_gamer_roblox
  ON public.roblox_accounts
  FOR SELECT TO authenticated
  USING (public.is_parent_of(user_id));

CREATE POLICY admin_full_access_roblox_accounts
  ON public.roblox_accounts
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------
--
-- Nothing is exposed by default, not even to service_role. SELECT/INSERT/UPDATE
-- for authenticated — the exact verbs the self-serve link route uses, upserting
-- the caller's own row. No DELETE: unlinking clears the columns.

GRANT ALL ON TABLE public.roblox_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.roblox_accounts TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_gamer gains the optional Roblox pair
-- ---------------------------------------------------------------------------
--
-- Adding parameters changes the signature, so CREATE OR REPLACE would leave a
-- second overload behind and make an 8-argument call ambiguous. DROP the old
-- signature, recreate, and re-GRANT (DROP takes the grants with it). The body is
-- the current one from schema.sql with a Roblox insert added beside the
-- Minecraft one and nothing else touched.
--
-- The new pair defaults to NULL, matching the Minecraft pair: the route omits
-- them entirely when the parent left the field blank.

DROP FUNCTION public.create_gamer(
  uuid, uuid, text, text, date, public.gender_type, text, text
);

CREATE FUNCTION public.create_gamer(
  p_gamer_id           uuid,
  p_parent_id          uuid,
  p_first_name         text,
  p_last_name          text,
  p_date_of_birth      date,
  p_gender             public.gender_type DEFAULT NULL::public.gender_type,
  p_minecraft_username text   DEFAULT NULL::text,
  p_minecraft_uuid     text   DEFAULT NULL::text,
  p_roblox_username    text   DEFAULT NULL::text,
  p_roblox_user_id     bigint DEFAULT NULL::bigint
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  -- Promote the trigger-seeded customer profile to a gamer. Gate on role =
  -- 'customer' so this can't corrupt an already-promoted gamer or an admin/gedu,
  -- and so a double-call fails on the second pass. Keep the synthetic email
  -- handle_new_user() copied from auth.users — gamers are email-first.
  update public.profiles
  set role = 'gamer',
      first_name = p_first_name,
      last_name = p_last_name
  where id = p_gamer_id
    and role = 'customer';

  if not found then
    raise exception 'No promotable customer profile % found for gamer creation', p_gamer_id;
  end if;

  -- Swap extension tables: drop the customer row handle_new_user() created,
  -- add the gamer row.
  delete from public.customer_profiles where user_id = p_gamer_id;

  insert into public.gamer_profiles (user_id, date_of_birth, gender)
  values (p_gamer_id, p_date_of_birth, p_gender);

  -- Optional Minecraft link. Nothing here can reject a username: the account may
  -- be shared with another Sogverse user, and an unresolvable one simply lands
  -- with a null uuid. The insert is inside this transaction so a failure from any
  -- other cause still aborts the whole creation rather than leaving a half-built
  -- gamer.
  if p_minecraft_username is not null then
    insert into public.minecraft_accounts (user_id, minecraft_username, minecraft_uuid)
    values (p_gamer_id, p_minecraft_username, p_minecraft_uuid);
  end if;

  -- Optional Roblox link, on exactly the same terms: a shared account is fine,
  -- a handle Roblox could not resolve lands with a null account id, and the two
  -- platforms are independent — a child may have given one, both, or neither.
  if p_roblox_username is not null then
    insert into public.roblox_accounts (user_id, roblox_username, roblox_user_id)
    values (p_gamer_id, p_roblox_username, p_roblox_user_id);
  end if;

  -- Link to the parent. The validate_parent_gamer_on_insert trigger re-checks
  -- both roles, so this must run after the promote above.
  insert into public.parent_gamer (parent_id, gamer_id)
  values (p_parent_id, p_gamer_id);
end;
$$;

REVOKE ALL ON FUNCTION public.create_gamer(
  uuid, uuid, text, text, date, public.gender_type, text, text, text, bigint
) FROM PUBLIC;

GRANT ALL ON FUNCTION public.create_gamer(
  uuid, uuid, text, text, date, public.gender_type, text, text, text, bigint
) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. register_gedu gains the Roblox pair
-- ---------------------------------------------------------------------------
--
-- Same DROP-and-recreate reason as above. The new parameters are REQUIRED and
-- take '' for absent, because that is this function's existing calling
-- convention: the generated RPC arg types are non-null, so every optional text
-- it takes is passed as an empty string and NULLIF'd here. That convention is
-- why `p_roblox_user_id` is `text` rather than `bigint` — a bigint parameter
-- could not carry the empty-string sentinel, and inventing a second convention
-- for one argument is worse than casting once inside the body.

DROP FUNCTION public.register_gedu(
  uuid, text, text, text, text, text[], uuid[], text, text
);

CREATE FUNCTION public.register_gedu(
  p_user_id            uuid,
  p_first_name         text,
  p_last_name          text,
  p_locale             text,
  p_phone              text,
  p_spoken_languages   text[],
  p_location_ids       uuid[],
  p_minecraft_username text,
  p_minecraft_uuid     text,
  p_roblox_username    text,
  p_roblox_user_id     text
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only operate on a freshly-created customer profile (the role the new-user
  -- trigger seeds). Refusing anything else stops this from being used to mutate
  -- an established account of any role.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'customer'
  ) THEN
    RAISE EXCEPTION 'register_gedu: % is not a newly-created customer profile', p_user_id;
  END IF;

  -- Callers pass '' for absent optional text (the generated RPC arg types are
  -- non-null `string`); NULLIF turns those back into SQL NULL so e.g. an empty
  -- phone stays NULL rather than tripping the profiles.phone format CHECK.
  UPDATE public.profiles
  SET role             = 'gedu',
      first_name       = p_first_name,
      last_name        = p_last_name,
      locale           = NULLIF(p_locale, ''),
      phone            = NULLIF(p_phone, ''),
      spoken_languages = COALESCE(p_spoken_languages, '{}')
  WHERE id = p_user_id;

  -- Swap the trigger-created customer extension row for a gedu one.
  DELETE FROM public.customer_profiles WHERE user_id = p_user_id;
  INSERT INTO public.gedu_profiles (user_id) VALUES (p_user_id);

  -- Coverage areas (empty = remote-only, which is valid).
  IF p_location_ids IS NOT NULL AND array_length(p_location_ids, 1) IS NOT NULL THEN
    INSERT INTO public.gedu_locations (gedu_id, location_id)
    SELECT p_user_id, unnest(p_location_ids);
  END IF;

  -- Optional Minecraft account. A duplicate uuid is allowed (an educator may
  -- share an account with someone else on the platform), so this insert has no
  -- rejection path of its own.
  IF p_minecraft_username IS NOT NULL AND p_minecraft_username <> '' THEN
    INSERT INTO public.minecraft_accounts (user_id, minecraft_username, minecraft_uuid)
    VALUES (p_user_id, p_minecraft_username, NULLIF(p_minecraft_uuid, ''));
  END IF;

  -- Optional Roblox account, on the same terms. The account id arrives as text
  -- carrying the same '' sentinel and is cast once here; a non-numeric value
  -- would raise, which is correct — the only caller resolves it from Roblox's
  -- own answer, so anything else is a bug rather than a user's typo.
  IF p_roblox_username IS NOT NULL AND p_roblox_username <> '' THEN
    INSERT INTO public.roblox_accounts (user_id, roblox_username, roblox_user_id)
    VALUES (p_user_id, p_roblox_username, NULLIF(p_roblox_user_id, '')::bigint);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.register_gedu(
  uuid, text, text, text, text, text[], uuid[], text, text, text, text
) FROM PUBLIC;

GRANT ALL ON FUNCTION public.register_gedu(
  uuid, text, text, text, text, text[], uuid[], text, text, text, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Assert the end state
-- ---------------------------------------------------------------------------
--
-- Every statement above is unconditional, so none of them can take a branch its
-- author did not expect — but the two DROPs are the kind of thing that silently
-- succeeds against a database that already diverged, and a grant is exactly the
-- sort of line whose absence fails closed somewhere far away. Assert what the
-- file claims to have done, at the moment it runs.

DO $$
BEGIN
  IF NOT (
    SELECT relrowsecurity FROM pg_class
     WHERE oid = 'public.roblox_accounts'::regclass
  ) THEN
    RAISE EXCEPTION 'roblox_accounts has no row-level security';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.roblox_accounts', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.roblox_accounts', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.roblox_accounts', 'UPDATE')
  THEN
    RAISE EXCEPTION 'authenticated is missing a grant on roblox_accounts — every self-serve write would fail closed';
  END IF;

  IF has_table_privilege('authenticated', 'public.roblox_accounts', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated holds DELETE on roblox_accounts — unlinking clears the columns, it never removes the row';
  END IF;

  IF has_table_privilege('anon', 'public.roblox_accounts', 'SELECT') THEN
    RAISE EXCEPTION 'anon can read roblox_accounts — a child''s game identity is not public reference data';
  END IF;

  -- The DROPs above are what make these meaningful: an overload left behind
  -- would make every existing 8- or 9-argument call ambiguous at runtime, which
  -- is a failure nothing here would otherwise notice until a parent tried to add
  -- a child.
  IF (SELECT count(*) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'create_gamer') <> 1 THEN
    RAISE EXCEPTION 'create_gamer is not a single function — an old overload survived the DROP';
  END IF;

  IF (SELECT count(*) FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'register_gedu') <> 1 THEN
    RAISE EXCEPTION 'register_gedu is not a single function — an old overload survived the DROP';
  END IF;

  IF has_function_privilege(
       'authenticated',
       'public.create_gamer(uuid, uuid, text, text, date, public.gender_type, text, text, text, bigint)',
       'EXECUTE')
  THEN
    RAISE EXCEPTION 'create_gamer is reachable by authenticated — it promotes a profile and must stay service-role only';
  END IF;

  IF has_function_privilege(
       'authenticated',
       'public.register_gedu(uuid, text, text, text, text, text[], uuid[], text, text, text, text)',
       'EXECUTE')
  THEN
    RAISE EXCEPTION 'register_gedu is reachable by authenticated — it promotes a profile and must stay service-role only';
  END IF;
END;
$$;
