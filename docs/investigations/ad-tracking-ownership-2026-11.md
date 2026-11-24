# Ad tracking: who owns it, and how to stop it costing engineering time

**Status: open, nothing decided. Researched 2026-11-24.** Vendor behaviour (Meta, Reddit,
Google, GTM) and the dashboard figures age fastest. Re-check them before acting. Code
claims describe `dev` at that date. The full reasoning behind this doc, including the
comparison with standard practice and every race checked, is in
`ad-tracking-ownership-2026-11-review.md`.

## The question

Every problem the ad team (the Lynx agency) and the admins hit with tracking comes back to
the owner as a code change. About 80 commits touched consent, GTM, the pixels and the
conversion reports between 3 September and 6 November 2026. In that time the pixels moved
three times, and almost every change was followed by fixes for a stale-address or ordering
leak. The question is how to build this so that it stays fixed. The trigger was a browser-id
timing gap on Meta's server reports, but the answer has to cover the whole system.

## Goals (the owner's)

1. **Children's privacy first.** Nothing from a gamer's session, nothing about a child.
2. **Adults are treated as informed, consenting adults.** Follow the law and normal web
   practice for ads and tracking, not stricter rules we chose for ourselves.
3. **Vendors are set up the way they are designed to be used.**
4. **The least ongoing engineering time.** The ad team and admins add, change, debug and
   verify tracking themselves. Engineering owns something they can build on, and isn't
   interrupted.
5. **No paid third-party service, and no new infrastructure to run.** Vercel, Supabase,
   and the free tiers of GTM and the vendors' own tools are fine.

Goal 4 was stated after the first round of research, and it changed the recommendation. The
first round optimised for the least code and the fewest outside dependencies, so it
recommended that the app own the pixels outright. Under goal 4 that is the wrong answer,
because it makes every tracking change a code change. Option C below is the answer to goal 4.

## The four rules the law and terms actually require

These hold under every option. Everything else in the current system is a choice.

| Rule | Source |
|---|---|
| No ad cookie, tag or server report before marketing consent; reject at the first level; withdrawal as easy as consent | Finland's Act on Electronic Communications Services s.205 and Traficom's cookie guidance; GDPR Art. 7(3); Meta Business Tools Terms (EU cookie consent) |
| Nothing from a child's session and nothing about a child | Finnish Data Protection Act 1050/2018 s.5 (13 years); GDPR Recital 38; Meta Business Tools Terms s.1.h (no data from or about under-13s) |
| Ad platforms see only public marketing-page addresses, never token or child-id URLs | GDPR Art. 5(1)(c) and Art. 32; ordinary security |
| Only a consenting parent's own identifiers, hashed | Meta Business Tools Terms s.1.a; GDPR Art. 13 (name recipients and purposes) |

Server-side reports need the same consent as the pixel, because they read device cookies and
send personal data for advertising (EDPB Guidelines 2/2023 on ePrivacy Art. 5(3)). These are
an engineer's readings of public sources, not counsel's.

## How it works today, in brief

The full architecture is in `src/components/consent/CLAUDE.md`. In outline:

- **Consent.** One first-party consent cookie with two purposes. Marketing covers everything
  advertising, including Google Analytics. Withdrawing deletes vendor cookies and reloads
  the page.
- **Browser.** After consent, on about ten marketing page templates, never for a signed-in
  gamer, and only when every query key is on an allowlist, the app loads a GTM container
  that the agency edits. Since 3 November the Meta and Reddit pixels run inside that
  container as gallery templates. The app fences the container with:
  - an allowlist and a blocklist (no Custom HTML, no automatic triggers);
  - a template permission policy pinned to specific template versions;
  - its own replacement `fbq`/`rdt` globals, which hold vendor calls and drop any whose page
    has changed.

  These fences exist because the container shares one single-page document with private
  pages, whose addresses can carry a child's id or a single-use token.
- **Server.** Committed outcomes are reported from the route that commits them: lead,
  child added, free enrolment, waitlist place. Page view, product view and checkout start
  get a server "twin", posted by the browser right after its data-layer push, with the same
  event id so the vendors deduplicate the pair. Every server report re-checks consent from
  the request's own cookie.
- **Privacy policy** (`messages/*/privacy.json`). It names the three platforms and lists,
  field by field, what each event carries. Hashed email and account id are promised only
  "when you create an account or sign up" and when adding a child.

### Already done on 2026-11-24

- The GTM tags were renamed to say what they send and that they have a server twin. Each
  tag has a note explaining the setup and what not to change: version 6 of container
  GTM-5WS8TXL4, live.
- The agency (Lynx) was told nothing needed deleting or rebuilding, with a note to forward to
  Reddit's ads team.
- Issue School-of-Gaming/Sogverse#173 (server-side GTM) was closed: see option D.

## Evidence

Taken 2026-11-24 from Meta Events Manager (pixel 1031310927289741, business 535264690656973)
and Reddit Events Manager (pixel a2_jxpekcqne5h2). Re-pull them from each Events Manager's
overview, diagnostics and event match quality pages.

| Measure | Value | Evidence for |
|---|---|---|
| Meta: share of server events carrying `_fbp` | PageView 60%, ViewContent 53.6%, InitiateCheckout / Lead / CompleteRegistration 100% | The browser-id timing gap |
| Meta: event match quality | PageView 5.6, ViewContent 5.5, InitiateCheckout 6.1, CompleteRegistration / Lead / ChildProfileCreated 7.7 | What identifiers on page events would buy |
| Meta: Conversions API's extra conversions over pixel alone, ViewContent | +110% | Unexplained, see open questions |
| Meta diagnostic | "Set up manual advanced matching", detected 24 Nov, the only one | The advanced-matching decision |
| Reddit, 17–23 Nov, Page Visit | CAPI 1,415, pixel 1,301, unique 1,455 | Deduplication works; the pixel delivers about 92% of page visits |
| Reddit match quality | About 4.6–4.8 | Same gap as Meta's page events |
| Reddit diagnostics | Clean | — |

## Diagnosis

Most of this problem is ordinary, and Sogverse solves those parts the ordinary way: an
opt-in banner, Google's basic consent mode, pixel plus Conversions API with shared event ids,
hashed identifiers, and a server re-check of every gate.

What's unusual is that one single-page document holds both public marketing pages and
private pages whose addresses carry a child's id or a token. Most sites keep a separate
marketing site, so the problem never arises. Shopify solved the same problem by isolation:
third-party pixels run in a sandbox and receive fixed events, never the page itself.

Sogverse instead let a container edited by a third party, with no review, into that shared
document and fenced it at runtime. The fences cost a lot:

- About 1,500 lines of code, plus about 5,000 lines of tests.
- Reddit's tag is made to fail on purpose; GTM shows it as "Failed".
- Meta's parameter builder is refused.
- GTM Preview cannot work, because its debug parameters are not on the query allowlist.
- The replacement globals depend on undocumented vendor internals, and break silently if a
  vendor changes them.
- One gap is admitted and can't be closed: Meta's library can replay queued calls against a
  later page.

The agency is handed something that looks like a normal GTM container but isn't one. Its
misreading of the setup was the predictable result.

Two amplifiers sit on top:
- **Field-level policy wording.** Every new field is a legal edit in every locale. The law
  asks for categories of data, recipients and purposes.
- **Identifier cookies set on the vendors' schedule.** The server reads whatever happens to
  exist when its request arrives.

## Findings that hold under any option

1. **Paid sign-ups are never reported as conversions.** Only a free enrolment and a waitlist
   place send `CompleteRegistration`. Nothing is reported on the Stripe path, and no
   `Purchase` event exists. Neither platform can optimise for paying families. This is the
   largest gap.
2. **The browser-id timing gap is real, for Meta and Reddit.**
   - The browser pushes the event and posts the server twin in the same tick. On a first
     page view, the vendor library hasn't loaded yet, so its cookie (`_fbp`, `_rdt_uuid`)
     doesn't exist.
   - Reddit's library is requested only on the first `rdt()` call, so it lags too.
   - The impact is smaller than the percentage suggests where the browser copy also arrives,
     because that copy carries the id.
3. **Server twins depend on the container having loaded.** When a blocker stops GTM,
   neither copy is sent. That defeats the main reason the twins exist.
4. **The query allowlist refuses the whole page on any unknown key.** Google Ads' `gbraid`,
   `wbraid`, `gad_source` and `gad_campaignid`, plus `utm_id`, `msclkid`, `ttclid` and
   Klaviyo's `_kx`, are missing. A landing that carries any of them gets no tags and no
   report for any platform, silently. Whether live ad links carry them hasn't been checked.
5. **Page events carry no parent identifier, even for a signed-in, consenting parent.**
   - It protects little: the lead event carries the same `_fbp` with the hashed email, so
     Meta can already join that browser's page views to the parent.
   - It is why match quality on page events is lower, and why Meta raises the "manual
     advanced matching" diagnostic.
6. **Consent withdrawn in another tab** doesn't reach a tab with a running container until
   that tab loads a new page. Server reports stop at once.
7. **GA4's enhanced-measurement switch** lives in a GA web form that no code checks. If
   switched on, GA would report client navigations by itself.

## Options for who owns tracking

| | A. App owns the pixels | B. Fenced container, made legible | C. Container for signed-out visitors only | D. Server-side GTM |
|---|---|---|---|---|
| In short | The app loads Meta's and Reddit's libraries and fires their events itself; GTM keeps Google's tags | Today's setup, plus vendor event names and pixel id pushed from code, GTM Preview allowed, the container exported to the repo | GTM runs only where nobody is signed in and only marketing pages are shown; most fences go | Browser sends to a tagging server; marketing maps it to vendors |
| Who changes tracking | Engineering | The agency, inside the fences | The agency and admins, with ordinary GTM | Marketing, in the server container |
| Engineering time over the years | Highest: every request is code | High: anything the fence blocks comes back | Low: gates, event list, server reports, approved platforms | Low on mapping, plus running a server |
| Code removed | The template policy, the stub interplay, the agency constraint list | Little | The replacement globals, most fences, the failing Reddit tag | Little; the browser gates stay |
| Vendor tools (Preview, Events Manager settings) | Partly | Preview only | Yes | Lost in the browser for platforms moved fully server-side |
| Infrastructure or money | None | None | None new; one Vercel function call per page event | A tagging-server container outside Vercel (Cloud Run or Stape). Ruled out by goal 5 |
| Fits the goals | Fails goal 4 | Weak on 3 and 4 | Fits all five, if signed-in parents are measured by the server only | Fails goal 5 |

**Option D is closed.** Google's tagging server is a long-running Docker image, plus a preview
server. Vercel functions can't run it. Cloud Run's free tier might cover our traffic with no
instance kept running, but it would still be new infrastructure to set up, monitor and fix.
Issue #173 was closed for this reason.

**The lean is option C.**

### Option C in detail

**The rule:** the tag manager runs only in a document where nobody is signed in, and that
document only ever shows public marketing pages. Three of the four required rules are then
held by where the container runs, not by limiting what it may do.

How the rule is enforced:
1. **Signed-out gate.** The browser gate changes from "not a gamer" to "nobody signed in".
   - Sign-in, sign-out and account switches already force a full page load, so a container
     can never be carried into a signed-in document.
   - The gamer check then disappears on the browser side.
   - The policy promise becomes stronger: "never while anyone is signed in".
2. **Navigation boundary.** All in-app links and router navigation go through
   `src/i18n/navigation.tsx`; nothing in `src/` imports `next/link` directly (checked
   2026-11-24). For a signed-out visitor, that module makes any navigation that crosses
   between a reportable marketing address and anything else a full page load. A document is
   then all marketing pages or none.
   - `/login?redirect=<private path>` counts as "anything else".
   - The fallback, if this is not clean, is separate root layouts for marketing pages, where
     Next.js reloads the page whenever navigation crosses between root layouts. That needs
     a spike: it hasn't been checked against the `[locale]` tree and its providers.
3. **Consent** is unchanged, in the browser and on every server report.
4. **Approved platforms stay a list in code**, with their hosts. A new vendor is a new
   recipient of personal data, which the privacy policy must name. The list drives the CSP,
   the cookie sweep on withdrawal and the policy's vendor list.

**Child data, checked:** on a product page, only a signed-in parent can add a child; the
sign-up panel refuses it otherwise. So the only form data a signed-out marketing page ever
holds is the parent's own email and name. That is why automatic triggers, and even Meta's
automatic advanced matching, become acceptable under C. Today they are not: the container
runs for signed-in parents, on the page where a child's name is typed.

**What the ad team and admins could do without an engineer:**
- Add, change, pause and remove tags for any approved platform, with every trigger type.
- Debug with GTM Preview and Tag Assistant, and roll back with GTM's versions.
- Use the vendors' libraries and Events Manager settings as shipped, including tracking
  single-page navigation.
- Use manual advanced matching and Google enhanced conversions, fed by the hashed email and
  account id the app pushes to the data layer at sign-up.
- Use a new admin "Ad tracking" page, built on data in Supabase:
  - **Health:** per day, event and platform: reports sent, accepted, and refused with the
    vendor's error text; how many carried a browser id, click id or hashed email; and how
    many were stopped by a gate, and why. Counts only, no personal data, which keeps the
    policy's promise that we store no IP or browser details. Today this exists only in
    Vercel's logs.
  - **Test mode:** an admin pastes Meta's and Reddit's test codes and opens a link in a
    private window. Their own visit then shows live in the vendors' test screens. Today
    these codes are environment variables only an engineer can set.
  - **Link parameters:** the editable list of query keys that may travel. `redirect` stays
    judged by its value, in code.
  - **Platforms:** an on/off switch per approved vendor, which also renders the policy's list
    of advertising platforms.

**What engineering still owns, and how often it changes:**

| Owned | Expected change |
|---|---|
| The gates: consent, signed-out, the marketing-page list | A new kind of public page; a few times a year |
| The event list and what each event carries | A new step worth measuring; a few times a year |
| The server reports to Meta, Reddit and Google | Vendor API version bumps |
| The list of approved platforms | A platform not yet on it: hosts, policy wording, and a server reporter if wanted; about once a year |
| Secrets | Rotation |

The ad team still needs an engineer for:
- anything on a signed-in page;
- a fact the events don't carry;
- a platform not on the list;
- custom HTML or JavaScript tags;
- a vendor moving its script to a new host;
- a vendor refusing reports for a reason on our side.

The estimate is a handful of requests a year. That is a judgment, not a measurement.

**What the server does:**
- Reports every event whether or not the container loaded (subject to decision 4).
- For signed-in, consenting parents, reports page view, product view and checkout start
  server-only, with the hashed identifiers.
- Reports the purchase.
- Sends signed-in steps to Google Analytics through its free Measurement Protocol. Events
  with no `_ga` cookie are skipped.
- Pushes each vendor's event name to the data layer from the same table the server uses, so
  the browser and server copies can't drift apart because of a typo in a web form.

**Cost:** about three weeks for one engineer, estimated from reading the code. It comes in
three stages, each useful on its own:
1. **Hand over the container.** The gate, the boundary, unblocking triggers, deleting the
   replacement globals, allowing Preview, widening the parameters, pushing the hashes. The
   agency then rebuilds the container once.
2. **Complete the server.** Twins that don't depend on the container, browser ids, signed-in
   page events, the purchase, the GA relay.
3. **The admin page.**

The navigation boundary is the least certain part.

**Removed:**
- the replacement vendor globals and their tests;
- the page pin, trigger blocklist and address-bar re-checks in the GTM loader;
- most of the template policy;
- Reddit's deliberately failing tag;
- the `_fbc` "later of two clicks" comparison;
- most of the ten agency constraints in `src/components/consent/CLAUDE.md`.

**What would change the lean:** a real need for browser tags on signed-in pages, which would
bring the fences and the engineering dependency back for those pages. No such need is known.

## Building blocks every option needs

### The browser id on server reports

Two ways to fix the timing gap:

| | Wait for the cookies | Create the ids ourselves |
|---|---|---|
| How | Hold each twin until the vendor's cookie exists, sending it anyway when the page is hidden or after a few seconds | When marketing consent exists, set `_fbp` (and `_fbc` from a landing `fbclid`) in Meta's documented format, from the server and from the banner's accept handler |
| Covers | Meta and Reddit | Meta only; Reddit has no documented format for `_rdt_uuid` |
| Relies on | Documented behaviour only | Meta's library reusing an existing `_fbp`. Its docs say it creates one "if one does not already exist", and its Parameter Builder does the same server-side; Meta also says "do not override or adjust" the cookie |
| Leaves | Visitors who leave before the scripts load; browsers that block the vendor library never get the cookie | Nothing for Meta; a server-set cookie also escapes Safari's 7-day cap on cookies set by scripts |
| Also | A timer racing the library | Retires the `_fbc` precedence logic, because the browser and server then send the same value |

Before relying on creating the ids, ask the Meta rep to confirm, and ask Reddit whether
`_rdt_uuid` may be set by the advertiser. A hybrid works too: create Meta's ids, wait for
Reddit's.

### The others

- **Twins independent of the container.** One app function per tracked moment mints the event
  id, always posts the server copy, and pushes to the browser only if a container is there.
- **Purchase report.** Sent when the parent returns from Stripe to the confirmation page. That
  request carries consent, cookies, IP and user agent, so nothing has to be stored.
  - Its event id is derived from the participation, so a reload doesn't double count.
  - It misses a parent who pays and closes the tab before the redirect.
  - For the agency and owner to decide: should a paid seat also send `CompleteRegistration`?
    Today that event means "free seat or waitlist place" only.
- **Hashes on page events for signed-in, consenting parents**, server side. This raises match
  quality. Clearing Meta's diagnostic as well needs the hashes on the browser pixel.
- **Widen the query allowlist** with the standard ad and email parameters, and make refusals
  visible in the health counts. First check real landing URLs, in Vercel's request log, for
  the keys being refused.
- **Cross-tab withdrawal.** Re-read the consent cookie when a tab becomes visible, and reload
  if marketing has been withdrawn.
- **IPv6.** Meta suggests sending IPv6. The server sends the first forwarded address. Whether
  Vercel ever passes IPv6 is unknown. Meta's own fix calls a third-party "what is my IP"
  service from the browser, which would be a new recipient. The gain is marginal.

## Timing and ordering

What happens now, and what holds it under the lean. The ordering inside the GTM loader is
already sound. The open races all come from code outside ours acting on its own schedule
inside a document we share with it.

| Race | Now | Under C |
|---|---|---|
| Consent defaults must reach Google before its tags run | Pushed in a fixed order before the script loads | Unchanged |
| Consent given while a page is open | Gates re-run; the click id is saved from the landing | Also create ids, if that's chosen |
| Click id gone from the address bar before consent | Kept in a first-party attribution cookie; the server falls back to it | Unchanged; writing `_fbc` ourselves aligns the browser too |
| Consent withdrawn while scripts run | Cookies swept, then a reload; a check on every new page cleans up afterwards | Unchanged |
| Consent withdrawn in another tab | Unhandled until that tab reloads | Re-check when the tab becomes visible |
| Container or vendor library still loading when the visitor navigates | Address bar re-read after each wait; replacement globals hold and drop calls | The navigation boundary makes the worst case "another marketing page" |
| Meta replays queued calls against a later page | Admitted hole | Closed by the boundary |
| Vendors auto-reporting client navigation | Meta's history tracking pinned off; triggers blocked; GA setting in a web form | Allowed in a marketing-only document |
| Twin sent before the vendor cookie exists | Unhandled | Create ids or wait (above) |
| Container blocked | No twin either | Server copy always sent (decision 4) |
| Page closed before an event is sent | `keepalive` on twins; browser copies may be lost | Unchanged: this is what server copies are for |
| Browser and server copies deduplicated | Shared event id; event name and pixel id typed by hand in GTM | Names pushed from code |
| Server report fails | One attempt, logged; no retry, because retrying would mean storing IP and cookies | Unchanged; failures counted on the health page |

## Meta's "manual advanced matching" diagnostic

This is the advanced-matching rule showing up in Meta's dashboard, not a fault.
- The hashed email is already sent at account creation, sign-up and child added, so Meta can
  link a browser's later page views to the parent through `_fbp`.
- Turning advanced matching on would add the hash to every browser event. Sending a phone
  number would be new data: none is sent today.
- A hashed email is personal data under GDPR.

A Slack message to Mikko (CEO), asking him to keep it off or overrule, was drafted. It wasn't
sent because it overstated what Meta can't see today. Under option C, the app pushes the
hashes to the data layer at sign-up, where the agency's tag can use them for advanced
matching, and signed-in parents' page events go server-only with the hashes. So this
decision folds into decision 5 below. Mark the diagnostic as ignored in Events Manager only
once that decision is made.

## Decisions for the owner

1. **Which option.** The lean is C.
2. **Under C, measure signed-in parents by the server only.** The design rests on this.
3. **Under C, keep custom HTML and custom JavaScript tags blocked.** Otherwise whoever can
   publish the container can run code on the login and register pages, where passwords are
   typed. This is the one fence worth keeping.
4. **Send server reports for consenting visitors whose blocker stopped GTM?** It's legal
   after a banner yes, and standard practice. But a blocker is arguably a second, contrary
   preference. Today the code half-honours it by accident.
5. **Hashed identifiers on page events for signed-in parents**, and advanced matching on the
   pixel. This needs a policy edit and is Mikko's call.
6. **Who may publish the container**, with two-step sign-in on those Google accounts.
7. **Privacy policy edits**, ideally with counsel:
   - category-level wording instead of field-level;
   - "never while anyone is signed in";
   - hashes on page events;
   - the purchase;
   - ids we create, if chosen;
   - one sentence on the platforms' scripts reading the parent's own email typed on our
     sign-up form, if automatic matching is switched on.

   By the rule in `src/lib/consent.ts`, none of this needs the banner to ask again: the
   question asked is unchanged.
8. **How the browser id is fixed:** wait, create, or both.

## Open questions

- Why Meta shows +110% from server events on ViewContent. A general blocker effect that size
  is unlikely given Reddit's 92% pixel delivery. Compare browser and server ViewContent
  counts in Events Manager.
- Whether Meta formally permits creating `_fbp` ourselves, and whether Reddit accepts an
  `_rdt_uuid` we create.
- Whether live ad links carry query keys the allowlist refuses.
- Whether the navigation boundary is clean in this app, or separate root layouts are needed.
- Whether Vercel passes IPv6 client addresses.
- The container's actual contents beyond the tags: the enhanced-measurement switch in GA, and
  the ecommerce box on the Meta template.
- Keeping click ids still lacks its own legal review (noted in
  `src/components/consent/CLAUDE.md`).
- How many visitors block GTM. No data has been read.
