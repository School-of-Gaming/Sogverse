-- A gamer can hold credentials of their own.
--
-- Until now a child account had exactly one way in: the parent switches into it
-- from their own session, and the child's auth email is a random synthetic
-- `<token>@gamer.sogverse.internal` handle with no password behind it. This
-- migration is the database half of letting a PARENT choose, per child, one of
-- three sign-in modes — plus the invariant that makes the gate above it
-- possible at all.
--
-- THE THREE MODES (`public.gamer_sign_in`)
--
--   'parent'   — today's behaviour, and the default. Switch-only: a random
--                synthetic address, no password, nothing anyone types.
--   'username' — the parent picks a lowercase handle and a password. The auth
--                email becomes `<username>@gamer.sogverse.internal`, so GoTrue's
--                own uniqueness constraint on that address is what makes the
--                username unique, and login is an ordinary email+password.
--   'email'    — the child's REAL address, with no password until they set one:
--                they verify the address and then go through the same reset
--                flow an adult would.
--
-- The column records which of those a family chose; it is not the credential.
-- The address and the password live in `auth.users`, where GoTrue owns them.
-- What this column answers is which shape the account is in — and, for mode
-- `email`, whether the address stored against a gamer is a real mailbox or a
-- handle nobody reads.
--
-- WHY create_gamer NOW REFUSES A PARENT WITH NO PIN
--
-- Leaving a gamer session is being gated: from a switch-created session,
-- reaching the parent or a sibling costs the parent's PIN. A family holding a
-- gamer account but no PIN would leave that gate with nothing behind it, and the
-- cheapest moment to establish the invariant is the one where the gamer is
-- created. So the guard is the first statement of create_gamer, with a SQLSTATE
-- of its own because the route answers it with a specific ask — set a PIN first
-- — rather than with the generic apology every other raise in that body earns.
--
-- P0025 is the next free code in this repo's own series: P0021-P0024 are taken,
-- and P0000-P0004 are PL/pgSQL's own.

-- ---------------------------------------------------------------------------
-- 1. The mode: enum + column
-- ---------------------------------------------------------------------------

CREATE TYPE public.gamer_sign_in AS ENUM ('parent', 'username', 'email');

ALTER TABLE public.gamer_profiles
  ADD COLUMN sign_in public.gamer_sign_in NOT NULL DEFAULT 'parent';

COMMENT ON COLUMN public.gamer_profiles.sign_in IS
  'How this child reaches their own account, chosen by their PARENT and written '
  'only by the API routes on the service-role client — never by the account '
  'holder, and not by the parent''s own session either: `authenticated` holds '
  'column-scoped UPDATE on this table (date_of_birth, gender) and this column is '
  'deliberately not among them. Three modes. `parent` is the default and the '
  'behaviour every gamer had before the modes existed: the auth email is a '
  'random synthetic `<token>@gamer.sogverse.internal` handle, there is no '
  'password, and the only way in is an account switch from the parent. '
  '`username` means the parent picked a lowercase [a-z0-9]{3,20} handle and a '
  'password; the auth email becomes `<username>@gamer.sogverse.internal`, so '
  'GoTrue''s uniqueness constraint on that address is what makes the username '
  'unique, and the child signs in with an ordinary email and password. `email` '
  'means the address on the account is the child''s REAL mailbox: they verify it '
  'and set a password through the same reset flow an adult uses. The value is a '
  'PRIVILEGE marker as much as a preference — it decides whether a child can '
  'sign in without their parent at all, and whether the address stored for them '
  'is something we may mail or a handle nobody reads.';

-- The UPDATE grant goes column-scoped, the way `profiles` already is. The
-- self-update policy `gamers_update_own_gamer_profile` is untouched — what
-- changes is what it can be used ON. A child editing their own date of birth or
-- gender is ordinary self-service; a child (or a parent, from the browser)
-- flipping `sign_in` would be handing themselves a login, which is a decision
-- the routes make on the service-role client after checking the parent's PIN.
REVOKE UPDATE ON TABLE public.gamer_profiles FROM authenticated;
GRANT UPDATE(date_of_birth) ON TABLE public.gamer_profiles TO authenticated;
GRANT UPDATE(gender) ON TABLE public.gamer_profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. create_gamer learns the mode, and refuses a family with no PIN
-- ---------------------------------------------------------------------------
--
-- DROP then CREATE, not CREATE OR REPLACE: the parameter list changes, and
-- `create or replace` under a different signature creates an OVERLOAD rather
-- than replacing anything — leaving the old body callable and PostgREST unable
-- to tell which one a request meant. The grants are restated below because a
-- dropped function takes its ACL with it, and a freshly created one comes back
-- PUBLIC-executable until revoked.

DROP FUNCTION public.create_gamer(
  uuid, uuid, text, text, date, public.gender_type, text, text, text, bigint
);

CREATE FUNCTION public.create_gamer(
  p_gamer_id uuid,
  p_parent_id uuid,
  p_first_name text,
  p_last_name text,
  p_date_of_birth date,
  p_gender public.gender_type DEFAULT NULL::public.gender_type,
  p_minecraft_username text DEFAULT NULL::text,
  p_minecraft_uuid text DEFAULT NULL::text,
  p_roblox_username text DEFAULT NULL::text,
  p_roblox_user_id bigint DEFAULT NULL::bigint,
  p_sign_in public.gamer_sign_in DEFAULT 'parent'::public.gamer_sign_in
) RETURNS void
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

COMMENT ON FUNCTION public.create_gamer(
  uuid, uuid, text, text, date, public.gender_type, text, text, text, bigint,
  public.gamer_sign_in
) IS
  'The atomic promote-and-link the gamer-creation route calls once GoTrue has '
  'minted the auth user: swaps the trigger-seeded customer profile to a gamer, '
  'writes the gamer row with its chosen sign-in mode, links the optional game '
  'accounts, and links the parent — in ONE transaction, so a failure anywhere '
  'leaves nothing behind for the route to compensate but the auth user itself. '
  'service_role only. Refuses with SQLSTATE P0025 and the message PIN_REQUIRED '
  'when the named parent holds no PIN: the gate on leaving a gamer session is '
  'the parent''s PIN, so a family may not acquire a gamer before it has one, and '
  'the route turns that one refusal into a specific ask. `p_sign_in` defaults to '
  '`parent`, the switch-only shape every gamer had before the modes existed.';

REVOKE ALL ON FUNCTION public.create_gamer(
  uuid, uuid, text, text, date, public.gender_type, text, text, text, bigint,
  public.gamer_sign_in
) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_gamer(
  uuid, uuid, text, text, date, public.gender_type, text, text, text, bigint,
  public.gamer_sign_in
) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. verify_pin_for_any — the switch gate's PIN check
-- ---------------------------------------------------------------------------
--
-- The switch route asks one question on behalf of a session that cannot be
-- trusted to ask it: a child in a gamer session wants to leave it, and the price
-- is the PARENT's PIN — but a child may be linked to more than one parent, so
-- the route holds a SET of candidate parents rather than one. Hence "does this
-- PIN match any of these users", answered server-side in a single call.
--
-- THREE OUTCOMES, NOT TWO. `not_set` is a different fact from `invalid`, and the
-- route answers it differently: no PIN anywhere in the family means the gate
-- cannot be satisfied by typing more carefully, and the family is sent to set
-- one. A boolean would collapse that into "wrong PIN" and strand them.
--
-- service_role ONLY, exactly like set_pin_for_user. It takes a list of user ids
-- and checks none of them against auth.uid(), so exposed to `authenticated` it
-- would be a PIN oracle any signed-in caller could point at any family. What
-- establishes that the caller may ask about these particular users is the route.

CREATE FUNCTION public.verify_pin_for_any(p_user_ids uuid[], p_pin text)
RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
declare
  v_any_pin boolean;
begin
  -- Does anybody in the set hold a PIN at all? Asked first and independently of
  -- what was typed, because `not_set` is a fact about the FAMILY and must not
  -- depend on the shape of the input.
  select exists (
    select 1
      from customer_profiles
     where user_id = any(coalesce(p_user_ids, array[]::uuid[]))
       and pin_hash is not null
  ) into v_any_pin;

  if not v_any_pin then
    return 'not_set';
  end if;

  -- A malformed PIN is `invalid`, never an error: this sits on a credential path
  -- where raising would turn "the child typed three digits" into a 500 the
  -- client has to special-case. The regex is set_my_pin's, unchanged.
  if p_pin is null or p_pin !~ '^\d{4}$' then
    return 'invalid';
  end if;

  if exists (
    select 1
      from customer_profiles
     where user_id = any(p_user_ids)
       and pin_hash is not null
       and pin_hash = crypt(p_pin, pin_hash)
  ) then
    return 'valid';
  end if;

  return 'invalid';
end;
$_$;

COMMENT ON FUNCTION public.verify_pin_for_any(p_user_ids uuid[], p_pin text) IS
  'Does this PIN match ANY of these users? Answers with exactly one of `valid`, '
  '`invalid` or `not_set` — never NULL, and never a raise, not even on malformed '
  'input, because it sits on a credential path where a throw would become a 500 '
  'for a mistyped digit. `not_set` means nobody in the set holds a PIN at all, '
  'which the account-switch route answers by sending the family to set one '
  'rather than by telling a child their PIN was wrong; that distinction is why '
  'this returns text and not a boolean. The comparison is the same bcrypt one '
  'verify_my_pin uses. The set exists because a child may be linked to more than '
  'one parent and any of their PINs opens the gate. service_role ONLY: no '
  'argument is checked against auth.uid(), so reachable by `authenticated` this '
  'would be a PIN oracle pointable at any family — entitlement to ask about '
  'these particular users is established by the route that calls it.';

REVOKE ALL ON FUNCTION public.verify_pin_for_any(p_user_ids uuid[], p_pin text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.verify_pin_for_any(p_user_ids uuid[], p_pin text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. request_gamer_verification_email — the parent-scoped sibling
-- ---------------------------------------------------------------------------
--
-- Mode `email` puts a real address on a child's account, and somebody has to ask
-- for the verification mail. It cannot be the child: they cannot sign in until
-- the address is verified and a password set. So the request is the PARENT's,
-- made from the parent's own session about a named child.
--
-- Everything else is request_my_verification_email unchanged — same table, same
-- six-per-hour window, same false-rather-than-raise refusal, same self-prune —
-- with one difference that matters: the rate-limit state is keyed on the GAMER,
-- not on the caller. A parent of four children gets four independent
-- allowances, which is right, because the shared mail quota this protects is
-- spent per ADDRESS. The existing ledger already keys on a user id, so it needs
-- no new column and no new table to hold a subject that is not the caller.
--
-- CLASSIFICATION: SELF-SCOPING. The guard is `is_parent_of`, keyed to
-- auth.uid(). It is not one of the §3.1 role primitives and could not be: the
-- question is a RELATIONSHIP, not a role — every customer is equally entitled to
-- ask about their own children and equally refused about anyone else's.

CREATE FUNCTION public.request_gamer_verification_email(p_gamer_id uuid)
RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_count integer;
BEGIN
  -- Guard first. A gamer id that does not exist and one belonging to another
  -- family are refused identically, so this cannot be used to ask whether an id
  -- is somebody's child.
  IF p_gamer_id IS NULL OR NOT public.is_parent_of(p_gamer_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Advisory lock keyed to the SUBJECT, matching the key the count below uses:
  -- two concurrent requests about the same child must serialize; two about
  -- different children need not.
  PERFORM pg_advisory_xact_lock(hashtext(p_gamer_id::text));

  SELECT count(*) INTO v_count
  FROM public.verification_email_requests
  WHERE user_id = p_gamer_id
    AND created_at > now() - interval '1 hour';

  -- Returns false (not an error) when the per-hour rate limit is hit; the route
  -- maps that to 429. The same six as the self-serve sibling.
  IF v_count >= 6 THEN
    RETURN false;
  END IF;

  INSERT INTO public.verification_email_requests (user_id)
  VALUES (p_gamer_id);

  -- The same self-prune on the same terms: nothing reads these rows but the
  -- count above, and one outside the window can never change it again. Scoped to
  -- the subject, under the lock already held.
  DELETE FROM public.verification_email_requests
  WHERE user_id = p_gamer_id
    AND created_at <= now() - interval '1 hour';

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.request_gamer_verification_email(p_gamer_id uuid) IS
  'The parent-scoped sibling of request_my_verification_email: a PARENT asks for '
  'the verification mail on behalf of a named child, because a child in sign-in '
  'mode `email` cannot sign in until that address is verified and so cannot ask '
  'for themselves. Guard-first on is_parent_of, so another family''s child and an '
  'id that does not exist are refused identically (42501) and neither answer can '
  'be read as an oracle. The rate-limit state is keyed on the GAMER rather than '
  'on the caller — a parent of four gets four independent hourly allowances, '
  'because the shared mail quota this protects is spent per address — and is '
  'otherwise the same six-per-hour window, the same false-rather-than-raise '
  'refusal the route maps to 429, and the same prune of the subject''s own '
  'expired rows.';

REVOKE ALL ON FUNCTION public.request_gamer_verification_email(p_gamer_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.request_gamer_verification_email(p_gamer_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.request_gamer_verification_email(p_gamer_id uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The admin dashboard counts verification by ADDRESS, not by role
-- ---------------------------------------------------------------------------
--
-- The users strip emitted NULL verified for `gamer` on the reasoning that a
-- gamer's address is a synthetic handle nobody will ever click a link in, so "0
-- verified" would report a problem that does not exist. Mode `email` makes that
-- reasoning role-shaped where it was really address-shaped: a child holding a
-- real mailbox is exactly as verifiable as an adult.
--
-- So the CASE stops asking what role a tile is for and asks whether anybody
-- counted in it holds a real address. A role none of whose accounts does still
-- reports NULL — which is the old answer for a platform with no email-mode
-- gamers, reached from the honest premise — and a role with nobody in it at all
-- still reports 0. The JSON shape is identical either way.
--
-- Whole body restated because that is what changing one is; only the users strip
-- and its comment differ from what 00207 left behind.

CREATE OR REPLACE FUNCTION public.get_admin_dashboard() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_users     jsonb;
  v_queue     jsonb;
  v_attention jsonb;
  v_schedule  jsonb;
BEGIN
  PERFORM public.assert_admin();

  -- ---------------------------------------------------------------------------
  -- 1. The users strip: one tile per role, always all of them.
  --
  -- Driven by `enum_range` rather than by what `profiles` happens to contain, so
  -- a role with no accounts renders a zero tile instead of vanishing — and a
  -- role added to the enum later arrives here without an edit.
  --
  -- Two stats can be NULL rather than 0, and the difference is the point.
  -- `verified` is NULL for a role none of whose accounts holds a REAL address: a
  -- gamer in sign-in mode `parent` or `username` carries a synthetic
  -- @gamer.sogverse.internal handle nobody will ever click a link in, so "0
  -- verified" would report a problem that does not exist. A gamer in mode
  -- `email` holds a real mailbox and counts exactly like everyone else — which
  -- is why the test below is the ADDRESS and not the role (00235). `certified`
  -- is the same NULL-means-no-meaning shape for a simpler reason: only an
  -- educator can be certified.
  --
  -- A role with no accounts at all still reports 0 rather than NULL — the
  -- addressable test only speaks about accounts that exist, and an empty tile
  -- has nothing to say either way.
  -- ---------------------------------------------------------------------------
  SELECT jsonb_agg(
           jsonb_build_object(
             'role',      r.role_name,
             'total',     COALESCE(c.total, 0),
             'verified',  CASE WHEN COALESCE(c.total, 0) > 0
                                 AND COALESCE(c.addressable, 0) = 0 THEN NULL
                               ELSE COALESCE(c.verified, 0) END,
             'certified', CASE WHEN r.role_name = 'gedu' THEN COALESCE(c.certified, 0)
                               ELSE NULL END
           )
           ORDER BY r.ord
         )
    INTO v_users
    FROM unnest(enum_range(NULL::public.user_role))
           WITH ORDINALITY AS r(role_name, ord)
    LEFT JOIN (
      SELECT pr.role,
             count(*)                                                 AS total,
             -- "Holds an address a human reads." True of every non-gamer, and
             -- of a gamer exactly when their parent chose sign-in mode `email`.
             -- A gamer row missing from gamer_profiles is a data error and
             -- lands on the conservative side: not addressable.
             count(*) FILTER (
               WHERE pr.role <> 'gamer' OR gmr.sign_in = 'email'
             )                                                        AS addressable,
             count(*) FILTER (
               WHERE pr.email_verified_at IS NOT NULL
                 AND (pr.role <> 'gamer' OR gmr.sign_in = 'email')
             )                                                        AS verified,
             count(*) FILTER (WHERE gp.certified)                      AS certified
        FROM public.profiles pr
        LEFT JOIN public.gedu_profiles gp   ON gp.user_id  = pr.id
        LEFT JOIN public.gamer_profiles gmr ON gmr.user_id = pr.id
       GROUP BY pr.role
    ) c ON c.role = r.role_name;

  -- ---------------------------------------------------------------------------
  -- 2. The certification queue: educators waiting on an admin's decision.
  --
  -- An INNER JOIN, deliberately. A gedu with no `gedu_profiles` row is a data
  -- error, and a LEFT JOIN would read that missing row as `certified = false` —
  -- putting a broken account in a queue whose only action (certify) writes to the
  -- row that is not there. Missing means excluded; the queue is for accounts that
  -- exist and are waiting.
  --
  -- `contract_accepted_at` (00201) is the candidate's standing against the
  -- CURRENT contract version, or NULL. It informs the certification decision and
  -- does not gate it — an unsigned candidate is still certifiable, and the admin
  -- is the one who decides what to make of the gap.
  --
  -- Standing is judged on the BASE version (00202): a version string is
  -- `<base>/<language>` and the languages of one version are the same agreement,
  -- so signing either makes a candidate current. min() because a candidate may
  -- hold both languages' rows — the first signature is the moment they agreed,
  -- and a scalar subquery would error rather than answer.
  --
  -- `criminal_record_check_at` (00213) is when an admin recorded seeing this
  -- candidate's criminal record extract, or NULL if none has been recorded. The
  -- flag beside it is deliberately not shipped: the stamp is non-NULL exactly
  -- when the flag is true, so a second field could only ever contradict the
  -- first. It informs the decision on the same terms as the contract stamp and
  -- gates nothing either.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'id',         pr.id,
               'first_name', pr.first_name,
               'last_name',  pr.last_name,
               'created_at', pr.created_at,
               'contract_accepted_at', (
                 SELECT min(ca.accepted_at)
                   FROM public.gedu_contract_acceptances ca
                  WHERE ca.gedu_id = pr.id
                    AND split_part(ca.contract_version, '/', 1) = (
                          SELECT split_part(v.version, '/', 1)
                            FROM public.gedu_contract_versions v
                           ORDER BY v.created_at DESC, v.version DESC
                           LIMIT 1
                        )
               ),
               'criminal_record_check_at', gp.criminal_record_check_at
             )
             ORDER BY pr.created_at, pr.id
           ),
           '[]'::jsonb
         )
    INTO v_queue
    FROM public.profiles pr
    JOIN public.gedu_profiles gp ON gp.user_id = pr.id
   WHERE pr.role = 'gedu'
     AND gp.certified = false;

  -- ---------------------------------------------------------------------------
  -- 3. The attention queue: live products with at least one thing wrong.
  --
  -- Five kinds of wrong, and each is stated as the fact rather than as a sentence
  -- — the page words them, because the wording is translated copy.
  --
  --   * `unassigned_count`  — active seats sitting in no group. A child enrolled
  --                           and nobody looking after them is the worst of these.
  --   * `groups_without_gedu` — a group with members and no educator assigned. An
  --                           EMPTY group is not flagged: an admin building the
  --                           term's groups ahead of time has not made a mistake.
  --   * `waitlist`          — people queueing while seats stand open AND those
  --                           seats have not all been offered to somebody. Only
  --                           meaningful on a capped product with the queue
  --                           switched on. NULL when there is nothing to say.
  --   * `missing_gedu_fee`  — NULL, not zero. Zero is a volunteer session, which
  --                           is a decision somebody made; NULL is a blank field.
  --                           The assistant fee is never flagged — NULL there
  --                           means "no assistant", which is the ordinary case.
  --   * `missing_municipality_fee` — municipality clubs only; the CHECK already
  --                           forbids the column elsewhere.
  --
  -- A product with none of them is not in the list at all.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(a.doc ORDER BY a.product_id), '[]'::jsonb)
    INTO v_attention
    FROM (
      WITH candidate AS (
        SELECT p.*
          FROM public.products p
         WHERE p.status <> 'cancelled'
           AND public.effective_status(p.id) IN ('pending', 'running')
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',                  c.id,
               'product_type',        c.product_type,
               'translations',        tr.items,
               'unassigned_count',    ua.n,
               'groups_without_gedu', gw.items,
               'waitlist',
                 CASE WHEN wl.open_seats IS NOT NULL
                      THEN jsonb_build_object(
                             'waitlist_count',   wl.waitlist_count,
                             'open_seats',       wl.open_seats,
                             -- How many of those open seats already have a
                             -- family thinking about them (00207). Emitted so
                             -- the page can say why the number of open seats
                             -- and the size of the queue do not by themselves
                             -- explain the flag.
                             'live_offer_count', wl.live_offer_count
                           )
                 END,
               'missing_gedu_fee', (c.primary_gedu_fee_cents IS NULL),
               'missing_municipality_fee',
                 (c.product_type = 'municipality_club'
                  AND c.municipality_fee_cents IS NULL)
             ) AS doc
        FROM candidate c
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('locale', pt.locale, 'name', pt.name)
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) tr
        CROSS JOIN LATERAL (
          SELECT count(*) AS n
            FROM public.participations pa
           WHERE pa.product_id = c.id
             AND pa.status = 'active'
             AND pa.group_id IS NULL
        ) ua
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('id', g.id, 'name', g.name)
                            ORDER BY g.name, g.id
                          )
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                      AND EXISTS (
                            SELECT 1 FROM public.participations pa
                             WHERE pa.group_id = g.id AND pa.status = 'active'
                          )
                      AND NOT EXISTS (
                            SELECT 1 FROM public.gedu_group_assignments ga
                             WHERE ga.group_id = g.id
                          )
                 ), '[]'::jsonb) AS items
        ) gw
        -- The waitlist flag asks "is there something for an admin to do here",
        -- not "is this product in an interesting state" (00207). An open seat
        -- that has already been offered to a family is being dealt with, so it
        -- is subtracted before the comparison; a product whose every open seat
        -- carries a live offer drops out of the queue entirely. When that family
        -- declines, or the five days run out, the live count falls and the flag
        -- comes back on its own — which is exactly why the count is derived
        -- from the stamp rather than stored anywhere.
        LEFT JOIN LATERAL (
          SELECT psc.waitlist_count,
                 c.seat_count - psc.active_count AS open_seats,
                 lo.n                            AS live_offer_count
            FROM public.product_seat_counts psc
            CROSS JOIN LATERAL (
              SELECT count(*)::integer AS n
                FROM public.participations po
               WHERE po.product_id = c.id
                 AND po.status = 'waitlisted'
                 AND po.seat_offer_sent_at IS NOT NULL
                 AND po.seat_offer_sent_at + interval '5 days' > now()
            ) lo
           WHERE psc.product_id = c.id
             AND c.waitlist_enabled
             AND psc.waitlist_count > 0
             AND c.seat_count IS NOT NULL
             AND psc.active_count < c.seat_count
             AND (c.seat_count - psc.active_count) > lo.n
        ) wl ON true
       WHERE ua.n > 0
          OR jsonb_array_length(gw.items) > 0
          OR wl.open_seats IS NOT NULL
          OR c.primary_gedu_fee_cents IS NULL
          OR (c.product_type = 'municipality_club'
              AND c.municipality_fee_cents IS NULL)
    ) a;

  -- ---------------------------------------------------------------------------
  -- 4. The schedule set: the calendar facts the page resolves weeks from.
  --
  -- Slots carry the weekday exactly as the column stores it (0 = Monday) and the
  -- start time as a bare HH:MM wall clock in the product's own zone — the admin
  -- schedule is deliberately read in the zone it was authored in.
  --
  -- Holidays are bounded to the same window as the products themselves: a
  -- calendar can hold years of dates and only the ones a visible week could land
  -- on mean anything here.
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(jsonb_agg(s.doc ORDER BY s.product_id), '[]'::jsonb)
    INTO v_schedule
    FROM (
      WITH candidate AS (
        SELECT p.*, w.window_start, w.window_end
          FROM public.products p
          CROSS JOIN LATERAL (
            SELECT (now() AT TIME ZONE p.timezone)::date - 30 AS window_start,
                   ((now() AT TIME ZONE p.timezone)::date
                     + INTERVAL '4 months')::date             AS window_end
          ) w
         WHERE p.status NOT IN ('cancelled', 'completed')
           AND (
                 public.effective_status(p.id) IN ('pending', 'running')
              OR (p.end_date IS NOT NULL
                  AND p.end_date >= w.window_start
                  AND p.end_date <  w.window_end)
               )
      )
      SELECT c.id AS product_id,
             jsonb_build_object(
               'id',             c.id,
               'product_type',   c.product_type,
               'translations',   tr.items,
               'timezone',       c.timezone,
               'start_date',     c.start_date,
               'end_date',       c.end_date,
               'seat_count',     c.seat_count,
               'active_count',   COALESCE(psc.active_count, 0),
               'waitlist_count', COALESCE(psc.waitlist_count, 0),
               'schedule_slots', sl.items,
               'holidays',       hol.items
             ) AS doc
        FROM candidate c
        LEFT JOIN public.product_seat_counts psc ON psc.product_id = c.id
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('locale', pt.locale, 'name', pt.name)
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) tr
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'weekday',          ss.weekday,
                              'start_time',       to_char(ss.start_time, 'HH24:MI'),
                              'duration_minutes', ss.duration_minutes
                            )
                            ORDER BY ss.weekday, ss.start_time
                          )
                     FROM public.schedule_slots ss
                    WHERE ss.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) sl
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(DISTINCT ch.date ORDER BY ch.date)
                     FROM public.product_holiday_calendars phc
                     JOIN public.calendar_holidays ch
                       ON ch.calendar_id = phc.calendar_id
                    WHERE phc.product_id = c.id
                      AND ch.date >= c.window_start
                      AND ch.date <  c.window_end
                 ), '[]'::jsonb) AS items
        ) hol
    ) s;

  RETURN jsonb_build_object(
    'users',              v_users,
    'certification_queue', v_queue,
    'attention_products', v_attention,
    'schedule_products',  v_schedule
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_dashboard() IS 'The whole admin dashboard in one document: per-role user counts (email-verified and, for gedus, certified — either can be NULL, where the stat has no meaning: certified only means something for an educator, and since 00235 verified is NULL for a role none of whose accounts holds a real address, which is every gamer unless their parent chose sign-in mode email), the uncertified-gedu queue, live products carrying at least one ops issue, and the calendar facts the schedule and coming-up feed resolve weeks from. Admin-only, guard-first on assert_admin. Since 00201 each queue candidate also carries contract_accepted_at — when they accepted the current gedu contract, or NULL — which informs the certification decision without gating it; since 00202 that standing is judged on the version''s BASE, so either equally binding language of the current version counts, and a candidate holding both carries the earlier of the two signatures. Since 00213 each candidate additionally carries criminal_record_check_at — when an admin recorded seeing their criminal record extract, or NULL — which informs the same decision on the same terms and gates nothing either; the flag beside it is not shipped because the stamp is non-NULL exactly when the flag is true. Since 00207 the waitlist attention item asks whether there is something for an admin to DO rather than what state the product is in: an open seat that already carries a live seat offer is subtracted, so a product whose every open seat has been offered drops out of the queue, and a decline or an expiry raises it again on its own. The count rides in the emitted object as live_offer_count so the page can explain the absence. Both product sections ask effective_status() rather than products.status, and every date window is computed in the product''s own timezone. Product names are shipped as the whole product_translations array because which one to read is a property of the reader, exactly as every other admin surface treats them.';
