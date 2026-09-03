# Minecraft Education Accounts

Runbook for the `@gamer.sog.gg` account pool — the shared Minecraft Education
class logins a gedu hands out at the start of a session.

The pool is generated in bulk, used for a term, then wiped and regenerated.
`scripts/minecraft-edu-accounts.mjs` performs every step below; this document
explains *why* each step is shaped the way it is, because most of the design is
working around platform behaviour that is not documented anywhere obvious.

## The account model

| | |
|---|---|
| Tenant | `sog.gg` Entra ID, four verified domains |
| Pool domain | `gamer.sog.gg` — shared class logins, not per-child identities |
| Educator domain | `gedu.sog.gg` — real people, plus the `SOGGeduNN` shared pool logins |
| Licence | `MINECRAFT_EDUCATION_EDITION`, a service plan inside **M365 EDU A3** |

**Rule: only the A3 SKUs carry Minecraft Education.** The tenant also holds
several hundred A1 seats. A1 does not contain the `MINECRAFT_EDUCATION_EDITION`
service plan, so those seats can never substitute, however plentiful they look
in the admin centre.

**Rule: gamer accounts are licensed by setting `department` — never by editing a
group directly.** The value places the account in a dynamic group that carries
the A3 student licence, and Entra's rule engine does the rest. This matters
beyond tidiness: writing a user property is within `User.ReadWrite.All`, which
the platform's own service principal already holds, so the whole lifecycle stays
automatable. Managing group membership instead would need a new admin-consent
grant. A static licence group also exists and holds educator accounts; leave it
alone when working on the pool.

**Rule: `SOGGeduNN@gedu.sog.gg` pool logins take the student licence by an
explicit add to the static `Game Educators Student License` group — never by
`department`.** They are shared logins exactly like the gamer pool, but they sit
on the educator domain, and the two mechanisms must not be mixed: `department`
is what the Dynamic Gamers rule matches, so a gedu account carrying it joins a
group whose entire meaning is "the gamer pool" and makes that group's membership
count stop answering the question it exists to answer. The static group is the
one this document otherwise says to leave alone; a `SOGGeduNN` login is the one
sanctioned write to it.

**The trade-off that comes with it:** an explicit membership write licenses
*synchronously*, so a `verify` run straight after `create` shows every gedu
account already licensed while the gamer half is still settling. The cost is
that the licence is a **second** write, which can fail on its own and leave an
account that exists and is unlicensed — the one failure mode the gamer path
does not have, because there the licence is a property of the same call that
creates the account. `create` reports those separately for that reason.

**Rule: a Sogverse gamer account and a `@gamer.sog.gg` account are unrelated.**
Platform gamer identities use a synthetic internal address. The only link
between the two systems is the password-reset tool. Never join them by name.

## Platform constraints

Each of these was verified against the live tenant. Re-verify the same way if
Microsoft's behaviour appears to have changed.

**Entra rejects non-ASCII in a UPN.** `POST /users` with `ä` or `ö` in
`userPrincipalName` returns HTTP 400 `Request_BadRequest — Property
userPrincipalName is invalid`. This is an identity-layer refusal; it never
reaches Minecraft. Display names accept non-ASCII fine, and staff accounts in
this tenant already follow that split (a surname with diacritics, an ASCII UPN).

**Minecraft Education renders `givenName` + the first letter of `surname`,
concatenated.** A user named `Justin Minecraft` appears in game as `JustinM`.
Consequences:

- Any populated `surname` silently swallows everything after its first
  character, so a two-word name collapses and unrelated accounts collide.
- The pool therefore puts the **whole** name in `givenName` and leaves `surname`
  unset. `displayName` is set to the *same* string, so the rendered result is
  identical whichever field the client actually reads — sources disagree on
  that, and matching them removes the question.

**A deleted user releases its licence seat immediately, but keeps the licence
record.** In the 30-day recycle bin, `assignedLicenses` still lists the licence
(which is how a restore brings it back), while `consumedUnits` on the
subscription drops at once. Both halves of the common folklore are half true.
Observed with group-based licensing, where deletion also drops the user out of
the group; a direct assignment may differ.

**Dynamic group evaluation is asynchronous.** Bulk membership changes take
minutes to settle — both directions. Never read seat counts immediately after a
write; poll until they stabilise.

**`usageLocation` must be set before any licence can attach.** An account
created without it is created successfully and then silently never licensed.
This is the single most common way an account ends up in the pool but unusable.

## Naming scheme

Names are `adjective.noun` — `hurja.jaa@gamer.sog.gg` rendering in game as
`HurjaJää`. Finnish and UK English, mixed in one pool.

**The dot is in the UPN and nowhere else, and that split is the point.** A UPN
is case-insensitive, so the dot is the only thing making `bravewolf` readable at
a login box; a display name *is* case-sensitive, which is what carries
`BraveWolf`. The two halves therefore disagree on purpose, and a change to one
is not a change to the other.

- **UPN** is ASCII-transliterated and capped at 18 characters. Both halves are
  for the child: 7-to-12-year-olds type this into a login box.
- **In-game name** keeps correct Finnish spelling, because Entra permits it in
  the name fields and it is what the child actually sees.
- **Word lists exclude anything that could read as a tease** — nothing about
  looks, body, or being silly or stupid. Only fast / brave / clever / cool. A
  child who dislikes their assigned name will ask to swap it, which costs the
  admin a seat and the gedu a session.

**Rule: verify in-game names are unique, not just usernames.** Two distinct
usernames can still produce the same in-game name. The generator refuses to emit
a plan that collides on either, and `audit` reports duplicates on the live pool.

## Passwords

The pool uses the same generator as the gedu reset tool: the literal `Sogverse`
followed by two digits. Keeping them identical means a freshly issued password
and a reset password look the same to whoever reads one out.

**This yields only 100 distinct values.** Across a 600-account pool roughly six
accounts share each password, and anyone who works out the pattern can reach any
account whose name they know. This is accepted deliberately — these are shared
class logins holding no personal data, and Entra smart lockout is the real
control. Do not copy this scheme to any account that identifies a person.

## Full reset

Requires Global Administrator. Report-only unless `--apply` is passed.

```bash
node scripts/minecraft-edu-accounts.mjs audit            # what exists now
node scripts/minecraft-edu-accounts.mjs plan --fi 500 --en 100
node scripts/minecraft-edu-accounts.mjs release --apply  # frees the seats
node scripts/minecraft-edu-accounts.mjs audit            # confirm capacity
node scripts/minecraft-edu-accounts.mjs delete  --apply
node scripts/minecraft-edu-accounts.mjs create  --apply
node scripts/minecraft-edu-accounts.mjs verify           # emits the CSV
```

**Rule: release licences before deleting, never after.** Releasing is reversible
and synchronous enough to confirm; deleting is not. Running `release` then
`audit` proves you have capacity for the new pool *before* the irreversible
step, and it means the delete cannot strand the pool half-licensed if seat
maths were wrong.

**Rule: the plan file and CSV are never committed.** Both carry live passwords;
both are gitignored. They go to the admin out of band and are regenerated on the
next reset.

The CSV is UTF-8 with BOM, comma-delimited, with blank *Club* and *Student*
columns for the admin to fill in as accounts are handed out. Import to Google
Sheets via **File → Import → Upload** rather than opening it from Drive preview,
so the encoding is applied.

## Additive passes

A reset is not the only shape. `plan --add` **extends** the live pool: no
release, no delete, and nothing existing is touched.

```bash
node scripts/minecraft-edu-accounts.mjs audit
node scripts/minecraft-edu-accounts.mjs plan --add --gedu-from 26 --gedu-to 46 --en 240
node scripts/minecraft-edu-accounts.mjs create --apply
node scripts/minecraft-edu-accounts.mjs verify
```

**Rule: an additive plan excludes the live directory, on both halves of the
uniqueness rule.** A reset may draw whatever it likes because `delete` has just
emptied the domain; an additive pass has no such luxury, and a name is taken if
*either* its UPN or its in-game name is already in the tenant. `plan --add`
reads every user in the tenant and excludes both. `create` then re-checks the
whole plan against the live directory before writing anything — Graph answers a
duplicate UPN with a 400 that reads like a validation error, which is an
expensive way to discover you are creating the same pool twice.

**`--max-use` caps how often one word may repeat across the draw** (default 3).
The point of the word lists is that a child's name feels like theirs, and a draw
that hands out nine Cosmic-somethings has quietly undone that. Raising the cap
is the wrong first move when a draw comes up short — widen the word lists.

**Seat maths is per pass, and the report tells you before you write.** `plan
--add` prints what the plan needs against what is free, and `create` refuses
nothing on that basis — it warns and proceeds, because a short pass still
creates the accounts it can license. Check the line rather than trusting the
count you had in mind.

## Licence capacity

**There is no purchase API.** Graph is read-only for licences, Partner Center
applies only to CSP partners transacting for customers, and this tenant has no
CSP relationship. Seats are added in the Microsoft 365 admin centre by hand, or
through a licensing partner. Plan lead time accordingly.

Check current seats with `audit`, or read `consumedUnits` against
`prepaidUnits.enabled` on the A3 subscriptions.

The student pool is a **Student Use Benefit** SKU, whose seat count is generally
tied to declared enrolment rather than bought outright. Before purchasing extra
student seats, confirm with Microsoft whether the existing entitlement can
simply be raised — the two paths differ enormously in cost.

## Known follow-ups

- **In-game rendering is unconfirmed.** The name shape above follows the
  documented rule and this tenant's prior convention, but nobody has yet opened
  Minecraft Education and read a name off the player list. Two things to check
  on the first session: whether the full name survives with an empty surname,
  and whether `ä`/`ö` render correctly in game. If a space is wanted between the
  two words, that is a bulk property update, not a regeneration — usernames do
  not change.
- **Educator accounts have no dynamic group.** Real educators are licensed
  through a static group by hand. A dynamic rule keyed on some *other*
  department value would work for them — but not on `Gamer`, which is spoken
  for; see the pool-login rule above.
- **Four educator accounts carry the gamer department value** —
  `jere.ikonen`, `raija.koivisto`, `SOGGedu24` and `SOGGedu25` — and draw a
  student licence through the pool's dynamic group rather than the static one.
  Harmless, but wrong, and they inflate that group's membership count. Note
  that `department` is currently the **only** thing licensing them: none of the
  four is in the static group, so clearing the value without adding them to it
  takes their licence away. `SOGGedu24`/`25` predate the rule above and are
  where it came from.
- **The reset tool treats every `gedu.sog.gg` account as a person's.** Its
  force-change-on-next-signin rule keys on the domain, so resetting a shared
  `SOGGeduNN` pool login through the Discord bot or the in-app tool sets a
  flag that breaks the thing that makes it shareable — the password stops
  matching what is written on the handout. The pool logins are the exception
  the domain rule cannot see, and the fix is a rule that distinguishes a pool
  login from a person rather than a second domain.
