# Flatten product topics, drop Webinar, add Roblox Studio

## Problem

`products.topic` is a fixed Postgres enum, and the metadata behind it (in `src/lib/products/`)
splits every topic into `kind: "game" | "subject"`. That single discriminator secretly carries
three unrelated facts:

1. **How the topic is categorised** — game or subject.
2. **Where its display name comes from** — games use a brand literal, subjects a translated
   message key.
3. **Whether the product detail page shows an "About the game" card** — games only.

Nothing forces those three to agree, and **Roblox Studio is the case that pulls them apart**: it
is a subject (you don't play it, you build in it), its name is a proper noun that must not be
translated, and a parent absolutely needs the info card — it is the only thing in the catalogue
that is **desktop-only**, so a family with just a tablet cannot take the club. Neither branch of
the union can express that combination.

Two further defects surface at the same time:

- **`webinar` is not subject matter.** It describes *delivery*, which the data model already
  expresses as `product_type = 'event'` plus `is_remote = true`. Because it occupies the topic
  slot, "a webinar about Minecraft" is unrepresentable — you have to choose one or the other.
  It also has no behaviour anywhere: nothing in `src/` branches on it. It is a label pretending
  to be a category.
- **The shop's topic filter row is labelled "Game"**, which stops being true the moment any
  non-game topic exists, and the row hides its own overflow (`overflow-x-auto` with the
  scrollbar suppressed). On a mouse-driven desktop that means off-screen options are not merely
  hard to find, they are undiscoverable — there is no scrollbar, no fade, and no gesture most
  people have. Today's five short chips mostly fit, so the defect is latent; it bites as the
  list grows.

## Scale

Measured directly against both databases:

| Environment | Topic | Products |
|---|---|---|
| **Prod** | `minecraft_java` | 24 (16 consumer_club, 8 camp) |
| **Prod** | `fortnite` | 2 (consumer_club) |
| **Prod** | *everything else, incl. `webinar`* | **0** |
| Staging | `webinar` | 19, plus 64 cascading participations |
| Staging | other topics | 63 |

**Production has no `webinar` rows and never had any surviving ones**, and no rows at all for
`minecraft_education`, `minecraft_bedrock` or `pokemon_go` — those topics are aspirational. The
19 staging rows are matrix fixtures, not real data: the same "webinar" is filed as a
`consumer_club`, a `municipality_club`, a `camp` *and* an `event`.

So this change carries **no production data migration**. That is what makes the cheap migration
below safe.

## The decision

1. **Topic is one flat axis.** Delete `kind` entirely — not extend it. There is no game/subject
   distinction in the model any more; every value of the enum is simply a topic.
2. **Topic metadata becomes `label` plus an optional `info` block.** `info` is what drives the
   product-page card, and its presence — not a category — is the render condition:

   ```ts
   type TopicMeta = {
     label: string;   // brand proper noun, never translated
     info?: {         // present ⇒ the "About …" card renders
       pegi?: number;
       url?: string;
       stores?: readonly GameStore[];
     };
   };
   ```

   Every remaining topic is a proper noun, so `labelKey` disappears with the only value that
   used it.
3. **`webinar` leaves the enum; `roblox_studio` enters it** — as a rename, see Steps.
4. **Roblox Studio carries `info` with no `pegi`.** It is a creation tool and has no age rating.
   It keeps a description, a "not included"-style note, and a single "where to get it" link to
   `https://create.roblox.com/`.
5. **No tag system.** eSports, "creative" and similar groupings are deliberately not built.
6. **The shop keeps one chip per topic**, with the three Minecraft editions separate. The
   per-municipality page keeps its collapsed single "Minecraft" chip.
7. **Both public browse surfaces label the row with the existing `subject` message key.** The
   `topicLabelKey` prop disappears; the `productBrowse.filters.topic` key ("Game") is deleted
   from every locale.
8. **The subject chip row wraps at every viewport** rather than scrolling. This filter matters
   enough that every option should be visible without a gesture, on any device.
9. **No Roblox trademark attribution outside `/roblox`.** The existing attribution on that
   landing page is sufficient; it does not travel to the shop or product pages.

### Naming: code says `topic`, the UI says "Subject"

The column, the enum, and every symbol stay `topic`. Only the user-facing label reads "Subject".
That divergence is the house pattern, not a leak — the same shape as the code saying "dashboard"
while the product says "My SOG". "Subject" was chosen because the per-municipality page already
ships that exact word over that exact chip row, and because School of Gaming teaches subjects:
the schoolish connotation is on-brand rather than off it.

### The row label needs a per-locale decision, not a translation

**This string must not be translated literally.** The English word carries a brand connotation
that does not transfer, and each locale should use the word a parent in that market would
actually use for "what this club is about".

The existing `subject` translations already show both the right and the wrong instinct:

| Locale | Current | Assessment |
|---|---|---|
| `fi` | *Aihe* | **Good.** Means topic/theme. Correctly avoids *oppiaine*, which is strictly a school subject and would read oddly over "Fortnite". |
| `sv` | *Ämne* | **Good.** Naturally carries both "school subject" and "topic/matter". |
| `fr` | *Sujet* | **Needs revisiting.** This is the literal translation and the weak one — in French, *sujet* is the subject of a sentence or a discussion, not a course-catalogue facet. Candidates: *Thème*, *Activité*, *Matière*, *Univers*. |
| `tlh` | *qech* ("idea/concept") | Fine — easter-egg locale, accuracy not the goal. |

**French is the one to get a native speaker to confirm.** It is also the market the `/roblox`
programme targets, so it is the highest-stakes of the four. Do not silently pick one; surface the
choice.

## Rejected alternatives, with reasons

- **Add a third kind (`tool` / `software`) for Roblox Studio.** The card behaviour would be
  identical to a game's, so the extra kind would carry nothing but a label — and labels can be
  per-topic without a kind. It preserves exactly the conflation that caused the problem.
- **A tag system (`esports`, `creative`, `minecraft`).** Turned down as premature. The only
  grouping that actually exists — the municipality page's collapsed Minecraft chip — is already
  expressed by the existing chip type, which is a tag in all but name. Revisit only when a
  grouping would collect **two or more topics that each stand alone**; a one-member tag is a
  topic wearing a costume. Note also that a previous dynamic tags table was deliberately dropped
  from the schema once already.
- **Keep `webinar` as a topic.** It is delivery, not subject matter, it duplicates
  `product_type = 'event'` + `is_remote = true`, and holding the slot makes "a webinar about
  Minecraft" impossible to express.
- **Reintroduce webinar as a visible delivery-level filter.** Not wanted. If it is ever needed,
  it is a different filter row built from `product_type` and `is_remote` — never a topic value.
- **Recreate `product_topic` without `webinar`.** Unnecessary and far riskier: it would mean
  dropping and rebuilding two functions with 25- and 26-argument signatures plus their explicit
  grants. A single `RENAME VALUE` achieves the same end state.
- **Leave `webinar` orphaned in the enum, hidden in code.** Also unnecessary, and it would force
  the enum-coverage unit test to carry an exclusion list forever.
- **Collapse the Minecraft editions into one shop chip.** Rejected: Java, Bedrock and Education
  really are different games, and a shopping parent must know which one they are buying for.
  The municipality page collapses them for a reason that does not apply to the shop —
  municipality clubs are nearly always Education edition, so there is effectively nothing to
  choose between there.
- **A "Minecraft" chip that expands to reveal the editions.** A new interaction concept for a
  row with six items in it.
- **Keep horizontal scrolling and add an edge fade.** Rejected in favour of wrapping everywhere.
  The fade makes overflow discoverable; wrapping makes it unnecessary.
- **Label the row "Topic" or "Interest".** "Topic" is the code's word for this and would be an
  implementation term surfacing in the product. "Interest" is warmer but has no precedent
  anywhere in the app, where "Subject" already ships.
- **Give Roblox Studio the Roblox platform's PEGI 7.** That asserts a rating the tool does not
  have. Omit the badge instead.

## Steps

Each step is independently verifiable. Order matters at steps 1–2.

**1. Delete the staging webinar fixtures — before the migration.**
On staging only, delete the 19 products with `topic = 'webinar'`. All ten foreign keys onto
`products` are `ON DELETE CASCADE`, so this also removes their participations (64 rows), prices,
translations, schedule slots and group assignments. Verify zero remain on staging, and confirm
prod is already at zero.

> This must precede step 2. `RENAME VALUE` rewrites the label, not the rows — any row still on
> `webinar` would silently become a Roblox Studio product.

**2. Migration — one statement.**

```sql
ALTER TYPE public.product_topic RENAME VALUE 'webinar' TO 'roblox_studio';
```

Check the remote migration history before choosing the version number: a number already present
in remote history is silently treated as applied. Push, regenerate `src/types/database.types.ts`,
and confirm the generated union contains `roblox_studio` and not `webinar`. Do not hand-edit the
generated types, and do not dump `schema.sql` by hand.

**3. Flatten the topic metadata** (`src/lib/products/`).
Remove `kind` and everything derived from it: the game-topic type, its narrowing guard, and the
game-only and subject-only topic lists. Remove the municipality browse list too — it existed
solely to exclude `webinar`, and with that value gone it is the full set. Reshape the metadata
type to `label` + optional `info`, moving `pegi`/`url`/`stores` inside `info`. Replace the
`webinar` entry with `roblox_studio`. Rename the shop's chip list so its name no longer says
"game"; it stays one chip per topic. The municipality chip list keeps its explicit,
hand-listed Minecraft collapse and derives the remainder from the full topic tuple.

Update the module's header comment to state the new rules: labels are brand literals; `info`
presence is what renders the card; and **if a common-noun topic ever arrives** (an "Online
safety" parent session is the likely first), add a `labelKey` variant as a two-case union on the
*name only*, orthogonal to `info` — do not reintroduce kinds for it.

**4. Make the product-page card topic-driven** (`src/components/public/products/`).
Rename the card away from "game", and change its render condition from "is a game topic" to "has
an `info` block". Make the PEGI badge conditional on `info.pegi`. The section heading becomes a
single interpolated string — **"About {name}"** — which reads correctly for every topic
("About Minecraft Java", "About Roblox Studio") and replaces the fixed "About the game". Note
that the card currently also renders the topic's name in its body; with the name now in the
heading that line is redundant and should go.

**5. Move and extend the message namespace** (all five files in `messages/`).
Rename the `gameInfo` namespace so it is no longer game-specific, carrying the five existing
entries across unchanged, and add a `roblox_studio` entry. Its copy must convey, in every
locale:

- **What it is** — the free tool for building and scripting Roblox experiences; children create
  rather than play.
- **It costs nothing** — the inverse of the Minecraft note. There is no purchase.
- **Windows PC or Mac only.** Not iPad, not Chromebook, not a phone, not a console. This is the
  single most important sentence on the card; a family without a desktop or laptop cannot take
  part. Re-verify Roblox's current platform support when writing it.
- **A free Roblox account is required**, and the account's age setting governs its chat and
  privacy controls.
- Creations can be published where other people see them.

Link label: a "where to get it"-style string pointing at `https://create.roblox.com/`.

**6. Converge the filter row** (`src/components/public/products/`).
Delete the `topicLabelKey` prop and its two call sites' arguments; both surfaces use the
`subject` key. Keep `topicChoices` — the shop and municipality chip sets genuinely differ. Give
the shared filter-row component a wrap mode and use it for the subject row: the chips wrap on
every viewport instead of scrolling. The row currently centres its fixed-width label against the
chip area, which is wrong once the chips occupy two lines — align the label to the first line.
Delete the stale comment block proposing a divider and a separate subject-topic list; that idea
is superseded.

**7. Retire the "Game" label key** from all five locale files, and settle the French `subject`
wording per the table above.

**8. Re-point the unit test invariants** (`tests/unit/lib/products/`).
The existing assertions are phrased over "every game"; rephrase them over "every topic with an
`info` block" — non-empty label, exactly one of `url` or `stores`, and English prose present.
Keep the assertion that the display-order tuple covers the enum exactly once. Add a case that a
topic without `info` renders no card.

**9. Flatten the admin topic picker** (`src/components/admin/products/`).
The picker groups its options into "Games" and "Subjects" option groups; that becomes one flat
list. Delete the corresponding `topicKinds` message keys in all five locales, and rewrite the
field's hint copy, which currently explains the game-versus-subject distinction and names
Webinar as the example subject.

**10. Update `docs/products-architecture.md`**, which states the game/subject split as part of
the product model.

## Acceptance criteria

- `product_topic` contains `roblox_studio` and not `webinar`; both databases have zero rows on
  the old value; `database.types.ts` matches and was regenerated, not edited.
- No `kind`, game-topic type, or game-topic guard remains anywhere in `src/`.
- The shop's subject row shows six chips — three Minecraft editions, Fortnite, Pokémon GO,
  Roblox Studio — and the municipality row shows four, with Minecraft collapsed.
- Both rows are labelled from the same message key, and the subject row wraps at every viewport
  with no hidden horizontal overflow.
- A Roblox Studio product's detail page shows the About card with its description, the
  desktop-only note and the `create.roblox.com` link, and **no PEGI badge**. A hypothetical
  topic with no `info` renders no card at all.
- All five locales are complete; no "Game" filter label and no Webinar topic string survives in
  any of them; the French row label has been deliberately chosen rather than translated.
- `npm run lint`, `npm run type-check` and `npm run test` are clean — zero warnings — and the DB
  tests pass in CI (they cannot run locally).

## Constraints discovered while deciding

- **Postgres cannot drop an enum value.** `ALTER TYPE … RENAME VALUE` is the lever that makes
  this change one statement, and it is only safe because no row anywhere is on the old value.
  Renaming preserves the value's ordinal position, so `roblox_studio` inherits Webinar's slot
  ahead of `pokemon_go` in the raw type — irrelevant, because display order is a hand-maintained
  tuple in code and the enum's own order is already meaningless.
- **The rename is silently destructive if rows remain.** They are relabelled, not rejected.
- **`product_topic` is referenced by** the `products.topic` column, its index, and the
  `create_product` / `update_product` function signatures, which carry explicit grants to
  `authenticated` and `service_role`. `RENAME VALUE` disturbs none of them; recreating the type
  would have required rebuilding all of it.
- **All ten foreign keys onto `products` are `ON DELETE CASCADE`**, so deleting a product takes
  its participations, prices, translations, schedule slots, seat counts, staff details, groups,
  holiday calendars and gedu assignments with it.
- **Nothing in `src/` branches on the `webinar` topic value** — it appears only in the metadata
  map, the display-order tuple, one exclusion filter and the generated types. Removing it costs
  nothing behaviourally.
- **Production uses only two topics.** Do not assume the others have exercised any code path in
  the real world.
- **Roblox Studio is desktop-only** (Windows and macOS). This drives the most important line of
  parent-facing copy in the change; confirm it still holds when the copy is written.
- **The Roblox trademark attribution stays scoped to `/roblox`** and is deliberately not carried
  onto shop or product pages.
