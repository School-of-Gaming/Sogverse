# Discoverability

Running log of how Sogverse presents itself to search engines and AI crawlers: the
posture (what may be found, what must not be, and why), the mechanisms that enforce it,
the ranking baseline we measure progress against, and the open backlog. Cross-cutting
only — the URL and locale machinery is `src/i18n/CLAUDE.md`, the social cards are
`src/lib/og/`, and product visibility is `docs/architecture/products.md`.

**Standing goal: a parent who types what we do into a search engine or an AI assistant
finds us, in their language, on the first page — and what they find is Sogverse, not the
legacy marketing site it is replacing.** Progress is measured against the baseline log
below, re-run on the same queries.

## The posture (as of 2026-09-10)

Every public URL sits in exactly one of three tiers, and **a new public page decides its
tier before it decides anything else.** The tier is what the crawler affordances below
key off.

1. **Promoted.** The marketing pages (home, about, the legal documents, attributions), the
   auth entry points, the `/shop` browse grid, the Team pages (the index and every
   public profile), and the Library (the index and every live article). In the sitemap, self-canonical with the full `hreflang` set, a
   page-specific localized description, structured data, and linked from `llms.txt` where
   a reader would want the link. **A team profile's language versions are the locales the
   person wrote** (owner, 2026-10-01): its `hreflang` names only those, a locale they did
   not write shows the fallback text and canonicalises to the address of the locale it
   shows, the canonical is the slug address (`src/lib/slug.ts`), and the sitemap lists each
   profile once per indexed locale written. Text in a locale that is not indexed — Klingon,
   the easter-egg locale — makes the page its own canonical with no language alternates.
   Each profile has its own generated link card, its portrait beside the name; its address
   and caching are in `src/lib/og/`. **A Library article follows the same rule**
   (owner, 2026-10-01): its language versions are the locales it was written in, the
   canonical is the slug address of the version the page shows (derived from that
   version's title), an untranslated locale is reached by the id and canonicalises to the
   English slug address, and its link card is its cover. Links to an article or a profile
   stay in the page's locale, as a shop card's do: the URL's locale is the site's, and a
   page showing fallback text is still a page in that locale, canonical to the version it
   shows (owner, 2026-10-01). The rules are in
   `src/services/library/CLAUDE.md`. **A product's page is promoted while the product is
   on the shop's listing** (owner, 2026-10-01) — listed, a shop type, not ended: exactly
   what the shop grid shows — and only at its shop address. Its language versions follow
   the same rule as an article's, the locales its text was written in, and its structured
   data is a `Course` for a club or an `Event` for a camp or an event. The moment the
   product leaves the listing, its page drops to tier 2 (below).
2. **Reachable, not promoted.** Public because a family holding a link must get in, but
   `noindex, nofollow`, out of the sitemap, no `hreflang`, never listed in `llms.txt`, and
   never the subject or the URL of any structured-data node. Two surfaces, for two
   reasons that come up often enough to state plainly:
   - **The entire `/schools` tree.** Those products are **only for families living in the
     named Finnish municipalities**. The pages are public for convenience — a family
     forwards the link, a school newsletter carries it — not because the offer is open.
     Strangers on the internet discovering a municipality's clubs is the failure the tier
     prevents.
   - **Every product page whose product is not on the shop's listing** — unlisted, ended,
     or a municipality club — and every product page reached through `/schools`, whatever
     the product. A product has an `unlisted` property that hides it from the shop while a
     direct link still opens it, and the meaning is exactly that: **not promoted by the
     grid, a search engine or an AI assistant, but a parent who was sent the link gets
     in.** The decision is made per request from the product's own row, by asking the
     shop grid's own query whether it holds the product, so the grid and the crawler
     cannot disagree. The owner's trade (2026-10-01): being found beats the occasional
     false positive, so a page indexed while its product was listed stays in the index
     until the next crawl reads the `noindex` that unlisting put there; Search Console's
     removal tool is the fast path when that wait matters. The Open Graph card is the
     product's own in either tier: the scrapers behind a WhatsApp or Slack unfurl ignore
     robots directives, and the card is what a shared link shows.
   - Also here: the unpublished Roblox programme pages (the flip to published is
     nav, sitemap and noindex together — see the note on the route in
     `src/lib/constants/routes.ts`), the Minecraft API docs, the preview scenes, the
     admin's preview of a Library article, and every Klingon URL.
3. **Gated.** The role dashboards, settings and voice. Behind a login, disallowed in
   `robots.txt` for tidiness (the control is the proxy and RLS), and they carry no
   description of their own — the root's translated one is inherited and no crawler
   reads it.

**AI crawlers are allowed, deliberately** (owner decision, 2026-09-10): the point of the
work is to be found in AI answers as well as search results. The stance is written as
explicit named rules in `robots.txt` rather than left to the `*` default, so a future
edit cannot flip it without noticing.

## Mechanisms

Each one exists to make the posture above hold by construction rather than by memory.

- **URLs, `hreflang`, canonicals, `x-default`.** Every page URL carries its locale; the
  bare path is a detector that redirects. Alternates and canonicals are per page, built
  from the pathnames map, never from a hand-written slug. Klingon is excluded from
  `hreflang` and the sitemap and serves `noindex`. All of it is specified in
  `src/i18n/CLAUDE.md`, "Metadata, cards and crawlers".
- **`noindex` is always a tag, never a `robots.txt` disallow.** A disallowed URL is never
  fetched, so the tag is never read, and the bare URL can still be indexed off an
  external link. Allowing the crawl and serving the tag is what deindexes.
- **The sitemap** lists the promoted routes, one URL per indexed locale, every entry
  carrying the whole language set as alternates, plus each public team profile in the
  locales its person wrote, each live Library article in the locales it was written
  in, at its slug address there, and each product on the shop's listing in the locales
  its text was written in, at its shop address. **It reads the database, and is rendered
  per request**: the public team, the live articles and the shop's listing are read
  anonymously with no cookies, so a profile made public or hidden, an article published
  or unpublished, or a product listed, unlisted or ended, is in or out of the next fetch, and no build has to reach a database (a revalidating sitemap would be
  prerendered at build, in CI's smoke build and in a preview built before its migration
  ran). A failed read leaves those entries out rather than failing the file. **Only an
  article carries a `lastmod`**, the time its live versions were published: for every
  other URL the only value available is the fetch time — one date on every URL whether
  or not that page changed — and search engines discard a modification date they cannot
  trust. A product row's update time is not a real one either: the page shows seats left
  and whether registration is open, which change with every signup and with the clock,
  and its prices and schedule live in other tables.
- **`robots.txt`** derives the gated-prefix disallow list from the locale list (so a new
  locale cannot leave `/xx/admin` crawlable), and applies one identical rule set to `*`
  and to every named AI agent. Adding an agent is one line in one constant.
- **Descriptions** are page-specific and localized, keyed beside the titles in the
  server-only `metadata` namespace. The home page inherits the site-wide description on
  purpose — it *is* the site. The legal pages' descriptions are served in English under
  Klingon like the documents themselves (the omission mechanism in `src/i18n/CLAUDE.md`).
- **Structured data** is JSON-LD, emitted through one server component that escapes the
  serialized JSON so an admin-authored product name containing `</script>` cannot break
  out of the data block. A data block is never executed, so the CSP's script nonce does
  not apply to it. Six blocks exist: `Organization` + `WebSite` on every page from the
  locale layout, `FAQPage` on About, an `ItemList` on the shop, a `ProfilePage` about
  a `Person` on each team profile, whose `worksFor` names the layout's `Organization` by
  `@id`, an `Article` on each Library article, whose `publisher` names it the same
  way, and on each promoted product page a `Course` for a club — one `CourseInstance`
  whose weekly `courseSchedule` is the club's slots in its own timezone — or an `Event`
  for a camp or an event, naming the `Organization` as provider or organizer. A product
  block states the price but never seats or availability: those are live, and a stale
  "available" in a search result is worse than none. **Rule: a structured
  data block reads the same source as the visible page** — the same message keys, the
  same prefetched rows — so it can never assert something the page does not show, and
  only the shop's listing can reach the `ItemList` because only that is ever prefetched
  for the grid. Each item carries its position, its name and its page's URL in the
  shop's own locale — every one of those pages is promoted, because the items are
  exactly the listed products. It is omitted entirely when the grid has nothing to list,
  rather than emitted empty over a page the client is still filling.
- **`llms.txt`** is one English file at the site root, generated at request time from the
  English catalog (the site description, the About prose, every FAQ question and answer
  flattened to plain text) so it cannot drift from the site, with absolute links to the
  promoted pages only, a section listing every live Library article (read anonymously
  per request, each at the address an English reader is sent to, with its summary), and
  a section naming each indexed locale's home URL. It is
  publicly cacheable, which is why it is excluded from the proxy: a response the proxy
  handles may carry a refreshed session cookie, and a shared cache must never hold one.
- **Open Graph cards** are route handlers taking a locale parameter; the reasoning is in
  `src/lib/og/`.

## Baseline log

Re-run with the same queries when a discoverability change has had time to be crawled
(weeks, not days), and append a dated entry. A WebSearch tool's results are not a
personal Google results page — no personalisation, no location — so the numbers are
indicative and comparable with each other, not with what a parent in Espoo sees.

### How to re-run

Same tool, same queries, same recording, so two entries compare cleanly:

- **Tool:** an agent's web search tool, one search per query, no follow-up refinement.
  Record which tool and the date; if the tool changes, say so in the entry, because the
  numbers then compare only loosely.
- **Per query, record:** whether any School of Gaming property appears at all; its
  position in the returned list; **which host** — `sogverse.sog.gg` or `www.sog.gg`
  matters more than the position, since the goal is that Sogverse takes over; and the
  top three other results. Keep the table shape below.
- **The queries, verbatim** (language in brackets where not English):
  1. `School of Gaming`
  2. `School of Gaming Finland`
  3. `Sogverse`
  4. `school of gaming minecraft club`
  5. `minecraft club for kids online`
  6. `minecraft club for kids Finland`
  7. `roblox summer camp for kids online`
  8. `online gaming club for children`
  9. `gaming hobby for children with a coach`
  10. `game educator children`
  11. (fi) `minecraft kerho lapsille`
  12. (fi) `pelikerho lapsille`
  13. (fi) `School of Gaming pelikoulu`
  14. (fi) `roblox leiri lapsille`
  15. (sv) `minecraft klubb för barn`
  16. (fr) `club minecraft enfants en ligne`
  17. `safe supervised minecraft server for kids weekly sessions with adult educator`
  18. `turn screen time into quality time kids gaming club`
  19. (fi) `harrastamisen suomen malli pelikerho School of Gaming kunta`
  20. (fi) `ohjattu minecraft harrastus verkossa lapselle maksullinen`
- **Also check, outside the table:** which host the brand queries resolve to, whether
  the dead `sogverse-fi.sog.gg` sign-in page is still indexed, and whether a Google
  Business Profile shows on a real Google search.

### 2026-09-10 — before

Captured before any of the mechanisms above shipped. Position is the rank in the list the
tool returned; "—" means no School of Gaming property appeared at all.

**The domain estate this app sits in.** `www.sog.gg` is the marketing site (club
catalogue under `/lessons/`, locations, municipality pages, blog; `robots.txt` names it as
host). `sogverse.sog.gg` is this app. Also indexed: the bare apex `sog.gg` serving
marketing content under its own URLs (confirm it redirects rather than duplicates),
`en.sog.gg` (older English site), `lat.sog.gg` (Spanish / Latin America), `start.sog.gg`
(campaign landing), `www.geduacademy.com` (Game Educator recruiting), and a stale
`sogverse-fi.sog.gg` sign-in page whose hostname no longer resolves. **Every non-brand
query that surfaces the company at all surfaces `www.sog.gg`; this app is found only on
the literal term "Sogverse".** Non-brand acquisition therefore depends on a property
this repo does not control, and the estate competes with itself for the same terms.

| Query | Pos. | What ranked |
|---|---|---|
| School of Gaming | ~7–8 | own Facebook, YouTube and LinkedIn pages above the site; the generic "school for gamers" sense and Xamk's "Summer School of Gaming" dilute it |
| School of Gaming Finland | ~6 | `www.sog.gg/lauttasaari`; Xamk name collision at 3 |
| Sogverse | 3 | `sogverse.sog.gg/`, `/privacy` at 4 |
| school of gaming minecraft club | 1 | `www.sog.gg/lessons/…` |
| minecraft club for kids online | — | Connected Camps, Outschool, minecraftclub.co.uk |
| minecraft club for kids Finland | ~6 | one `/lessons/` page; exen.fi present |
| roblox summer camp for kids online | — | Create & Learn, CodeWizardsHQ, iD Tech |
| online gaming club for children | ~5 | `www.sog.gg/` |
| gaming hobby for children with a coach | — | "how to quit gaming" content; the intent is unclaimed |
| game educator children | — | NGO and academic results; the job title is unowned |
| (fi) minecraft kerho lapsille | 4, 5, 6, 8 | four distinct sog.gg URLs; harrastamisensuomenmalli.fi's page *about* us at 1 |
| (fi) pelikerho lapsille | — | municipal and parish free clubs end to end |
| (fi) School of Gaming pelikoulu | ~4 | press and partner pages above the site |
| (fi) roblox leiri lapsille | — | toy shops and safety pieces; no camp provider at all |
| (sv) minecraft klubb för barn | — | no commercial Swedish club ranks |
| (fr) club minecraft enfants en ligne | — | English results only |
| safe supervised minecraft server for kids weekly sessions with adult educator | — | Outschool, Common Sense Media |
| turn screen time into quality time kids gaming club | — | parenting-advice publishers only |
| (fi) harrastamisen suomen malli pelikerho School of Gaming kunta | ~3, off-domain | the hobby-model programme's page *about* us; competitors incoach and xroc.gg on their own domains |
| (fi) ohjattu minecraft harrastus verkossa lapselle maksullinen | — | Autismiliitto articles that *describe* us; a gift-voucher camp; unigaming.net |

What it says: brand terms are held but diluted, and the top brand slots belong to our own
social profiles rather than the site. Finnish-language Minecraft is the one commanding
position. Non-brand English is absent without exception; Swedish and French have no
presence at all. Third parties (the Finnish hobby-model programme site, Autismiliitto,
partner press) rank for our story more reliably than we do. Two open goals nobody has
claimed: Finnish Roblox camps, and "gaming as a coached hobby".

**Official profiles, confirmed by the owner the same day** and now the `Organization`'s
`sameAs`: the legacy site `www.sog.gg` itself, so the entity search engines already know
is tied to this Organization, then Instagram `sog_suomi` (the one posted to regularly), the Helsinki Facebook page
`sogversum`, YouTube `@SchoolofGamingSuomi`, LinkedIn `company/school-of-gaming`, the
Eventbrite organiser page and Crunchbase. The Oulu Facebook page `sogsuomi`, the one the
legacy site links to, no longer resolves for a visitor and is left out. The Finnish
company registries list the entity under business ID 3110461-1. No TikTok and no X
account exist; the Discord server is invite-only and has no public URL. A Google
Business Profile could not be confirmed either way.

## Open backlog

Ideas not yet decided or not yet built, in rough order of expected value. An item that
lands is deleted here and its mechanism is described above.

- **Overtake the legacy site.** `www.sog.gg` is the current front door and the legacy
  site; Sogverse is to adopt its content and features over time and `sog.gg` is
  eventually dropped entirely (owner, 2026-09-10). The near-term goal is that Sogverse
  draws more traffic than `sog.gg`, so families read this as the main site and the old one
  as legacy. Today the legacy site carries every non-brand ranking and this app none, so
  the ranking has to be *moved*, not just earned: each time Sogverse gains a page that
  supersedes a legacy one (a club, a location, a topic, a blog post), the legacy URL
  should 301 to it, which is what carries the authority across; the `Organization`
  schema names this app as the brand's URL, never `www.sog.gg`. The rest of the estate
  goes the same way: the bare apex redirects to one host, the dead `sogverse-fi.sog.gg`
  sign-in page is removed from the index, and the `en.` / `lat.` / `start.` sites either
  redirect here or are current.
- **Topic landing pages** (`/minecraft`, `/roblox`, `/fortnite`, …) generated from the
  topics module: the existing "About {topic}" prose plus that topic's listed products.
  These are the pages both search and AI assistants cite for "who runs Minecraft clubs
  in Finland".
- **Off-site signals**: Search Console and Bing Webmaster verification, a Google Business
  Profile check, and fixing or replacing the legacy site's link to the dead Oulu Facebook
  page so the profiles it names agree with the `sameAs` here.
- **After the merge, check what only the live site can show.** Google's Rich Results
  Test on a team profile, a Library article and a product page; the Facebook and LinkedIn
  share debuggers, and a real WhatsApp and Slack paste, on a profile and an article; then
  submit the sitemap in Search Console and watch the pages index.
- **Per-route Open Graph images** for the promoted pages that still share the site card
  (the team profiles have their own).

A per-locale `llms.txt` was considered and declined (2026-09-10): discovery in another
language runs through that language's pages and the index they rank in, both of which
already exist per locale, and models translate the English file fluently.
