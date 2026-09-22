--
-- Name: create_gamer(uuid, uuid, text, text, date, public.gender_type, text, text, text, bigint, public.gamer_sign_in, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type DEFAULT NULL::public.gender_type, p_minecraft_username text DEFAULT NULL::text, p_minecraft_uuid text DEFAULT NULL::text, p_roblox_username text DEFAULT NULL::text, p_roblox_user_id bigint DEFAULT NULL::bigint, p_sign_in public.gamer_sign_in DEFAULT 'parent'::public.gamer_sign_in, p_guardian_attested boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_declaration_version text;
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

  -- The declaration, refused before anything is written and refused on NULL as
  -- well as on false: a three-valued answer to "are you this child's parent or
  -- guardian" is not an answer. There is no route by which a parent reaches
  -- this with the box unticked — the form disables the button and the body
  -- schema refuses anything but true — so this is the database's own guarantee
  -- rather than the user-facing check, and a plain raise is the right shape:
  -- nothing the parent can act on reaches them through it.
  if p_guardian_attested is not true then
    raise exception
      'a gamer may only be created with the guardian declaration attested';
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

  -- The declaration, against the wording that is current right now. It has to
  -- follow the gamer_profiles insert above, because that is what the row's
  -- foreign key points at. A slug with no published version is a broken deploy
  -- rather than a runtime condition, and it is named rather than left to the
  -- NOT NULL to abort with a message mentioning no document.
  select cdv.version
    into v_declaration_version
    from public.consent_document_versions cdv
   where cdv.document_slug = 'guardian-declaration'
   order by cdv.created_at desc, cdv.version desc
   limit 1;

  if v_declaration_version is null then
    raise exception 'no published version exists for guardian-declaration';
  end if;

  insert into public.gamer_consent_acceptances (
    gamer_id, document_slug, document_version, accepted_by
  )
  values (
    p_gamer_id, 'guardian-declaration', v_declaration_version, p_parent_id
  );

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


--
-- Name: FUNCTION create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type, p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id bigint, p_sign_in public.gamer_sign_in, p_guardian_attested boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type, p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id bigint, p_sign_in public.gamer_sign_in, p_guardian_attested boolean) IS 'The atomic promote-and-link the gamer-creation route calls once GoTrue has minted the auth user: swaps the trigger-seeded customer profile to a gamer in the parent''s locale, writes the gamer row with its chosen sign-in mode, records the parent''s guardian declaration about THIS child, links the optional game accounts, and links the parent — in ONE transaction, so a failure anywhere leaves nothing behind for the route to compensate but the auth user itself. service_role only. Refuses with SQLSTATE P0025 and the message PIN_REQUIRED when the named parent holds no PIN: the gate on leaving a gamer session is the parent''s PIN, so a family may not acquire a gamer before it has one, and the route turns that one refusal into a specific ask. Refuses with a plain raise when p_guardian_attested is not true — false and NULL alike, because a three-valued answer to "are you this child''s parent or guardian" is not an answer — and the declaration is written against the CURRENT version of the guardian-declaration document, resolved here and never supplied by a caller. The locale is copied from the parent once and never synced; the child changes it like anyone else. `p_sign_in` defaults to `parent`, the switch-only shape every gamer had before the modes existed; `p_guardian_attested` defaults to false so an untaught caller is refused rather than admitted.';


--
-- Name: FUNCTION create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type, p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id bigint, p_sign_in public.gamer_sign_in, p_guardian_attested boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type, p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id bigint, p_sign_in public.gamer_sign_in, p_guardian_attested boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_date_of_birth date, p_gender public.gender_type, p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id bigint, p_sign_in public.gamer_sign_in, p_guardian_attested boolean) TO service_role;


