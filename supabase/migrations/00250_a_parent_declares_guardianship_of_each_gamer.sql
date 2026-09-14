-- A parent declares, for EACH child they add, that the child is theirs or that
-- they are the child's legal guardian — and says so having been given the
-- Privacy Policy to read. The declaration is recorded against that child.
--
-- WHY IT MOVES OFF THE ACCOUNT
--
-- 00249 put one declaration on the ACCOUNT, ticked once at registration. That
-- answers "is this account holder a parent or guardian of somebody", which is
-- not the question Article 8 asks. Consent on behalf of a child has to come
-- from the holder of parental responsibility FOR THAT CHILD, and an account
-- that adds a second child a year later never said anything about the second
-- one. A declaration that is made once and then silently stretched over every
-- child added afterwards is evidence about the first child and nothing more.
--
-- So the declaration is asked where the child is named — the add-gamer form —
-- and is recorded per gamer, in the same transaction that creates the gamer.
-- Registration keeps its terms acceptance and asks nothing about guardianship;
-- the account-level rows already on file are untouched and stay true statements
-- about the moment they were made.
--
-- WHY A NEW TABLE AND NOT account_consent_acceptances
--
-- The same reasoning 00249 used one table over. `account_consent_acceptances`
-- is keyed on the ACCOUNT and its comment says a row there conditions no seat
-- and belongs to the account. A declaration about one child is about the child;
-- keying it on the account would either overwrite the previous child's row (the
-- primary key is (account, slug, version)) or need a fourth key column that
-- only one slug would ever use. Neither is a table that tells the truth about
-- its own subject. Three tables, one registry, and each says what it is about:
-- per enrolment, per account, per gamer.
--
-- WHY IT STILL CARRIES A DOCUMENT SLUG AND VERSION
--
-- Because the question in a dispute is WHICH TEXT was on screen, and 00210
-- already built the answer: `consent_documents` is the identity,
-- `consent_document_versions` one row per published revision, and the current
-- version of a slug is the row with the greatest created_at (version DESC to
-- break a tie deterministically). A boolean column on `gamer_profiles` would
-- record that a box was ticked and lose the sentence it was ticked against.
-- Rewording the declaration stays one INSERT, and every gamer already on file
-- goes on naming the wording their parent was actually shown.
--
-- WHAT IS DELIBERATELY ABSENT, and it is 00210's list again
--
--   * No revocation. A row is a statement that something was declared at an
--     instant, and a statement about the past cannot be un-made. There is no
--     revoked_at column and there must never be one.
--   * No Data API write path. The only writer is create_gamer, which is granted
--     to `service_role` alone.

-- ---------------------------------------------------------------------------
-- 1. The reworded declaration
-- ---------------------------------------------------------------------------
--
-- The sentence changed with the surface it is asked on: it names the child
-- ("<name> is my child, or I am their legal guardian.") and points at the
-- Privacy Policy rather than the Terms, which registration still asks about.
-- A new wording is a new version, never an edit of the old row — the accounts
-- that accepted 2026-09-11 agreed to that text and go on naming it.

INSERT INTO public.consent_document_versions (document_slug, version) VALUES
  ('guardian-declaration', '2026-09-14');

-- ---------------------------------------------------------------------------
-- 2. The acceptances
-- ---------------------------------------------------------------------------

CREATE TABLE public.gamer_consent_acceptances (
  gamer_id         uuid NOT NULL
                     REFERENCES public.gamer_profiles(user_id) ON DELETE CASCADE,
  document_slug    text NOT NULL,
  document_version text NOT NULL,
  accepted_at      timestamptz NOT NULL DEFAULT now(),
  accepted_by      uuid NOT NULL REFERENCES public.profiles(id),
  PRIMARY KEY (gamer_id, document_slug, document_version),
  CONSTRAINT gamer_consent_acceptances_document_fkey
    FOREIGN KEY (document_slug, document_version)
    REFERENCES public.consent_document_versions(document_slug, version)
);

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
  'system). INSERT-ONLY and insert-only from ONE place: no Data API role holds '
  'a write grant, and create_gamer — service_role only — is the sole writer, '
  'which is what makes the declaration and the child arrive in one transaction '
  'or not at all.';

COMMENT ON COLUMN public.gamer_consent_acceptances.gamer_id IS
  'The child the declaration is ABOUT, keyed to gamer_profiles rather than to '
  'profiles so the foreign key itself says the subject is a gamer. ON DELETE '
  'CASCADE: a declaration of guardianship over somebody who no longer has an '
  'account governs nothing.';

COMMENT ON COLUMN public.gamer_consent_acceptances.document_slug IS
  'Which document, never which revision of it — the stable identity in '
  'consent_documents.slug. A column rather than a hardcoded assumption that '
  'every row is the guardian declaration: a second thing an adult may one day '
  'have to state about one child is a new slug here, not a new table.';

COMMENT ON COLUMN public.gamer_consent_acceptances.document_version IS
  'The version that was CURRENT for this slug at the moment of the declaration, '
  'resolved server-side and never supplied by a caller. Part of the primary '
  'key, so a later revision is a fresh row rather than an overwrite.';

COMMENT ON COLUMN public.gamer_consent_acceptances.accepted_at IS
  'When the declaration was recorded, stamped by the server. A client never '
  'supplies it — a timestamp the declaring party chooses proves nothing about '
  'when they declared.';

COMMENT ON COLUMN public.gamer_consent_acceptances.accepted_by IS
  'The adult who made the statement — the parent creating the child, taken from '
  'create_gamer''s parent argument and never from anything a browser sent. A '
  'different question from gamer_id, which names who the statement is about, '
  'and the reason the pair is worth storing: a child linked to two adults '
  'carries the declaration of the one who actually made it. No cascade on the '
  'FK, matching consent_acceptances.accepted_by: the profile that made a legal '
  'record is part of it, so it cannot be hard-deleted while the record stands.';

ALTER TABLE public.gamer_consent_acceptances ENABLE ROW LEVEL SECURITY;

-- Two SELECT policies and no write policy, because there is no write grant for
-- a write policy to authorize — the insert arrives through a SECURITY DEFINER
-- function, which bypasses RLS entirely. The `(SELECT …)` wrapper makes the
-- call an InitPlan evaluated once per statement rather than once per row.
CREATE POLICY admins_read_gamer_consent_acceptances
  ON public.gamer_consent_acceptances
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

-- Keyed on the LINK rather than on accepted_by, the same predicate the photo
-- consents use (00244): two adults linked to one child are answering about one
-- child, and a parent who joined the family afterwards can still read what was
-- declared about their own gamer.
CREATE POLICY parents_read_gamer_consent_acceptances
  ON public.gamer_consent_acceptances
  FOR SELECT
  TO authenticated
  USING (public.is_parent_of(gamer_id));

-- SELECT and nothing more for `authenticated`; nothing at all for `anon`, since
-- a row names a child and the adult who claimed them. `service_role` gets the
-- full set, as on every other table the DB suite asserts against through the
-- admin client.
GRANT SELECT ON TABLE public.gamer_consent_acceptances TO authenticated;
GRANT ALL    ON TABLE public.gamer_consent_acceptances TO service_role;

-- ---------------------------------------------------------------------------
-- 3. create_gamer takes the declaration, and refuses without it
-- ---------------------------------------------------------------------------
--
-- DROP and recreate rather than CREATE OR REPLACE: a new parameter is a new
-- signature, so a replace would leave the 11-argument function standing beside
-- the 12-argument one and make every existing call ambiguous. The body below is
-- 00248's, copied from schema.sql per the CLAUDE.md rule, with two additions —
-- the refusal, and the acceptance insert.
--
-- `p_guardian_attested` DEFAULTs to false rather than being required, and the
-- default is the fail-closed one on purpose: a caller that has not been taught
-- about the declaration (a cached bundle, a deploy in flight) gets a sentence
-- naming what is missing instead of "function not found", and cannot create a
-- child either way.
--
-- The version is resolved HERE and is never a parameter, the same derivation
-- record_account_consents and record_required_consents use — greatest
-- created_at, version DESC to break a tie — because an arbitrary answer to
-- "what is current" is worse than a wrong one, changing between reads.

DROP FUNCTION public.create_gamer(
  uuid, uuid, text, text, date, public.gender_type,
  text, text, text, bigint, public.gamer_sign_in
);

CREATE FUNCTION public.create_gamer(
  p_gamer_id           uuid,
  p_parent_id          uuid,
  p_first_name         text,
  p_last_name          text,
  p_date_of_birth      date,
  p_gender             public.gender_type DEFAULT NULL,
  p_minecraft_username text DEFAULT NULL,
  p_minecraft_uuid     text DEFAULT NULL,
  p_roblox_username    text DEFAULT NULL,
  p_roblox_user_id     bigint DEFAULT NULL,
  p_sign_in            public.gamer_sign_in DEFAULT 'parent',
  p_guardian_attested  boolean DEFAULT false
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
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

COMMENT ON FUNCTION public.create_gamer(
  uuid, uuid, text, text, date, public.gender_type,
  text, text, text, bigint, public.gamer_sign_in, boolean
) IS
  'The atomic promote-and-link the gamer-creation route calls once GoTrue has '
  'minted the auth user: swaps the trigger-seeded customer profile to a gamer '
  'in the parent''s locale, writes the gamer row with its chosen sign-in mode, '
  'records the parent''s guardian declaration about THIS child, links the '
  'optional game accounts, and links the parent — in ONE transaction, so a '
  'failure anywhere leaves nothing behind for the route to compensate but the '
  'auth user itself. service_role only. Refuses with SQLSTATE P0025 and the '
  'message PIN_REQUIRED when the named parent holds no PIN: the gate on leaving '
  'a gamer session is the parent''s PIN, so a family may not acquire a gamer '
  'before it has one, and the route turns that one refusal into a specific ask. '
  'Refuses with a plain raise when p_guardian_attested is not true — false and '
  'NULL alike, because a three-valued answer to "are you this child''s parent or '
  'guardian" is not an answer — and the declaration is written against the '
  'CURRENT version of the guardian-declaration document, resolved here and '
  'never supplied by a caller. The locale is copied from the parent once and '
  'never synced; the child changes it like anyone else. `p_sign_in` defaults to '
  '`parent`, the switch-only shape every gamer had before the modes existed; '
  '`p_guardian_attested` defaults to false so an untaught caller is refused '
  'rather than admitted.';

REVOKE EXECUTE ON FUNCTION public.create_gamer(
  uuid, uuid, text, text, date, public.gender_type,
  text, text, text, bigint, public.gamer_sign_in, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_gamer(
  uuid, uuid, text, text, date, public.gender_type,
  text, text, text, bigint, public.gamer_sign_in, boolean
) TO service_role;
