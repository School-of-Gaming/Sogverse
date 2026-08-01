-- Drops the UNIQUE constraint on minecraft_accounts.minecraft_uuid, so more than
-- one Sogverse account may link the same Minecraft account.
--
-- WHY
--
-- Two siblings sharing one Minecraft account while holding separate Sogverse
-- accounts is a reasonable thing for a family to do, and the constraint forbade
-- it outright: the second child's creation failed with "already linked to
-- another user" and the parent's only workaround was to leave the field blank.
--
-- What the constraint bought was a single-row reverse lookup (Minecraft UUID →
-- Sogverse user). The only such lookup on the surface is the Minecraft server's
-- join check, and the question that endpoint asks is an entitlement question —
-- "does anyone holding this Minecraft UUID have access to this server right
-- now?" — which is answered by a set of rows, not by one. The constraint never
-- answered the *identity* question either ("which sibling is at the keyboard?");
-- it only forbade the situation in which the question arises, and no constraint
-- can answer it once two people genuinely share an account.
--
-- The username column is untouched because it never had a constraint — it has
-- always accepted duplicates. Uniqueness lived here, on the resolved UUID.
--
-- THE INDEX
--
-- Dropping the constraint drops the index backing it, and the UUID lookup is
-- exactly what the join check does. Replaced with a plain (non-unique) index so
-- that lookup keeps its index without the uniqueness.

ALTER TABLE public.minecraft_accounts
  DROP CONSTRAINT IF EXISTS minecraft_accounts_uuid_unique;

CREATE INDEX IF NOT EXISTS minecraft_accounts_uuid_idx
  ON public.minecraft_accounts (minecraft_uuid);

-- Both statements above are conditional, and a conditional whose predicate does
-- not match is indistinguishable from one that did its job — the only
-- production discrepancy on record was a migration that took a branch its author
-- did not expect. So assert the end state rather than trusting the branch: any
-- unique index over minecraft_uuid still standing (under this constraint's name
-- or another) and the drop did not achieve what it claims.

DO $$
DECLARE
  leftover text;
BEGIN
  SELECT i.relname
    INTO leftover
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a
      ON a.attrelid = t.oid AND a.attnum = ANY (x.indkey)
   WHERE n.nspname = 'public'
     AND t.relname = 'minecraft_accounts'
     AND a.attname = 'minecraft_uuid'
     AND x.indisunique
   LIMIT 1;

  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION
      'minecraft_accounts.minecraft_uuid is still uniquely indexed by % — two users cannot share a Minecraft account until it is gone',
      leftover;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_class i
      JOIN pg_namespace n ON n.oid = i.relnamespace
     WHERE n.nspname = 'public'
       AND i.relname = 'minecraft_accounts_uuid_idx'
       AND i.relkind = 'i'
  ) THEN
    RAISE EXCEPTION
      'minecraft_accounts_uuid_idx is missing — the uuid lookup would fall back to a sequential scan';
  END IF;
END;
$$;

-- Both account-creation RPCs carried comments explaining how a duplicate UUID
-- surfaces from their Minecraft INSERT. That path no longer exists, so the
-- comments are re-stated rather than left describing a constraint that is gone.
-- Bodies are otherwise byte-for-byte the pre-existing ones; CREATE OR REPLACE
-- preserves the existing grants.

CREATE OR REPLACE FUNCTION public.create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type DEFAULT NULL::public.gender_type, p_minecraft_username text DEFAULT NULL::text, p_minecraft_uuid text DEFAULT NULL::text) RETURNS void
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

  -- Link to the parent. The validate_parent_gamer_on_insert trigger re-checks
  -- both roles, so this must run after the promote above.
  insert into public.parent_gamer (parent_id, gamer_id)
  values (p_parent_id, p_gamer_id);
end;
$$;

CREATE OR REPLACE FUNCTION public.register_gedu(p_user_id uuid, p_first_name text, p_last_name text, p_locale text, p_phone text, p_spoken_languages text[], p_location_ids uuid[], p_minecraft_username text, p_minecraft_uuid text) RETURNS void
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
END;
$$;
