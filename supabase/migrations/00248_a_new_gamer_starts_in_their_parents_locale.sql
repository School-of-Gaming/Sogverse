-- A new gamer starts in their parent's locale.
--
-- WHY
--
-- A gamer was created with no locale at all. Nothing in the promotion wrote one,
-- so every surface that resolves the child's locale fell through to whatever
-- browser happened to be asking: the welcome mail sent to an `email`-mode child
-- went out in the language of the PARENT'S browser, not the language the parent
-- uses the site in. A parent in France using the site in English sent their
-- child a French mail.
--
-- WHAT CHANGES
--
-- The promotion copies the parent's `profiles.locale` onto the child in the same
-- UPDATE that makes the child a gamer. It is part of creating a gamer, not a
-- follow-up write: the child exists in its parent's locale from the moment it
-- exists at all, inside the one transaction that already guarantees a failure
-- leaves nothing behind. Copied once and never synced — the child changes it
-- with the locale picker like anyone else. A parent's locale is stored when they
-- register, so the copy is a real value in practice; a NULL is copied as NULL
-- (auto-detect) rather than invented.
--
-- The argument list is unchanged, so this is CREATE OR REPLACE and the grants
-- survive. They are re-issued anyway, REVOKE first, so this file states the
-- whole access posture of the function it defines.

CREATE OR REPLACE FUNCTION public.create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type DEFAULT NULL::public.gender_type, p_minecraft_username text DEFAULT NULL::text, p_minecraft_uuid text DEFAULT NULL::text, p_roblox_username text DEFAULT NULL::text, p_roblox_user_id bigint DEFAULT NULL::bigint, p_sign_in public.gamer_sign_in DEFAULT 'parent'::public.gamer_sign_in) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  -- The PIN invariant, first and before anything is written: a gamer must never
  -- exist in a family that has no parent PIN, because the gate on leaving a
  -- gamer session IS that PIN, and a family without one would leave the gate
  -- with nothing behind it. Named SQLSTATE, because this is the one failure in
  -- this body the parent can actually act on — the route turns P0025 into "set
  -- a PIN first" rather than into the generic failure the raises below get.
  if not exists (
    select 1 from public.customer_profiles
     where user_id = p_parent_id
       and pin_hash is not null
  ) then
    raise exception 'PIN_REQUIRED' using errcode = 'P0025';
  end if;

  -- Promote the trigger-seeded customer profile to a gamer. Gate on role =
  -- 'customer' so this can't corrupt an already-promoted gamer or an admin/gedu,
  -- and so a double-call fails on the second pass. Keep the synthetic email
  -- handle_new_user() copied from auth.users — gamers are email-first.
  --
  -- The child starts in the parent's locale: the parent is the one setting the
  -- account up, so the welcome mail and the child's first sign-in read the way
  -- the parent uses the site. Copied once, never synced; the child's to change.
  update public.profiles
  set role = 'gamer',
      first_name = p_first_name,
      last_name = p_last_name,
      locale = (select parent.locale from public.profiles parent where parent.id = p_parent_id)
  where id = p_gamer_id
    and role = 'customer';

  if not found then
    raise exception 'No promotable customer profile % found for gamer creation', p_gamer_id;
  end if;

  -- Swap extension tables: drop the customer row handle_new_user() created,
  -- add the gamer row.
  delete from public.customer_profiles where user_id = p_gamer_id;

  -- `sign_in` rides along rather than being written afterwards: the route has
  -- already created the auth user with whichever address the chosen mode calls
  -- for, so the mode and the address it describes land in one transaction.
  insert into public.gamer_profiles (user_id, date_of_birth, gender, sign_in)
  values (p_gamer_id, p_date_of_birth, p_gender, p_sign_in);

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

COMMENT ON FUNCTION public.create_gamer(uuid, uuid, text, text, date, public.gender_type, text, text, text, bigint, public.gamer_sign_in) IS
  'The atomic promote-and-link the gamer-creation route calls once GoTrue has minted '
  'the auth user: swaps the trigger-seeded customer profile to a gamer in the parent''s '
  'locale, writes the gamer row with its chosen sign-in mode, links the optional game '
  'accounts, and links the parent — in ONE transaction, so a failure anywhere leaves '
  'nothing behind for the route to compensate but the auth user itself. service_role '
  'only. Refuses with SQLSTATE P0025 and the message PIN_REQUIRED when the named parent '
  'holds no PIN: the gate on leaving a gamer session is the parent''s PIN, so a family '
  'may not acquire a gamer before it has one, and the route turns that one refusal into '
  'a specific ask. The locale is copied from the parent once and never synced; the '
  'child changes it like anyone else. `p_sign_in` defaults to `parent`, the switch-only '
  'shape every gamer had before the modes existed.';

REVOKE EXECUTE ON FUNCTION public.create_gamer(uuid, uuid, text, text, date, public.gender_type, text, text, text, bigint, public.gamer_sign_in) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_gamer(uuid, uuid, text, text, date, public.gender_type, text, text, text, bigint, public.gamer_sign_in) TO service_role;

-- ---------------------------------------------------------------------------
-- Assertions
-- ---------------------------------------------------------------------------
--
-- A replacement re-asserts what the function it supersedes established, plus
-- what it adds. Read from the catalog, never from the text above, so a clause
-- dropped while retyping the body fails here rather than in a test somebody has
-- to think to write.

DO $$
DECLARE
  v_sig constant text := 'public.create_gamer(uuid, uuid, text, text, date, public.gender_type, text, text, text, bigint, public.gamer_sign_in)';
  v_src text;
BEGIN
  SELECT pr.prosrc
    INTO v_src
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public'
     AND pr.proname = 'create_gamer';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'create_gamer is missing after being replaced';
  END IF;

  IF (SELECT count(*) FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
       WHERE n.nspname = 'public' AND pr.proname = 'create_gamer') <> 1 THEN
    RAISE EXCEPTION 'create_gamer is overloaded — a call would be ambiguous';
  END IF;

  -- --- (a) The PIN invariant is still the first thing the body does. --------
  IF position('P0025' IN v_src) = 0
     OR position('P0025' IN v_src) > position('update public.profiles' IN v_src) THEN
    RAISE EXCEPTION 'create_gamer no longer refuses a PIN-less family before its first write';
  END IF;

  -- --- (b) The promotion, still gated on a customer profile. ---------------
  IF position('role = ''gamer''' IN v_src) = 0
     OR position('and role = ''customer''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'create_gamer lost its customer-gated promotion';
  END IF;

  -- --- (c) What this migration adds: the parent's locale, in that UPDATE. ---
  IF position('locale = (select parent.locale from public.profiles parent where parent.id = p_parent_id)' IN v_src) = 0 THEN
    RAISE EXCEPTION 'create_gamer does not copy the parent''s locale onto the new gamer';
  END IF;

  -- --- (d) Every write it made before. -------------------------------------
  IF position('insert into public.gamer_profiles (user_id, date_of_birth, gender, sign_in)' IN v_src) = 0
     OR position('insert into public.minecraft_accounts' IN v_src) = 0
     OR position('insert into public.roblox_accounts' IN v_src) = 0
     OR position('insert into public.parent_gamer' IN v_src) = 0
     OR position('delete from public.customer_profiles' IN v_src) = 0 THEN
    RAISE EXCEPTION 'create_gamer lost one of the writes that make up a gamer';
  END IF;

  -- --- (e) service_role only. ----------------------------------------------
  IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'create_gamer lost its service_role grant';
  END IF;

  IF has_function_privilege('anon', v_sig, 'EXECUTE')
     OR has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'create_gamer is executable by anon or authenticated — it is service_role only';
  END IF;
END $$;
