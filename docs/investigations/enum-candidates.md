# Enum candidates — what else is runtime text that is really a fixed vocabulary

Investigation record, 2026-08-22. **Nothing here is decided.** Migration `00199`
turned the `spoken_languages` reference table into the `spoken_language` Postgres
enum and the question followed naturally: where else does code or UI handle a value
as if it were only known at runtime, when the set is actually fixed and small enough
that an enum — a DB enum reaching TypeScript through codegen, or a TS const tuple
where no column is involved — would make the code cleaner? This doc records the
sweep, the candidates it found, and the ground it covered. If any of it is committed
to, it becomes a plan in `docs/plans/` (or a `TODO.md` item) and is removed from here.

## The test a candidate has to pass

The spoken-language conversion qualified on five counts, and they are the bar:

1. **The set is tiny and fixed.** Growth is a deploy, not a data change.
2. **Code already hardcodes the same values at compile time** — a map keyed by them,
   a switch, a hand-written union — usually next to a comment asking someone to keep
   it in sync. "Adding a row" was never really possible without a code change.
3. **No non-key column is load-bearing.** Whatever else the table carried (a label,
   an ordering) is dead or derivable.
4. **Runtime handling has a real cost** — a hook, a prefetch, loading and empty
   states, `?? []` fallbacks, guards that render conditionally on the list arriving,
   or plain `string` types that let a typo compile.
5. **As an enum, the values reach TypeScript via codegen** (`Constants.public.Enums.*`)
   so the hardcoded map becomes `Record<EnumType, …>` — exhaustive at compile time —
   and the parallel copy disappears instead of being tested for parity.

What an enum costs, and the reasons a candidate fails: Postgres cannot drop an enum
value (retirement means recreating the type and repointing every dependent object),
so a set that plausibly *shrinks*, a set that grows on a third party's schedule, and
a set that is genuinely data (the locations hierarchy, anything with admin CRUD) do
not qualify.

## A. Enum conversions

Ranked best-first.

### 1. `family_subscriptions.status` — qualifies (size M)

`text NOT NULL` closed by a CHECK: `active | past_due | cancelled | incomplete |
canceling`. The Stripe webhook route (`src/app/api/webhooks/stripe/products/`)
hand-writes the identical union, and its docblock already says the CHECK enforces
this exact set. The five values were written in migration `00039` and have never
changed. No admin UI writes the column; only the webhook does, and the vocabulary is
*ours* — Stripe's wider, differently-spelled set is translated onto it
(`canceled` → `cancelled`, `paused` → `past_due`, `trialing` → `active`), so Stripe
growing does not grow this set.

Cost today: the RPC that returns a family's participation subscription states
declares `status text`, so the participations service compares it to bare string
literals (`"past_due"`, `"canceling"`) to drive the parent's payment-problem badge and
access-until clamp — a typo is a silently dead badge. Seven SQL sites gate live
subscriptions on `<> 'cancelled'`, each a string Postgres cannot validate.

What the enum buys: the webhook's hand-written union goes; the RPC's return type
tightens so both badge comparisons are compiler-checked; every SQL literal becomes an
enum literal. Risk: `incomplete` is the only plausible retiree, and the schema already
documents a retired-but-listed value on `participation_status`. The migration
recreates one RPC (plus its grants); the other six functions only compare literals.

**Already recorded** as a schema lock-in follow-up in
`docs/records/stripe-participations-review-2026-08.md`; this entry adds the evidence and the
ranking, not a new ask.

### 2. `purchase_shape` — qualifies (size S/M)

Not a column: a `text` parameter of `create_participation`, closed by a plpgsql
`NOT IN (...)` guard (`subscription_monthly | single_payment | free | external`). The
set is spelled out three times — the SQL guard, a `PurchaseShape` union in
`src/types/index.ts`, and a zod tuple in the participations contracts that already
fights the duplication with `as const satisfies readonly PurchaseShape[]`. Three
copies with a compile-time brace between two of them is the shape that wants codegen.
No admin UI; the value is chosen from the product's billing mode.

Codegen types enum-typed RPC parameters correctly (verified on `p_gender`, `p_topic`),
so the alias becomes generated, the zod becomes `z.enum(Constants…)`, the `satisfies`
scaffolding goes, and the SQL guard is deleted because the cast refuses anything else.
Growth (`subscription_yearly` is clearly anticipated by a `startsWith("subscription_")`
check) is an `ADD VALUE`.

Honest limit: the webhook re-reads this value out of Stripe session metadata as an
untrusted string, so that inbound boundary still parses. The enum tightens the
outbound half only.

### 3. `CountryConfig.code` → literal union — qualifies as TS-only (size S)

`products.region_lock_country` must **stay** `text`; its column comment explains why
correctly (un-seeding a country would turn a stored lock into a violation). But
`SUPPORTED_COUNTRIES[].code` in `src/lib/constants/location-hierarchies.ts` is typed
plain `string`, which forces the region-lock radios into the exact degradation the
spoken-language flag map just shed: `Record<string, FlagComponent | undefined>`, with
a comment conceding it. `FlagCountry` already exists as a literal union in
`src/components/ui/flags.ts`, and the sibling `SPOKEN_LANG_TO_COUNTRY` is already
`Record<SpokenLanguageCode, FlagCountry>`. Typing `code` as a member of a
`COUNTRY_CODES` tuple deletes the widening and the `| undefined` in one edit. The
cheapest and lowest-risk item here.

### Borderline — recommendation is leave

- **`whatsapp_messages.direction` and `.status`** — both `text` with CHECKs, both
  duplicated as hand-maintained const objects in `src/types/index.ts` that the
  WhatsApp `CLAUDE.md` tells you to use instead of literals, consumed by a
  `status: string` indicator on one admin-only inbox screen. `direction` is closed
  forever; `status` mirrors **Meta's** delivery vocabulary and grows on their
  schedule. Converting one and not the other is worse than either; if taken, take
  both and accept that a new Meta status is a migration.
- **`profiles.locale` and `product_translations.locale`** — plain `text` with no
  CHECK at all, while `SUPPORTED_LOCALES` and `LOCALE_CONFIG` are compile-time and
  exhaustive, and adding a locale is unavoidably a deploy (a `messages/` file must
  ship). Two signs the parallel list drifts: `TODO.md` proposes the weaker fix (a
  CHECK) with a list that is already missing `fr`, and the admin product build
  silently drops a translation row whose locale is unrecognised. Why only
  borderline: of ~45 narrowing sites, ~35 narrow `next-intl`'s `useLocale(): string`,
  which a DB enum cannot fix; only ~8 DB-sourced sites clean up. And `tlh` is the
  most plausibly *removable* value in the schema.

## B. Existing DB enums the code still types as `string`

The cheap class — no migration, all mechanical. Ranked by what they protect.

1. **`product_topic` across the shop browse-filter chain** — `topics: string[]` in
   `src/components/public/products/filter-products.ts` and the browse-filters hook,
   sitting beside `tags: ProductTag[]` and `languages: SpokenLanguageCode[]`. There is
   no `isProductTopic` guard anywhere; add one next to `PRODUCT_TOPIC_VALUES` in
   `src/lib/products/topics.ts`, mirror the tag parser, and the "lowercase invariant"
   comment that exists only because this side is `string` goes with it.
2. **`participation_status` — six `z.string()`** in the participations contracts, one
   of which feeds a `=== "waitlisted"` branch in the waitlist route: the same
   silently-dead-branch shape as A1.
3. **`user_role` duplicated wholesale** — `USER_ROLES` / `UserRole` in
   `src/lib/constants/roles.ts` is a hand-maintained twin of the generated enum
   (`USER_ROLES` itself has no references outside the file). Also `role: string` on
   the voice path (`src/lib/voice/user-name.ts`, the voice contracts and service —
   `VoiceRole` is defined twice) and the family path (`src/services/family/`, where
   `SessionAudience` already *is* the `"customer" | "gamer"` pair restated there), a
   redundant `as UserRole | undefined` cast in `src/app/select-profile/`, and —
   the one worth more than its size — **`tests/db/authorization-spine.test.ts`
   hardcodes the four roles**, so a role added to the enum would never be exercised
   by the spine.
4. **Hand-restated unions** of `product_type` (family product page body),
   `billing_mode` (mock detail fixtures), and `gender_type` twice — once in the
   add-gamer dialog, once in `src/types/index.ts` hundreds of lines below its own
   generated alias, under a header that says "keep these in sync with the schema".
5. **`location_type` subset** (`"site" | "municipality"`) restated in the admin
   location picker and the product form state.
6. **Order arrays with no exhaustiveness check** — `PRODUCT_TYPE_ORDER` and
   `ROLE_ORDER` in the admin dashboard presentation: a fifth value silently vanishes
   from the key rail, schedule panel and cohort sort, because the sibling
   `Record<…>` fails the build but the array does not. `ROLE_ORDER` already carries a
   long comment documenting the hole. `PRODUCT_TOPIC_VALUES` is the template —
   comment plus a coverage test. One test each is the whole fix.
7. **Tests** — 14 integration mocks take `role: string` where the type is
   `user_role`, so a typo mocks a nonexistent role and passes.

## C. Two finds that are not enum candidates

- **Bug:** `useHolidayCalendars()` is called unconditionally in the admin product
  form's "when" section, while its only consumer sits behind a form lock that is
  hardcoded on and never lifted — so every admin product create *and* edit issues a
  joined two-table read nothing can render. One-line fix.
- **Dead column:** `parent_gamer.relationship text DEFAULT 'parent'` is read and
  written nowhere in `src/` or `tests/` — the same shape as the `spoken_languages.name`
  column `00199` retired. A deletion candidate.

## D. Checked and ruled out

So the ground is known to be covered:

- **Small reference tables** — none left. A sweep of every table and RPC the app reads
  (30 of each) found no other that returns a vocabulary; `spoken_languages` was the
  last.
- **`currency`** (CHECK `eur | gbp | usd` on four tables) — the code's set is
  *deliberately narrower* (`SUPPORTED_CURRENCIES = ["eur"]`), with the DB kept open as
  the re-enable seam `TODO.md` documents. An enum would make `Record<Currency, …>`
  demand configs that intentionally do not exist.
- **`session_attendance.status`** (`present | absent`) — already a tuple + `z.enum`
  + a db test writing every member; its docblock expects `late` / `excused` to come.
  The compile-time win is already banked.
- **`products.region_lock_country`** — stays text by documented design; see A3 for
  the part that is worth doing.
- **`voice_zones.icon` / `.color`** — text *so that* adding, removing or renaming is a
  pure code change, with a documented fallback for unknown keys. Renaming and removal
  are exactly what enums cannot do; the TS side is already a const tuple with an
  exhaustive `Record`.
- **Holiday calendars** — a vocabulary of *dates*; every column is read, admins hold
  write grants. Data, not vocabulary.
- **`product_images`** — the closed set is a regex inside a path CHECK, not a column,
  and the accept list on the TS side documents its obligation to match. Enum-ing
  means adding a column and rebuilding a deliberately designed constraint.
- **`products.timezone`** — always written from one constant; a single-value column.
- **`schedule_slots.weekday`** — numeric 0–6 with a range CHECK; an enum is worse.
- **Locations / postal codes** — GeoNames-scale data; `src/services/locations/`
  explains why only the per-country *shape* is hardcoded.
- **Free-form by design** — the WhatsApp webhook payload schemas, and the key side of
  the webhook's Stripe-status translation map (Stripe can send a status the installed
  SDK has never heard of; the looseness is load-bearing).

## If any of it is pursued

Two natural branches: one migration-bearing branch for A1 + A2 + B2 (all
participation/billing — one migration, one review), and one pure-TypeScript branch
for A3 + B1 + B3–B7. The two finds in C are a two-line tidy wherever convenient.
