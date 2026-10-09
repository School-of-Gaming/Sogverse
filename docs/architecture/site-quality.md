# Site quality

Running topic for the public site as a prospective family meets it, in three parts: **can
it be found** (search engines, AI assistants, shared links), **does it look good and earn
trust**, and **does it convert** a visit into a booked club. Each part holds its rules and
its own open backlog; the baseline log at the end measures the first. Cross-cutting only —
the URL and locale machinery is `src/i18n/CLAUDE.md`, the social cards are `src/lib/og/`,
product visibility is `docs/architecture/products.md`, the chrome and the tab bar are
`src/components/layout/CLAUDE.md`, the photos and video are `src/assets/marketing/CLAUDE.md`,
and how copy sounds is the Brand Voice Guidebook in `packages/sog-ui/docs/guidebook/`.

**Standing goal: a parent who types what we do into a search engine or an AI assistant
finds us, in their language, on the first page; what they find is Sogverse, not the
legacy marketing site it is replacing; and on landing they understand what we offer
within eight seconds, know what to do within thirty, and trust us enough to enrol a
child.** Conversion to a paying club is the measure, not time on page.

**Rules for every public page:**

- **Every locale persuades its own audience.** English, Finnish, Swedish and French each
  get the same care, and a locale's copy is written to convince its own readers rather
  than translated from the English case, because what persuades differs by culture and
  country; which testimonials and proof lead may differ per locale too. Klingon is the
  easter-egg locale, supported where practical but not a market these pages persuade.
- **Nothing about the pages is fixed but the brand.** Structure, layout, which pages
  exist, copy, imagery, navigation and the shop's design may all change if it serves the
  goal. The one requirement is the brand guidelines (the Guidebook and SOG-UI). A
  guideline that is in the way is brought to the owner as a proposal (the rule, why it is
  in the way, the alternative), never worked around quietly, and an overruling is recorded
  where the rule lives, so the brand stays one system.
- **Every look-and-feel decision is judged at desktop and phone widths.** A layout,
  section order or visual that works on one and not the other is not done. The first
  screen is judged twice, because a phone shows far less of it before scrolling and the
  cookie banner covers more of it there. Capture with the `page-screenshots` skill's
  `public-pages` preset, which runs signed out and shoots each page with the banner up,
  after rejecting it, and whole.

## Found

Every public URL's place in front of crawlers: the posture (what may be found, what must
not be, and why) and the mechanisms that enforce it.

### The posture (as of 2026-09-10)

Every public URL sits in exactly one of three tiers, and **a new public page decides its
tier before it decides anything else.** The tier is what the crawler affordances below
key off.

1. **Promoted.** The marketing pages (home, about, the legal documents, attributions), the
   auth entry points, the `/shop` browse grid, the Team pages (the index and every
   public profile), the Library (the index and every live article), and every live
   landing page. In the sitemap, self-canonical with the full `hreflang` set, a
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
   slug address of the version it shows (the reader's, else English, else the first
   written), and its link card is its cover. Links to an article or a profile
   stay in the page's locale, as a shop card's do: the URL's locale is the site's, and a
   page showing fallback text is still a page in that locale, canonical to the version it
   shows (owner, 2026-10-01). The rules are in
   `src/services/library/CLAUDE.md`. **A landing page follows the same rule** (owner,
   2026-10-05), with two differences: its slug is stored per language rather than derived
   from the title, so no two pages contest one, and its link card is the site-wide one —
   the admin writes a title, a summary and a slug, and every other affordance is the
   system's. **A product's page is promoted while the product is
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
     admin's previews of a Library article and of a landing page, and every Klingon URL.
3. **Gated.** The role dashboards, settings and voice. Behind a login, disallowed in
   `robots.txt` for tidiness (the control is the proxy and RLS), and they carry no
   description of their own — the root's translated one is inherited and no crawler
   reads it.

**AI crawlers are allowed, deliberately** (owner decision, 2026-09-10): the point of the
work is to be found in AI answers as well as search results. The stance is written as
explicit named rules in `robots.txt` rather than left to the `*` default, so a future
edit cannot flip it without noticing.

### Mechanisms

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
  locales its person wrote, each live Library article and each live landing page in the
  locales it was written in, at its slug address there, and each product on the shop's
  listing in the locales its text was written in, at its shop address. **It reads the
  database, and is rendered per request**: the public team, the live articles, the live
  landing pages and the shop's listing are read anonymously with no cookies, so a
  profile made public or hidden, an article or a landing page published or unpublished,
  or a product listed, unlisted or ended, is in or out of the next fetch, and no build has to reach a database (a revalidating sitemap would be
  prerendered at build, in CI's smoke build and in a preview built before its migration
  ran). A failed read leaves those entries out rather than failing the file. **Only an
  article and a landing page carry a `lastmod`**, the time their live versions were published: for every
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
  not apply to it. Seven blocks exist: `Organization` + `WebSite` on every page from the
  locale layout, `FAQPage` on About, an `ItemList` on the shop, a `ProfilePage` about
  a `Person` on each team profile, whose `worksFor` names the layout's `Organization` by
  `@id`, an `Article` on each Library article, whose `publisher` names it the same
  way, a `WebPage` on each landing page, publisher the same, that becomes a `FAQPage`
  when a section asks questions — each section type declares its contribution in one
  exhaustive map, so a new type has to say what it adds, if only nothing — and on each
  promoted product page a `Course` for a club — one `CourseInstance`
  whose weekly `courseSchedule` is the club's slots in its own timezone — or an `Event`
  for a camp or an event, naming the `Organization` as provider or organizer. A product
  block states the price but never seats or availability: those are live, and a stale
  "available" in a search result is worse than none. A club whose page shows no short
  description emits no `Course`. Google retired its Course info rich result in 2025, so the
  `Course` serves other schema.org readers only; an `Event` still qualifies for Google's
  event results. An in-person `Event`'s address is the municipality the page names, because
  a site's street address is staff data and the page never shows it. **Rule: a structured
  data block reads the same source as the visible page** — the same message keys, the
  same prefetched rows — so it can never assert something the page does not show, and
  only the shop's listing can reach the `ItemList` because only that is ever prefetched
  for the grid. Each item carries its position, its name and its page's canonical
  URL — the address of the locale whose words that page shows at the shop's locale, so
  an item never points at a page that canonicalises elsewhere, while the card's own link
  stays at the shop's locale for the reader. Every one of those pages is promoted,
  because the items are exactly the listed products. It is omitted entirely when the
  grid has nothing to list, rather than emitted empty over a page the client is still
  filling.
- **`llms.txt`** is one English file at the site root, generated at request time from the
  English catalog (the site description, the About prose, every FAQ question and answer
  flattened to plain text) so it cannot drift from the site, with absolute links to the
  promoted pages only, a section listing every live Library article and one listing
  every live landing page (each read anonymously per request, each entry at the address
  an English reader is sent to, with its summary), and a section naming each indexed
  locale's home URL. It is
  publicly cacheable, which is why it is excluded from the proxy: a response the proxy
  handles may carry a refreshed session cookie, and a shared cache must never hold one.
- **Open Graph cards** are route handlers taking a locale parameter; the reasoning is in
  `src/lib/og/`. A team card's address carries a version so link previews refetch when
  the card would look different; the server does not check that version, by the owner's
  ruling, because forcing re-renders through it takes deliberate abuse with nothing to
  gain, so no guard is built.

### Open backlog: found

Ideas not yet decided or not yet built, in rough order of expected value. An item that
lands is deleted here and its mechanism is described above.

- **Overtake the legacy site.** `www.sog.gg` is the current front door and the legacy
  site; Sogverse is to adopt its content and features over time and `sog.gg` is
  eventually dropped entirely (owner, 2026-09-10). The near-term goal is that Sogverse
  draws more traffic than `sog.gg`, so families read this as the main site and the old one
  as legacy. Today the legacy site carries every non-brand ranking and this app none, so
  the ranking has to be *moved*, not just earned: each time Sogverse gains a page that
  supersedes a legacy one (a club, a location, a topic), the legacy URL should 301 to it,
  which is what carries the authority across; the `Organization` schema names this app as
  the brand's URL, never `www.sog.gg`. The rest of the estate goes the same way: the bare
  apex redirects to one host, the dead `sogverse-fi.sog.gg` sign-in page is removed from
  the index, and the `en.` / `lat.` / `start.` sites either redirect here or are current.
- **Topic landing pages** (`/minecraft`, `/roblox`, `/fortnite`, …) generated from the
  topics module: the existing "About {topic}" prose plus that topic's listed products.
  These are the pages both search and AI assistants cite for "who runs Minecraft clubs
  in Finland".
- **Off-site signals**: Search Console and Bing Webmaster verification, a Google Business
  Profile check, and fixing or replacing the legacy site's link to the dead Oulu Facebook
  page so the profiles it names agree with the `sameAs` here.
- **Check what only the live site can show.** Google's Rich Results Test on a team
  profile, a Library article and a product page; the Facebook and LinkedIn share
  debuggers, and a real WhatsApp and Slack paste, on a profile and an article; then submit
  the sitemap in Search Console and watch the pages index.
- **The pages link to one another through their calls to action.** A page's call to action
  may lead to a stable page — the Library index or a category, the Team, the shop — never to
  one article, which can be retitled or removed and leave a dead link. The navigation
  already reaches every public page on every page, so the footer does not repeat it
  (owner, 2026-10-01).
- **Per-route Open Graph images** for the promoted pages that still share the site card
  (team profiles and articles have their own).
- **Option: list the listed products in `llms.txt`**, each at its shop address with its
  one-line description, read anonymously per request as the live articles are. Not
  decided.
- **The `Organization` data could carry the address and the spoken languages**: today it
  states the country alone, while the home page's closing card names the Lauttasaari
  headquarters and every club language, the languages derived from the spoken-language
  enum by a shared helper in `src/lib/i18n/`. Reading the same sources keeps the data and
  the page in step.

A per-locale `llms.txt` was considered and declined (2026-09-10): discovery in another
language runs through that language's pages and the index they rank in, both of which
already exist per locale, and models translate the English file fluently.

## Looks good and earns trust

What a parent meets on Home, About, the shop, the Library and the Team pages, and what
makes them believe it.

### Who reads the public pages

Only prospective families read the home page: the proxy sends a signed-in reader from `/`
to their dashboard, and the logo and the phone's first tab mean the dashboard too, so the
home page never serves an existing customer and can be a pure sales page. About, the
shop, the Library and the Team are reachable signed in, and existing families use the
About FAQ as reference.

The reader is a parent: they love their child, are unsure gaming is good for them, and
often arrive carrying guilt or fresh from an argument about it. They want four things, in
this order: **their child is safe, something is being learned, they can stay involved
without becoming a gamer, and permission to stop feeling bad** (Guidebook `audience.md`).

### The rules that bind them

The copy rules come from the Guidebook (`channels.md` §8.1, `audience.md`,
`vocabulary.md`, `decision-log.md`), which holds the reasoning; they are listed here
because each has been broken on these pages or nearly was. The app-wide brand, vocabulary
and safety-copy rules in `src/CLAUDE.md` bind them too.

- **Order: plain-language hero, then the concrete facts, then the story.** The facts are
  who supervises, what it costs and how to start. Sogverse lore is the reward for reading,
  never the toll for entry.
- **Lore level 1.** Yty and the Yty-Elements do not appear; the same substance is
  presented as **Human Skills**: emotional intelligence, empathy, communication,
  collaboration, creativity, critical thinking, problem-solving.
- **Gedu is glossed, not dropped.** "Game Educator" on first mention, "Gedu" after. Never
  teacher, tutor, coach or instructor.
- **Club is the group, lesson is the session.** Never used interchangeably.
- **Screen time is transformed, never fought.** The tagline is the permitted construction;
  "cut down on screen time" or "a healthy alternative to screen time" is not.
- **Specifics reassure, slogans do not.** "Safe space" as a slogan is banned; say what is
  true: moderated, supervised, a Gedu is always present. Never fear-sell other platforms.
- **Price is "from €59 per month"**, never a single figure, because prices vary by club.
  **No page states a lesson length**, because it is set per club.
- **Lengths:** hero headline 4–9 words; hero subhead 15–30 words, one sentence a sceptical
  parent would repeat to their partner; section headings 3–7 words, questions allowed;
  body paragraphs 40–70 words.
- **Calls to action are verb-first, 2–4 words, and never "Learn more".**
- **The home page holds nothing that lives nowhere else.** A signed-in reader never
  reaches it, so each section is the short form of a page they can reach (About and its
  FAQ, the Team, the Library, the shop) and links to it. Before a section is added, name
  the page that holds its full version.
- **The criminal record check is claimed as a requirement, never as an outcome.** Every
  Gedu is required to show a criminal record extract before certification, but
  certification does not wait on the check, and older Gedus were certified before it was
  recorded. Likewise "nothing is recorded" is never claimed: no voice or video of a lesson
  is recorded, but session chat is kept for moderation.
- **The Library and Team index headers are written by hand and match** (headline centred,
  intro left-aligned). A shared header component waits for a third page of that shape.

### Media

Photos and video on the public pages are real people only, with consent for every
identifiable child and Gedu, test accounts in any screenshot, and a master at least
2400 px wide with room to crop both ways that works on the dark background. What is
placed, its clearance and how it is cut are in `src/assets/marketing/CLAUDE.md`. Team
portraits and Library covers are provided by the staff who write them, not by marketing.

### Testimonials

Parents' quotes are published **attributed by role and country only** ("Mom, Finland"),
never by name: every family consented to being quoted, and names are left out. The
source cards are two folders of 1080×1080 PNGs in the company Google Drive,
"Testimonials" (Finnish) and "Testimonials in English", card N in one translating card N
in the other; card 11 repeats card 3 and is not listed, English card 14 has no Finnish
twin. Several cards carry social-media names and handles that look invented and change
between languages; published as posts they would read as fabricated, so the site never
reproduces them. The Finnish below corrects two typos baked into the images ("joko
viikko" → "joka viikko", "rähjäämistö" → "rähjäämistä"). No card gives a child's age or a
date. The quotes on the site are the message keys grouped in `src/components/home/`; About
shows every quote the home page does, in full.

| # | English | Finnish | Attribution | Fits |
| --- | --- | --- | --- | --- |
| T1 | Our son's Finnish has become stronger thanks to the Minecraft club. I also recommend it to other expatriate Finnish families! | Poikamme suomen kieli on tullut Minecraft-kerhon ansiosta vahvemmaksi. Suosittelen myös muille ulkosuomalaisille perheille! | Mom, USA / Äiti, USA | Language |
| T2 | My daughter's Finnish has improved tremendously in just a month! The gaming educators have been very skilled, friendly, and patient. This really works! | Tyttäreni suomen kieli on kehittynyt kuukaudessa valtavasti! Pelikasvattajat ovat olleet tosi taitavia, ystävällisiä ja pitkämielisiä. Tämä teidän juttu todella toimii! | Mom, Norway / Äiti, Norja | Language |
| T3 | Large groups make our child anxious. This is the perfect way for us to engage in a hobby and make new friends. | Isot ryhmät jännittävät lastamme. Tämä on täydellinen tapa meille harrastaa ja tutustua uusiin kavereihin. | Mom, Finland / Äiti, Suomi | Small groups, neuroinclusive |
| T4 | The club is the highlight of my son's week. Every week, my quiet and shy boy transforms into a laughing, loudly chatting child when he gets to interact with like-minded kids. The club's content and the educators' expertise have pleasantly surprised me. | Kerho on pojan viikon kohokohta. Hiljaisesta ja arasta pojasta kuoriutuu joka viikko nauravainen ja kovaan ääneen höpöttävä lapsi, kun pääsee samanhenkisten lasten kanssa puuhailemaan. Kerhon sisältö ja kasvattajien osaaminen on yllättänyt minut todella positiivisesti. | Mom, Finland / Äiti, Suomi | Hero proof |
| T5 | Nothing else, no activity or hobby, has made my child sigh with happiness like this. | Mikään toinen asia, harrastus tai juttu ei ole saanut lastani huokailemaan sitä kuinka onnellinen on. | Mom, Finland / Äiti, Suomi | Hero proof |
| T6 | SoG clubs are the best! A direct answer to my child's wishes to learn coding and to create and maintain servers. | Sogin kerhot on parasta! Suora vastaus lapsen toiveisiin oppia koodaamaan ja tekemään ja ylläpitämään servuja. | Dad, Finland / Isä, Suomi (programming club) | Skills |
| T7 | Absolutely fantastic from a parent's perspective too. The child learned a lot, got to play safely and in good company, got excited, made new friends, and was speaking basic programming language fluently after just a few sessions. | Ihan huippu juttu näin vanhemman näkökulmastakin. Lapsi oppi valtavasti, sai pelata turvallisesti ja hyvässä seurassa, innostui, sai uusia ystäviä ja puhui jo muutaman kerran jälkeen sujuvasti ohjelmistokielen alkeita. | Dad, Finland / Isä, Suomi (programming club) | Skills |
| T8 | My child found like-minded friends through gaming. Parents are provided with appropriate and educational information about the activities and gaming education. The activities are developed with a focus on skills like emotional intelligence. A safe place for children to practice online gaming. Highly recommended. | Lapselle löytyi samanhenkistä seuraa pelien parissa. Toiminnasta ja pelikasvatuksesta jaetaan asiallista ja sivistävää tietoa vanhemmille. Toimintaa kehitetään esim. tunnetaitoihin panostaminen. Turvallinen paikka lapsille harjoitella verkkopelaamista. Suosittelen lämpimästi. | Mom, Finland / Äiti, Suomi | Parents involved |
| T9 | The camp was a solid 6/5 according to my son. A big thank you for the camp! | Fortnite-syyslomaleiri oli pojan mielestä ihan ?/5. Iso kiitos leiristä! | Mom, Finland / Äiti, Suomi | Camps |
| T10 | A really good setup! The kids get to do what they love and they get supported in it the right way. | Todella hyvä setti! Jengi tekee mitä rakastaa ja saa tukea siihen oikealla tavalla. | Dad, Finland / Isä, Suomi | General |
| T12 | School of Gaming has been a really positive experience for both the child and the parents. The children have had great gaming experiences with new friends in a safe gaming environment with experienced instructors - I can recommend it! | School of Gaming on ollut todella positiivinen kokemus sekä lapselle, että vanhemmille. Lapset ovat saaneet hienoja pelikokemuksia uusien pelikaverien kanssa turvallisessa peliympäristössä kokeneitten ohjaajien kanssa - voin suositella! | Dad, Finland / Isä, Suomi | General |
| T13 | Gaming is fun and supervised. No bullying, no arguing, or bad vibes. | Pelaaminen on hauskaa ja valvottua. Ei kiusaamista eikä rähjäämistä tai pahaa mieltä. | Mom, Finland / Äiti, Suomi | Safety |
| T14 | A really good first touch with the world of gaming and online communities. SoG's rules and values give us parents a feeling of trust! | — | Mom, Finland (Minecraft club) | Safety |

**T9 is unusable until fixed:** the Finnish card says a Fortnite camp in the autumn break
and has lost its rating digit to a missing glyph; the English card says a summer camp and
6/5. Which is right needs the source.

### The Team page

**Admin approval is all a profile needs to go public**: a Gedu on the platform has
already agreed to it, and the profile's "ready" checkbox says only that the profile is
ready. **Every approved profile is listed, trainee Gedus included.** A Gedu is shown by
first name and nickname; leadership by full name and title.

### Open backlog: looks good

Findings and ideas not yet acted on. The page findings come from a review of production on
2026-09-25 (desktop 1440×900, phone 390×844, English and Finnish), updated for what the
home page has gained since; About's were re-checked against the source on 2026-10-01.
Re-check before building on one.

- **Media still to come from Sonja (marketing):** a lesson in action, a Gedu greeting the
  group in a voice room with the Gedu's character in view, which would earn its own
  framed place further down the home page while the "Calm" loop stays the hero's
  background; a parent and child at the screen; one image per club category, staged with
  in-game characters, including a better Fortnite round than the sword fight already
  delivered and real camp imagery for the placeholder; the studio photo reshot in the new
  office; a higher-resolution team photo than the 675 px one placed; in time a
  higher-resolution export of the hero loop for wide and ultrawide monitors (not urgent).
  Her answer is also pending on whether the legacy site's YouTube video still shows how
  lessons run today, and whether its photos of children are AI-generated. Already
  delivered and not yet placed (masters on the owner's machine): the loop's 1920×1080
  still and category stills for Roblox Studio, Fortnite and camps. A sample session
  report is ours to capture from a staging test account.
- **Native Swedish and French checks** of the strings the public pages added, and a
  persuasion review of the Finnish, Swedish and French pages; the review above read only
  English. The Swedish and French quotes were translated from the English cards, not the
  Finnish originals.
- **Testimonials:** resolve T9 from its source, and ask for each child's age where it can
  still be had.
- **A headline number cleared to publish** (customers, municipalities). The legacy site
  claimed 100 municipalities and 250 schools; no figure is cleared.
- **The cookie banner's phone footprint.** On 2026-09-25 (production, first visit) it
  covered 17% of a desktop screen (20% in Finnish) and 43% of a phone screen (48% in
  Finnish), hiding everything under the home hero's button. Re-pull with the
  `page-screenshots` preset before acting; the figures were taken at 390 px, not the
  repo's 360. A layout change (spacing, type size, Reject all and Accept all compact but
  equally weighted) is safe; rewording is not, because a change to what the visitor agrees to is
  a consent-version bump that asks everyone again (`src/components/consent/CLAUDE.md`).
- **Home:** no lesson is shown (the loop is a game build, the safety photo a room); the
  differentiators (neuroinclusive clubs, language immersion, Fortnite esports, Roblox
  game-making, in person in Lauttasaari) are still only shop listings; "designed to build
  real skills" never names the skills; the hero has no route to About. Not re-measured
  since the media landed.
- **About:** the FAQ is precise rather than persuasive (no answer leads with the
  reassurance before the mechanism) and opens with "What is Sogverse?" and "Is this
  school?" while cost, cancelling, vetting and "can strangers talk to my child?" come
  later; the Princi-Pal quote greets a new visitor with a character they have not met; Yty
  is presented at full lore, against level 1; the hero repeats the home page's tagline;
  on desktop the four value cards are unequal, leaving "Family in the loop" half empty.
- **Shop:** it opens straight into the grid with no line on what a club is, what every
  club includes or the guarantee; near-duplicates dominate ("Minecraft: Cozy Adventures"
  repeats with one image and description, varying by age, day and language); an
  immersion card shows a large UK flag beside an FI badge, the badge being the lesson
  language; the filter panel has twelve groups and about 25 chips, several in internal
  vocabulary (Creator Studio, Game Studio, AI, "For parents" versus "For families"); the
  nav says "Shop" where the agreed parent-facing word is "Clubs". The Guidebook's target
  naming is for what a parent searches: Clubs, Camps, For parents, How it works, About
  (Finnish: Kerhot, Leirit, Opas vanhemmille, —, Meistä), against today's Shop,
  Library, Team, About.
- **Every Finnish headline checked at phone width**: long compounds run off the edge, as
  they do on the legacy site.
- **The app's vocabulary for the weekly meeting.** The app's dashboards say "session"
  where SOG-UI's guidebook vocabulary says "lesson": the club is the group, the lesson is
  the weekly meeting, and there is no third word. The public pages were aligned on
  2026-10-01; the app was not.
- **The Team on the other pages.** Proposed: a "Meet the Game Educators" strip on the
  home page; later, "Meet your Gedu" on a club page, read from the Gedus assigned to its
  group.
- **Light or dark.** SOG-UI has one theme, dark. The Guidebook says parent-facing pages
  take "white and off-white grounds… Calm surfaces carry credibility", and the legacy
  site is light. For light: a parent judging whether to trust us with a child reads calm
  and light as a service, dark and neon as a game; these pages are read at length on
  phones; photography sits warmer on light. For dark: children sway the purchase, in-game
  art shines on it, it is distinctive, and one theme is cheaper to keep correct. If light,
  the boundary is parent versus child, never page by page (the parent side light, the
  child and Gedu side dark, switching at "switch to my child"), which is a SOG-UI
  decision. A cheaper middle path: stay dark but calmer on the public pages. Proposed:
  settle it with light and dark mock-ups of the home page shown to a handful of real
  parents in two locales.
- **Credit testimonials with context** ("Mum of a Roblox club gamer, Finland") where the
  source card gives it; the legacy site's "Mom of a Minecraft gamer" read stronger than
  role and country alone.

## Converts

The path from a public page to a booked club, and what moves a parent along it.

### The path

Every public page asks for one thing: **"Find a club"**, which opens the shop unfiltered,
the same for every reader signed in or not; clubs lead the list, and camps and events
follow without touching a filter. The home page opens and closes on that button, each
time with the risk reversal directly under it: cancel any time at no cost, and a 30-day
money-back guarantee with no form and no reason required. From the shop a parent opens a
club's page, signs up or signs in, adds a child and pays; the sale happens on that last
stretch.

**What we know:** the guarantee is the strongest risk reversal we have, and the legacy
site put it second on the page under its own heading; the legacy site closed almost every
section with a call to action; About is a dead end today, with no call to action anywhere,
so a parent the FAQ convinced has to find the shop in the navigation. **What is open:** no
part of the path has been measured as a funnel, and the club page, signup, adding a child
and paying have not been reviewed at either width. Sogverse offers the guarantee, not a
free trial, and no page promises a trial until the owner decides on one.

### Open backlog: converts

- **Review the shop's club page and the enrolment path at both widths** — the product
  detail page, the enrolment panel, signup, adding a child, paying. It touches auth and
  money, so any change gets a plan.
- **About gets a way forward**: a button to Clubs, and the FAQ ordered by what parents ask
  first.
- **The first screen starts the choice.** Proposed: "How old is your child?" as age
  buttons, each opening the shop filtered to fitting clubs. The shop keeps its filters in
  the URL; whether age can be set from a link is unchecked.
- **The shop becomes "Clubs" and is restructured.** Proposed: one card per club with its
  times as choices; curated rows above the full grid by what a parent needs (shy or
  neurodivergent children, a language, building and coding, esports, in person in
  Helsinki); a strip saying what every club includes, with the guarantee. Unchecked:
  whether grouping can be done in the display or needs a data change, since each listing
  is its own product.
- **About splits into "For parents" and a short "About"**, matching the Guidebook's nav.
  Proposed: For parents holds safety, what a lesson is, the report afterwards, parent
  game education, the FAQ ordered by worry and a button to Clubs; About holds who we are,
  the Gedus and the mission. Yty leaves the public pages or appears only as Human Skills.
- **Keep the parent who is not ready today.** The legacy site offered free parent
  webinars and a weekly newsletter; Sogverse has neither, so an undecided parent is lost.
  Whether we have a mailing list or a sending setup to build on is unchecked.
- **Offers the public pages do not show yet:** birthday parties in Minecraft, which the
  legacy site bannered and the Guidebook's Finnish nav names (*Syntymäpäivät*).

## Owner to decide

- **The job of each page.** Proposed: Home persuades (hook, proof, the offer, risk
  reversal, one call to action, every claim one short line backed by one fact and linking
  to the About answer that proves it); About is the reference a careful parent checks a
  claim against; the shop helps a parent choose the right club fast. It corrects home
  making general claims while About holds the proof as reference text.
- **The home page structure.** Proposed, in Guidebook order: the hero; T4 as the emotional
  proof; what a lesson is (the Gedu greets the group, a story-driven adventure over voice,
  a written report afterwards); what they grow (the Human Skills, with T6 and T7); safety
  you can check (with T13 and T12); find the right club (tiles for neuroinclusive and
  small groups, language, programming and game-making, in person, camps, each opening a
  filtered shop); you stay involved (reports with photos, parent game education, T8); more
  parents; short answers to four questions (equipment, cost, safety, "isn't this more
  screen time?") linking to the FAQ; a closing call to action with the price and the
  guarantee.
- **"How it works", step 1** is still "Create your account", though every button leads
  to the shop first. Proposed: pick a club first.
- **A free trial.** The legacy Finnish page promised one; Sogverse has the guarantee only.
- **Whether certification waits on the criminal record check** — a safeguarding change,
  with an audit of the Gedus certified before the check was recorded.
- **Municipality clubs on the home page.** Proposed: no, leave them to the header and the
  FAQ, since the goal is paying families.
- **Which audience each locale serves**: Swedish for Swedish-speaking Finns or families in
  Sweden; French for France or francophone families elsewhere. How a locale persuades
  depends on the answer.

## Baseline log

Re-run with the same queries when a change to how we are found has had time to be crawled
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

