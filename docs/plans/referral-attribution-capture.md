# Referral attribution capture

Record where a family came from when they create an account, using a referral code carried
in the landing URL — without storing anything on their device, and therefore without a
consent banner.

## Problem

Lynx Educate asked that "parent/gamer registration should be trackable / attributable to
community groups that initiated the outreach". Community groups in France will publish
links to the Roblox programme; SOG currently has no way to tell which group any given
registration came from.

The gap is total: nothing in the platform records where a user came from, and nothing reads
a `ref` query param today. Vercel Web Analytics reports anonymous traffic shape and cannot be
extended to answer this (see *Rejected alternatives*).

The same question is asked platform-wide, not just for the Roblox programme — schools,
municipalities and club marketing all want it — so the mechanism is built generically and
the Roblox programme is its first consumer.

## Scale

- **Platform-wide:** every registration through `/register` and `/register-gedu`. The column
  is null for anyone who arrives without a code, which will be the large majority
  indefinitely.
- **Walkable on day one.** Landing on any page with `?ref=` and reaching registration works
  the moment this ships: the homepage carries two `next/link` CTAs to `/register`, and every
  public product detail page carries a "Create account" link. The Roblox programme page is a
  separate matter — see *Roblox programme: not a dependency*.
- **Roblox programme:** the whole `/roblox` surface is unpublished today (noindex, absent from
  the sitemap, no nav links). Attribution is wanted before its launch, not after, because a
  registration that arrives untagged can never be tagged retrospectively.
- **Expected coverage:** this design captures a family who lands on a tagged link and
  registers **within the same continuous browsing session**. It cannot capture a family who
  leaves and returns later. Nobody has measured what share that is; expect a substantial
  "unknown" bucket and set that expectation with Lynx before delivering numbers.

## The decision

A short, human-readable referral code travelling as a query param, held in memory for the
duration of the visit, written to the profile at account creation.

1. **Marketing links carry `?ref=<code>`** — e.g. `https://sogverse.com/roblox?ref=paris-nord`.
   Codes are invented ad hoc by whoever makes the link. There is no registry of valid codes.
   `ref` is the web's de facto convention for this and collides with nothing the app or any
   ad platform already uses.
2. **The code is read server-side in the proxy and seeded into a client context provider at
   the root**, so it survives the user browsing the whole site (shop → help → home →
   register) as client-side navigation. Step 3 fixes the mechanism, which is the part most
   likely to be got wrong.
3. **The param is left in the URL, not stripped.** It is only ever visible on the landing
   page — the first in-app navigation drops it from the address bar anyway — and leaving it
   means a reload or back-button on that page recovers the value instead of losing it.
4. **The referral value is never written to the user's device.** No cookie, no `localStorage`,
   no `sessionStorage` carries it. This is the single constraint the whole design hangs on —
   see *Constraints* for why it is what keeps the work off a consent banner, and for why the
   cookies the site already sets do not undermine that.
5. **At registration the code is written to a nullable `referral_code` column on `profiles`,
   by the trigger that creates the row, and is never updatable afterwards.** It is a
   property of the account, not of any enrolment, and it is immutable provenance rather than
   user-editable data — see step 2 for why that distinction decides the write path.
6. **Two account-creation paths capture it: parent sign-up (`/register`) and educator
   self-registration (`/register-gedu`).** Gedu capture is not for the Roblox programme — it
   is for knowing where educators come from when SOG runs recruitment campaigns. Gamer
   accounts deliberately do **not** carry a code; see *Rejected alternatives*.
7. **The privacy policy is updated** to state that this is collected and why. Retention needs
   no new sentence — the existing policy already commits to keeping information for as long
   as the account exists, which is the answer here.

### Names, fixed here so four files agree

Nothing type-checks these across the boundary, and every mismatch fails the same silent way:
the column is always NULL, with no error anywhere.

| Thing | Name |
|---|---|
| Query param | `ref` |
| Proxy → layout request header | `x-referral-code` |
| `raw_user_meta_data` key | `referral_code` (snake_case, matching `first_name`/`last_name`) |
| Gedu request body field | `referralCode` (camelCase, matching `firstName` in that contract) |
| Column | `profiles.referral_code` |
| Provider / hook | `ReferralProvider` / `useReferralCode` |
| Layout → provider prop | `initialReferralCode` (matching the existing `initial*` seeds) |
| Shared sanitiser | `sanitiseReferralCode` |

### What this is not

Not analytics, not a campaign-measurement system, and not a referral *programme*. The code
labels where someone came from and grants nothing. Do not let a later feature turn these
codes into entitlements (free access, discounts, priority placement) — they are public by
nature, will be forwarded and screenshotted, and are not a credential.

## Rejected alternatives, and why

**Vercel Web Analytics as the home for this.** Structurally incapable, not merely a weak
fit. It holds no per-visitor records at all — the visitor hash it derives is discarded by
design — so it can never answer "which accounts came from group X", and no configuration
changes that. Its exports are aggregate series, not lists of people, so it also cannot back
the partner-facing API Lynx eventually wants. It stays exactly as it is, answering anonymous
traffic questions. Do not attempt to route referral data through it or read attribution back
out of it.

*Note the unavoidable side effect:* `<Analytics />` is mounted in the root layout and the
param is deliberately left in the URL, so referral codes **will** appear in the paths Vercel
records. That is harmless — the product is cookieless and aggregate, and it yields a free
aggregate cross-check on click volume — but it is a fact, not an accident, and nobody should
"fix" it by stripping the param.

*And do not reach for a custom `track()` event.* The app already sends custom Vercel events
through a small helper, so "just fire a `track('referral', { code })` call" looks like a
two-line version of this whole plan. It is not: those events are aggregate and identifier-free
by deliberate policy — the helper's own comment says so — and firing one carrying a code that
is about to be attached to a named account would both break that policy and still not answer
the question, because the event cannot be joined to the account it came from.

**A cookie or `localStorage`, i.e. the industry-standard approach.** First-touch attribution
with a first-party cookie and a 30–90 day attribution window is what GA4, HubSpot and Meta
all do, and it is the only way to capture the visitor who returns days later. It was declined
deliberately: it requires a consent banner for every visitor to the site, a CMP to run it,
and — since the programme is French and CNIL is among the most aggressive EU regulators on
banner design — a banner built properly rather than dropped in. The cost was judged higher
than the value of the returning-visitor slice.

**`sessionStorage` as a middle ground.** It is tab-scoped and dies on tab close, which makes
it feel harmless. It is still storage on the user's device, so it triggers exactly the same
rule as a cookie. This is the change a future session is most likely to make while "fixing a
bug where attribution gets lost on reload" — it is not a bug, and this is not the fix.

**Stripping the param from the URL with `history.replaceState`.** Standard practice for ugly
ad-platform URLs, and rejected here because we control the link vocabulary and can simply
make the URL not ugly. Stripping buys a marginally cleaner address bar on one page and costs
the reload and back-button recovery cases on the landing page — which is where traffic from
social and in-app browsers arrives, the contexts most prone to reloading.

**Threading the code through every link.** Unnecessary and unmaintainable. The root context
covers all in-app navigation on its own.

**Full `utm_source`/`utm_medium`/`utm_campaign` vocabulary.** Right for real ad platforms
whose tooling expects those names; noise for partner outreach links we author ourselves. One
short `ref` reads better on a flyer, survives being seen in the address bar, and is easier to
describe honestly in a privacy policy — "you joined through Paris Nord Youth Club" rather
than something that reads like surveillance.

**Validating `ref` against a registry of issued codes.** Considered and turned down: whoever
reads this data filters for the codes they issued, so junk rows are noise they never query,
and a lookup table plus an admin surface for issuing codes is not worth building to prevent
them. Sanitisation (step 2) is not the same thing and *is* required.

**Storing the referral on the enrolment rather than the account.** Narrower and scoped to the
programme, but the account-level version is simpler and serves the platform-wide use. Decided:
account.

**Copying the code onto gamer rows, or inheriting it from the parent.** Decided against.
Reporting treats a gamer and their parent as one family unit, so a join through the existing
parent relationship answers "which group brought this family" without duplicating anything.
Beyond being simpler, it is the better answer on data-minimisation grounds: gamers are
children, and a marketing-provenance attribute is not something to copy onto a child's record
when it is already derivable. **Gamer rows keep `referral_code` NULL, always** — and this is
true by construction rather than by a rule anyone has to enforce, because the gamer-creation
route passes only name fields in metadata. Verified; do not re-derive.

**A superset `/register` for the Roblox programme.** Previously planned, now dropped. Roblox
programme families use the same registration as everyone else; products that need extra
consents will collect them at the point of joining that product. That is separate work and
not part of this plan.

**Writing the code from the client as a second write after sign-up** — the pattern the
registration form uses for `home_location_id`, whose in-file comment argues at length
against teaching the profile-creation trigger a new caller-supplied key. That argument was
weighed and does not carry here, for a reason worth stating precisely because the precedent
points the other way:

> `home_location_id` is **user-editable data**. It already has a column-level UPDATE grant
> and an RLS policy because the settings page lets a parent change it whenever they like, so
> writing it from the client adds no new authority. `referral_code` is **immutable
> provenance**. A client write would require `GRANT UPDATE(referral_code) TO authenticated`,
> which hands every user the permanent ability to rewrite their own attribution — including
> re-introducing exactly the payloads step 2's sanitiser exists to keep out. The grant is the
> thing we are refusing; the trigger is what lets us refuse it.

The other half of that comment — that a session may not exist the moment `signUp` returns —
is a second, weaker reason pointing the same way. Both Supabase projects run
`mailer_autoconfirm` today so a session is in fact available, but a lost referral code is
unrecoverable, where a lost home location is re-pickable from settings.

## Steps

### 1. The shared sanitiser

**One exported TypeScript function, with two callers** (the proxy in step 3, the gedu route in
step 4). It must be runtime-agnostic — the proxy is not Node — so pure string and regex work
only, no Node APIs.

**Signature: `(raw: string | null | undefined) => string | null`.** It takes a single value,
never an array. Collapsing a repeated param is the *caller's* job — see below for why that
split matters.

Rules, in this order:
1. trim surrounding whitespace (a hand-authored flyer link or an email client can add a
   trailing space; refusing to trim would lose a real code for no benefit)
2. lowercase
3. reject anything outside `a-z`, `0-9`, `-`, `_`, or longer than 64 characters
4. return `null` — never a partial or truncated value — when the input fails

**The repeated-param trap, and the near-miss in it.** A repeated `?ref=a&ref=b` is not a code
and must resolve to NULL. Two ways to get this wrong:

- **Do not copy the register route's `typeof x === "string"` idiom.** That exists because Next
  hands a *page* `searchParams` where a repeat arrives as an array. The proxy reads
  `request.nextUrl.searchParams`, a `URLSearchParams`, whose `.get()` returns only the first
  value and can never return an array — so a `typeof` check there is dead code that always
  passes, and `?ref=good&ref=<junk>` would store `good`.
- **`.getAll()` always returns an array**, including `["paris-nord"]` for the ordinary single
  case. A sanitiser that nulled every array input would therefore null *everything*, and the
  feature would silently never work. This is why the array handling lives in the caller and
  the sanitiser takes a scalar. The proxy shape is:

  ```
  const raw = request.nextUrl.searchParams.getAll("ref");
  const code = raw.length === 1 ? sanitiseReferralCode(raw[0]) : null;
  ```

**On where it lives:** `src/lib/navigation/internal-path.ts` is the closest analogue in shape —
small, pure, nullable result — but note that it resolves a repeated param by **taking the first
entry**, which is the opposite of what is wanted here. Do not copy its array handling; a
redirect target has a sensible first-choice fallback, a referral code does not.

A unit test that only ever hands the sanitiser a string cannot catch the `.getAll()` bug. Test
the caller — see step 7.

### 2. Migration and trigger

- **Column:** nullable `TEXT` on `profiles`.
- **CHECK constraint** matching the sanitiser (`^[a-z0-9_-]{1,64}$`). Use the explicit
  `(referral_code IS NULL) OR (…)` form — the schema has both idioms and this one states the
  intent. Name it `profiles_referral_code_format`, following `<table>_<column>_<rule>`.
- **Deliberately grant no `UPDATE` on the column.** `profiles` is the one table in the schema
  with column-scoped UPDATE grants, pinned by an exact-equality assertion in the DB
  authorization-spine suite, so the reflex when copying a recent column migration is to add
  one. Do not. Table-wide SELECT already covers reads. Note the consequence and accept it:
  with no grant, **nobody but `service_role` can ever alter or clear this value — an admin
  included**, since an admin is also the `authenticated` DB role. That is intended, and is
  consistent with the manual-deletion position in step 6, which runs as `service_role`.
- Read current schema state from `schema.sql` / `database.types.ts`, not migration history.
  Verify the next migration number against the remote `supabase_migrations.schema_migrations`
  at push time rather than trusting the highest local filename — see `supabase/CLAUDE.md`.
- Push the migration and regenerate types before committing.

**The trigger must sanitise in its body, before the INSERT.** This is the single most
important detail in this plan and the CHECK does not substitute for it. The profile-creation
trigger today writes metadata values straight through — which means a value violating a CHECK
**raises inside the trigger and fails the whole auth signup**. If `referral_code` were added
that way, a stranger's malformed `?ref=` in a link would turn into "registration is broken for
this family". So the trigger applies the same rules itself, degrading to NULL, and the CHECK
exists only as a backstop that should never be reached.

**Lowercase before testing, not after.** The natural-looking shape
`CASE WHEN v ~ '^[a-z0-9_-]{1,64}$' THEN lower(v) ELSE NULL END` is wrong: it tests the raw
value against a lowercase-only pattern, so `Paris-Nord` fails and degrades to NULL instead of
being normalised. Test the normalised value:

```
CASE WHEN lower(btrim(v)) ~ '^[a-z0-9_-]{1,64}$' THEN lower(btrim(v)) ELSE NULL END
```

This matters more than it looks, because **the trigger is the only sanitiser the DB tests
exercise** — they create users through the admin API, never through the proxy, so nothing
lowercases the value on the way in. The "mixed case is lowercased" case in step 7 fails
against the wrong shape, and only in CI.

Adding a key to this trigger is a deliberate act, justified above. That trigger is the most
sensitive function in the schema — it assigns roles, it writes past RLS, and it has a DB test
suite whose entire subject is that client-supplied metadata cannot influence what it grants.
Widen nothing else: the new key affects one nullable text column and nothing more.

**Why sanitising matters is not data quality.** An unsanitised string from a stranger is being
written to a family's profile row, and referral data is the kind of thing that gets exported
to a spreadsheet — a value beginning with `=` is a formula that executes when the file is
opened. **Scope note:** `first_name`/`last_name` reach the same table from the same metadata
with no such sanitising and would sit in the same spreadsheet. That is a real pre-existing gap
whose correct fix is escaping at export time, and it is deliberately **not** in scope here.

### 3. The mechanism: proxy → layout → context

The plan fixes this because the obvious alternatives are traps:

- `useSearchParams()` in a client provider is **wrong**. The hook must sit under a
  `<Suspense>` boundary and it is the boundary's *fallback* that gets prerendered — at the
  root layout that boundary wraps the entire app, so the whole site would server-render as a
  fallback and assemble after hydration. The registration page's own comment documents this
  exact failure being fixed once already; do not reintroduce it one level higher.
- A root layout cannot receive `searchParams` at all — only pages can.

So: **the proxy reads and sanitises the param and sets `x-referral-code` on the request; the
root layout reads that header and passes the value into the providers as an initial value.**
The proxy already sets request headers unconditionally, above every branch and early return,
so no path bypasses the seed.

**Delete the header before setting it, unconditionally.** A browser can send its own
`x-referral-code:` header, and an incoming request header reaches the layout untouched on any
request where the proxy does not overwrite it — so a conditional set leaves a forgeable path.
The shape is: always `delete`, then `set` only when a valid code was parsed. The actual harm is
small (anyone can just type `?ref=` themselves, and the trigger re-sanitises regardless), but
it is the difference between "the value always came through our own sanitiser" being true and
merely being intended. The step 7 integration case must assert the delete, not just the
non-emission.

Two accuracy notes for whoever builds it:

- The *shape* matches how the app seeds locale, timezone and a request-stable "now" into
  client context, but the *mechanism* does not — those come from `getLocale()`, a cookie, and
  `new Date()`. **There is no `headers()` call anywhere under `src/app/` today**, so this
  introduces the first one rather than copying an existing pattern. `docs/performance.md`
  claims the root layout already calls `headers()`; that claim is currently stale and this
  change makes it true.
- The existing `x-nonce` request header is the only precedent for the proxy→app header shape,
  and nothing currently reads it — so there is no consumer to copy either.

Two traps to write into the code as comments:

- **The provider must never overwrite a held value with null, and this is a live requirement
  rather than a guard against a hypothetical.** The root layout *does* re-execute during a
  session: the locale provider calls `router.refresh()` on a locale change, which refetches the
  route tree and re-runs the layout against the current URL — which by then usually has no
  `?ref`. Seeding with `useState(initial)` satisfies this naturally; a `useEffect` that syncs
  the prop into state on every change would wipe the code the first time anyone switches
  language.
- **No browser storage, ever, for this value.** State the constraint and the reason at the
  provider, or the absence reads as an oversight to be helpfully fixed.

### 4. Wire both registration paths

Absent code → send nothing → column stays null. Neither path changes in any other way,
including the parent form's loading/disabled handling.

- **Parent (`/register`)** — the form reads the code from context and includes it in the
  sign-up metadata under `referral_code`, alongside the existing name fields.
- **Educator (`/register-gedu`)** — a different mechanism reaching the same trigger. This path
  posts to a server route that creates the user with the admin client and then promotes it
  through an RPC. The code travels in the request body as `referralCode`, and the route passes
  it into the same user metadata the parent path uses.

  **The body schema must accept any string and let the handler coerce, not reject.** A
  `.regex()` on the zod schema would turn a malformed marketing param — which the educator
  never typed and cannot see — into a 400 that blocks a legitimate registration. Take it as an
  optional plain string, and run it through the shared sanitiser in the handler, where a bad
  value becomes NULL. This is a deliberate exception to the route's usual "the body schema is
  the validation" discipline, and it deserves an inline comment saying so.

  **Why not have the route read `x-referral-code` off its own request and skip the contract
  change entirely?** It looks like the tidier option — the route does pass through the proxy,
  and the handler context exposes `request` for exactly this kind of header read. It does not
  work: the proxy derives the header from the *query string of the request it is handling*, and
  the form POSTs to `/api/gedu/register` with no `?ref=` on it. The header would simply be
  absent. Appending `?ref=` to the fetch URL to make it work is the body approach wearing a
  different hat, with worse ergonomics. The body field is correct; this is recorded so the idea
  is not re-derived and half-built.

  The promotion RPC needs **no change**: it updates a targeted list of profile columns and
  never mentions `referral_code`, so the trigger-written value survives. Verified; do not
  re-derive.

### 5. Privacy policy

Two bullets, in two existing sections of the general privacy policy. The final copy is below
in all four locales — **do not rewrite it**; it was drafted against the surrounding house
register and reviewed. Append each as the last entry in its list.

**Contingent on the legal-basis answer** (see *Open questions*): the copy below assumes
legitimate interest. If the lawyer says consent, both bullets change and a checkbox joins the
registration form — do not apply this step before that answer lands. See *Shipping order*
below for what that means for the rest of the plan, which is not blocked by it.

#### `privacy.sections.infoWeCollect.bullets` — append

> **en** — If you came to us through a link shared by a school, club or partner organisation, a
> short code telling us which one — so we know which outreach actually reaches families, and
> can tell our partners whether theirs worked.

> **fi** — Lyhyen koodin, joka kertoo, minkä koulun, kerhon tai kumppanin jakaman linkin kautta
> tulit sivustollemme – jotta tiedämme, mikä viestintä tavoittaa perheitä, ja voimme kertoa
> kumppaneillemme, toimiko heidän linkkinsä.

> **sv** — En kort kod som visar vilken skola, klubb eller samarbetspartner som delade länken du
> kom hit via – så att vi vet vilken information som faktiskt når familjer, och kan berätta för
> våra partner om deras länk fungerade.

> **fr** — Si vous êtes arrivé par un lien partagé par une école, un club ou une organisation
> partenaire, un code court indiquant lequel — pour que nous sachions quelles actions touchent
> réellement les familles, et que nous puissions dire à nos partenaires si la leur a fonctionné.

#### `privacy.sections.legalBasis.bullets` — append

> **en** — For our legitimate interest in understanding which of our outreach efforts reach
> families — always balanced against your privacy, and you can ask us to stop at any time.

> **fi** — Oikeutetun etumme perusteella, kun selvitämme, mikä viestintämme tavoittaa perheitä –
> aina yksityisyytesi kanssa tasapainotettuna, ja voit milloin tahansa pyytää meitä lopettamaan.

> **sv** — För vårt berättigade intresse av att veta vilka av våra insatser som når familjer –
> alltid avvägt mot din integritet, och du kan när som helst be oss sluta.

> **fr** — Pour notre intérêt légitime à savoir lesquelles de nos actions touchent les familles —
> toujours mis en balance avec votre vie privée, et vous pouvez nous demander d’arrêter à tout
> moment.

#### Mechanical notes

- **Punctuation is per-locale and deliberate.** `en` and `fr` take an em dash (—); `fi` and `sv`
  take an en dash (–). French uses curly apostrophes. These match the surrounding bullets — do
  not normalise them.
- **Four locale files, not five.** `tlh` has no `privacy` namespace; adding one breaks the
  absence assertions in the translation-completeness script and its unit tests.
- **The translation script will not catch a missed locale here.** It flattens arrays as leaves,
  so a bullet added to `en` but not to `fi`/`sv`/`fr` passes CI silently. Hand-verify all four.
- **Retention needs no new copy.** The policy already commits to keeping information for as
  long as the account exists, which is the decided answer for this field. Adding a second,
  narrower retention sentence would only conflict with the blanket one.
- The policy page carries a hardcoded last-updated constant. Bump it by hand.
- **Nothing is added about disclosure to Lynx.** That belongs in the Roblox programme privacy
  policy, not the general one, and that document is frozen under legal review — see *Open
  questions*. The general policy describes the collection; it does not name programme
  recipients.

### 6. Subject access and deletion — nothing to build

The repo has no account-deletion route, no data-export or SAR tooling, and no anonymisation
routine, while the published policy promises erasure and portability in all four locales.
**That is a known and accepted position, decided by Kyle:** the law does not require erasure
to be self-service, so telling users the right exists and how to exercise it, then having an
admin action the request manually, is a compliant answer. The policy's contact section already
tells users to email support to exercise their rights, so the "how to ask" half is in place.

Concretely: a new nullable column on `profiles` is removed by the same manual deletion an
admin already performs, so **this plan adds no work here**. Do not build export or deletion
tooling as part of it, and do not treat the absence as a defect to fix in passing.

The one thing worth confirming separately — because it is what makes the manual position hold
rather than merely being asserted — is that an admin actually knows the steps, and that they
run as `service_role` (psql or the Supabase dashboard). Through the app there is no path, by
design (step 2). If nobody knows the procedure, that is a gap to raise separately.

### 7. Tests

- **DB.** Extend the existing suite whose subject is that client metadata cannot influence
  what the profile-creation trigger grants. Cases: a formula-shaped value degrades to NULL
  *without failing the signup*, mixed case is lowercased, over-64 degrades to NULL, `-` and
  `_` survive, an absent key yields NULL, and — the important one — the added key still cannot
  influence the assigned role.
- **Unit.** Pin the shared sanitiser against the same cases, including the array input.
- **Integration.** The proxy is the riskiest part and has an existing integration test file.
  Cover that a `?ref=` on the request emits a sanitised `x-referral-code`, that a repeated
  `ref` collapses to absent, and that a malformed one does not emit the header.
- **Authorization.** The spine asserts granted profile columns by exact equality, so a column
  with **no** UPDATE grant needs no spine edit and produces no failure either way. If the
  acceptance criterion "an authenticated user cannot alter their own code" is to be positively
  asserted rather than implied by an absence, add a write-IDOR case for it.
- **Route registry — needs no edit.** The integration suite's route posture registry records
  the gedu body *schema name*, not its fields, so adding an optional field changes nothing
  there. Verified; do not go looking for an edit to make.

DB tests are CI-only; exercise them by pushing the branch, not locally.

### Verified while planning — do not re-derive

Each of these was checked against the repo and is stated here so nobody spends time
rediscovering it:

- `headers()` in the root layout is **free**. The layout already calls `cookies()` and loads the
  user's profile, and no PPR or component caching is enabled, so it is fully dynamic already.
  This adds no cost and no Suspense requirement — which is what keeps the "registration page
  still server-renders its form fully" criterion satisfiable.
- The gamer-creation route passes only name fields in metadata, so gamer rows stay NULL by
  construction rather than by a rule anyone enforces.
- The promotion RPC names a targeted column list and never touches `referral_code`.
- The three existing `next/link` routes to registration (two on the homepage, one on every
  public product page) are all real `Link`s today.
- No existing write updates a whole profile row, so nothing breaks on a column with no UPDATE
  grant.
- The translation script treats arrays as leaves, and `tlh` has no `privacy` namespace.
- `docs/performance.md` claims the root layout calls `headers()`. That claim is stale today and
  this change makes it true — **fix that line in the same pass**; its cited line numbers are
  also out of date.

### 8. Write the constraints down where the code lives

Six decisions in this plan are **load-bearing for the legal position**, not engineering
preferences. Each was chosen partly to keep this processing lawful without a consent banner,
and changing any one of them is not a refactor — it needs a fresh legal review before it
ships. They have to be recorded somewhere a future session will actually meet them, because
every one of them looks like an arbitrary limitation from the inside:

1. **Nothing carrying this value is written to the user's device** — no cookie, no
   `localStorage`, no `sessionStorage`. "Attribution gets lost on reload" is not a bug.
2. **Gamer accounts never carry a code.** Family-level reporting joins through the parent.
3. **The value is write-once**, with no UPDATE grant, so it cannot be altered after creation.
4. **It is never used for profiling, or to decide what anyone is shown, offered or charged.**
5. **It is never combined with behavioural, device or journey data.**
6. **Codes label, they do not grant.** The moment one confers access, a discount or priority,
   it stops being a label and becomes a credential — a different thing legally and a worse
   thing to have travelling in public links.

If this goes in a colocated `CLAUDE.md`, note that the providers directory has none today, so
a new file there would be scoped to every provider rather than this one — a section in an
existing doc may fit better. Implementer's call on where; not on whether.

## Shipping order

Step 5 waits on a legal answer; nothing else does. The resolution is not to split the plan into
two releases but to notice what actually starts the processing:

**The feature is inert until somebody publishes a link carrying `?ref=`.** No such link exists
today. So steps 1–4 and 6–8 can be built, reviewed and merged in one pass, with the column
present, the plumbing live, and every value NULL because nothing is tagged.

**The gate is operational, not technical: do not publish a tagged link until the privacy-policy
bullets are live.** Collecting a value the policy does not yet describe is the one ordering
that is genuinely wrong, and it is avoided by not handing out tagged URLs — not by holding back
code.

Whoever merges this owes that sentence to whoever runs the first campaign. It is the single
handover point where the plan can be followed perfectly and the outcome still be wrong.

## Acceptance criteria

- Landing on any page with `?ref=paris-nord`, browsing to at least two other pages, then
  registering, results in a profile row carrying `paris-nord`.
- Reloading the landing page still yields the code; the param is still in the address bar.
- Navigating away from the landing page and back via in-app links still yields the code.
- Registering with no `ref` anywhere in the journey yields NULL, with no error.
- The same journey through `/register-gedu` stores the code on the educator's profile, and a
  malformed code there yields a successful registration with NULL — not a 400.
- A gamer account created by a parent who carries a code has `referral_code` NULL.
- `?ref=` values that are mixed-case, over-length, contain a disallowed character, start with
  `=`, or are repeated all resolve to NULL or a correctly-lowercased value — verified at the
  database, not only in the client.
- A malformed `?ref=` never fails a registration.
- **No referral value is written to the browser's storage** — no cookie, `localStorage` or
  `sessionStorage` entry carries it. Two clarifications, because both look like failures and
  neither is:
  - The site legitimately sets other cookies (auth, locale, timezone), so the check is specific
    to this value rather than a blanket absence.
  - A signed-in user's own `referral_code` **will** appear in the page's server-rendered
    payload, because the layout's profile query selects every column. That is accepted: it is
    the user's own value, on their own page, and it is not *storage* — nothing survives the
    document. Do not narrow the profile select over this.
- The registration page still server-renders its form fully — no fallback/skeleton frame
  introduced by the param plumbing, at the register route or anywhere else.
- An authenticated user cannot alter their own `referral_code` through the Data API.
- `npm run lint`, `npm run type-check` and `npm run test` clean; DB suite green in CI.

## Open questions

- **Legal basis: legitimate interest, or consent?** Step 5's copy cannot be finalised without
  it, and step 5's copy assumes legitimate interest. The question is with the lawyer already
  reviewing the Roblox programme copy; their answer decides it. If it comes back "consent
  required", step 5's bullets change and a checkbox joins the registration form. Everything
  else is unaffected either way, so the build need not wait — only the policy wording does.
  **Do not re-derive an answer here or infer one from the copy in step 5.**
- **Does the Roblox programme privacy policy need its own line, alongside the general one?**
  The programme policy establishes a three-way controller split and referral data looks like
  Lynx's own recruitment purpose, so a reader of that document would reasonably expect it
  there. Unresolved — and that copy is frozen under the same legal review, so it cannot be
  edited now regardless. Revisit when the review returns.

## Roblox programme: not a dependency

**This plan is not blocked on `/roblox`, and does not touch it.** The capture mechanism works
on any page, and the journey is walkable today from the homepage and every product detail
page. What the programme page's inert CTAs block is narrower: the Roblox programme cannot be a
*source* of referrals until a family can get from that page to registration.

Those CTAs are deliberately inert placeholders, tracked in `ROBLOX-TODO.md`, and they come
alive when programme products exist. One requirement must survive into whoever does that
wiring:

> **Those CTAs must become in-app `next/link` navigations, not `<a href>` full page loads.** A
> soft navigation keeps the referral context alive; a hard load destroys it, silently, with no
> error and no visible symptom — the code is simply absent at registration. This is the single
> easiest way to ship the feature broken while every test still passes.

The same requirement applies to the links that already exist and make the journey walkable
today — the two homepage CTAs and the product-page "Create account" link. All three are
`next/link` as of this writing; a refactor that turns any of them into a plain anchor breaks
attribution with no other symptom.

**Record the `next/link` requirement in `ROBLOX-TODO.md`, on the item that tracks those CTAs,
as part of this work.** That file is where the wiring is tracked and where whoever does it will
be reading; a requirement that lives only in a plan destined for deletion will not survive to
meet them. One sentence is enough.

## Out of scope, but coming

- **The partner-facing API.** Lynx eventually wants an API returning data about users
  connected to the Roblox programme. That is a separate, larger piece with its own access
  control, and it is a sibling of the existing open item for the Roblox impact-research data
  export — the two are the same shape of problem and should probably be one piece of tooling.
  Do not build a generic partner data API off the back of this plan.
- **"How did you hear about us?" as a signup field.** Complementary rather than redundant: it
  catches the people who never clicked a link at all, which is the one gap this design cannot
  close. Under consideration, not decided.
- **Products that require additional consents.** The mechanism that replaces the dropped
  superset registration. Separate work.
- **Reading the data.** No admin surface is proposed. On day one this is a psql query against
  `profiles.referral_code`, filtered to the codes whoever is asking actually issued. That is
  accepted; if it becomes a recurring request it argues for the admin surface, not against
  this plan.
- **Recording which codes were issued to whom.** Deliberately not solved here, and worth naming
  because the plan is otherwise silent on it: since codes are invented ad hoc when a link is
  made, *nothing in the system knows the list*. Whoever runs a campaign has to keep their own
  record, or nobody can construct the query above. That is a marketing-process gap, not an
  engineering one — but it is the half of this feature that lives outside the repo, and it is
  the reason a code registry would eventually be worth building if this gets used seriously.

## Constraints discovered while deciding

- **The design rests on never writing the referral value to the browser.** Any storage —
  cookie, `localStorage`, `sessionStorage` — would put this processing into ePrivacy scope and
  require a consent banner for every visitor. A consent collected later, at product join,
  cannot retroactively authorise storage that happened at landing.
- **The cookies the site already sets do not undermine that.** Auth, locale and timezone
  cookies are strictly-necessary or functional — set to deliver a service the user asked for —
  and are exempt from the consent requirement. A referral code is marketing provenance and
  would not be exempt. The distinction is the purpose, not the storage mechanism, which is
  precisely why this value is the one that must stay off the device.
- **The consent-at-join mechanism does not make this lawful and is not needed to.** Two
  different rules are in play: the banner rule is about device storage, GDPR is about
  processing personal data. This design avoids the first entirely, and satisfies the second
  through notice in the privacy policy.
- **Sharing this data with Lynx needs covering in the contract between SOG and Lynx**, not
  just in the privacy policy. That has real lead time and is not an engineering task.
- **The programme privacy policy already establishes a three-way controller split** — SOG is
  controller for platform operation; for Roblox impact research, Roblox is controller, Lynx is
  processor, SOG is sub-processor; Lynx is its own controller for its own purposes. Referral
  data looks like Lynx's own recruitment purpose, i.e. the third bucket. It cannot ride on the
  research transfer, whose dataset is enumerated and DPA-bound and does not include a referral
  source.
- **Attribution is impossible for organic arrivals.** Someone who hears about the programme
  from a school, searches for SOG and signs up is unattributable by any technical means. The
  "unknown" bucket is permanent and is not a defect.
