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
   auth entry points, and the `/shop` browse grid. In the sitemap, self-canonical with the
   full `hreflang` set, a page-specific localized description, structured data, and
   listed in `llms.txt`.
2. **Reachable, not promoted.** Public because a family holding a link must get in, but
   `noindex, nofollow`, out of the sitemap, no `hreflang`, never linked from `llms.txt` or
   from any structured-data block. Two surfaces, for two reasons that come up often
   enough to state plainly:
   - **The entire `/schools` tree.** Those products are **only for families living in the
     named Finnish municipalities**. The pages are public for convenience — a family
     forwards the link, a school newsletter carries it — not because the offer is open.
     Strangers on the internet discovering a municipality's clubs is the failure the tier
     prevents.
   - **Every product detail page**, at every URL that renders one, listed or not. A product
     has an `unlisted` property that hides it from the shop while a direct link still
     opens it, and the meaning is exactly that: **not promoted, not findable, but a parent
     who was sent the link gets in.** The crawler rule is static across listed and
     unlisted — one tag, set before anything about the product is read — because a
     per-product rule could be side-stepped by sharing the product's other URL, and
     because a listing changes with terms and seasons while the browse page is the stable
     thing worth a search result. The Open Graph card is still the product's own: the
     scrapers behind a WhatsApp or Slack unfurl ignore robots directives, and the card is
     what a shared link shows.
   - Also here: the unpublished Roblox programme pages (`docs/roblox-todo.md`), the
     Minecraft API docs, the preview scenes, and every Klingon URL.
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
  carrying the whole language set as alternates. It carries **no `lastmod`**: the only
  value we could emit is "now", every crawl, and search engines discard a modification
  date they cannot trust.
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
  not apply to it. Three blocks exist: `Organization` + `WebSite` on every page from the
  locale layout, `FAQPage` on About, and an `ItemList` on the shop. **Rule: a structured
  data block reads the same source as the visible page** — the same message keys, the
  same prefetched rows — so it can never assert something the page does not show, and
  only shop-visible products can reach the `ItemList` because only those are ever
  prefetched for the grid.
- **`llms.txt`** is one English file at the site root, generated at request time from the
  English catalog (the site description, the About prose, every FAQ question and answer
  flattened to plain text) so it cannot drift from the site, with absolute links to the
  promoted pages only and a section naming each indexed locale's home URL. It is
  publicly cacheable, which is why it is excluded from the proxy: a response the proxy
  handles may carry a refreshed session cookie, and a shared cache must never hold one.
- **Open Graph cards** are route handlers taking a locale parameter; the reasoning is in
  `src/lib/og/`.

## Baseline log

Re-run with the same queries when a discoverability change has had time to be crawled
(weeks, not days), and append a dated entry. A WebSearch tool's results are not a
personal Google results page — no personalisation, no location — so the numbers are
indicative and comparable with each other, not with what a parent in Espoo sees.

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
| a plain description of the product (supervised weekly Minecraft sessions with an adult educator) | — | Outschool, Common Sense Media |
| our own tagline as a query | — | parenting-advice publishers only |

What it says: brand terms are held but diluted, and the top brand slots belong to our own
social profiles rather than the site. Finnish-language Minecraft is the one commanding
position. Non-brand English is absent without exception; Swedish and French have no
presence at all. Third parties (the Finnish hobby-model programme site, Autismiliitto,
partner press) rank for our story more reliably than we do. Two open goals nobody has
claimed: Finnish Roblox camps, and "gaming as a coached hobby".

**Official profiles found** (owner to confirm before they become `sameAs`): Instagram
`sog_suomi`, Facebook `sogsuomi` and a second, unlinked Facebook page `sogversum`
("School of Gaming | Helsinki"), YouTube `@SchoolofGamingSuomi`, LinkedIn
`company/school-of-gaming`, the Eventbrite organiser page, Crunchbase, and the Finnish
company registries under business ID 3110461-1. No TikTok and no X account exist; the
Discord server is invite-only and has no public URL. A Google Business Profile could not
be confirmed either way.

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
- **Index listed, shop-visible product pages.** The single largest lever: the queries a
  parent actually types ("Minecraft club for kids Espoo", "Roblox summer camp") want a
  page about *that product* with dates, price, age range and location, which the browse
  grid cannot rank for and an AI assistant cannot cite. The tier-2 reasoning above keeps
  unlisted products and the whole `/schools` tree exactly where they are; the question is
  only whether a *listed* shop product's detail page moves to tier 1, with `Event` /
  `Course` structured data and a sitemap entry, and back to `noindex` the moment it is
  unlisted or ends. The "one static rule, no per-product read" argument no longer holds
  on its own — the card builder already reads the product row — so this is a product
  decision, not a cost one. Owner's call.
- **Topic landing pages** (`/minecraft`, `/roblox`, `/fortnite`, …) generated from the
  topics module: the existing "About {topic}" prose plus that topic's listed products.
  These are the pages both search and AI assistants cite for "who runs Minecraft clubs
  in Finland".
- **A factual paragraph on the home page** — what we are, where, for whom, in which
  languages. The hero plus four feature cards is thin for entity recognition.
- **Off-site signals**: Search Console and Bing Webmaster verification, a Google Business
  Profile, and `sameAs` links on the `Organization` schema once the official social
  profiles are confirmed.
- **Per-route Open Graph images** (deliberately left out of the locale-routing scope).
- **A per-locale `llms-full.txt`** mirroring About in each language, if the single
  English file proves too thin for non-English assistants.
