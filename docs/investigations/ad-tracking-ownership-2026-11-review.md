# Ad tracking: the independent design review behind the investigation

**Status: open, nothing decided. Written 2026-11-24 by a separate review agent, kept as written.**
This is the supporting research for `ad-tracking-ownership-2026-11.md`, which holds the
options, the lean and the decisions; read that first. Section A answers the owner's
follow-up on engineering time, and supersedes section 3.4 and the order of work in section 7.

File and line references point at commit `6c58db658` on `dev` (`git show 6c58db658:<path>`),
the code the review read. They won't match later code. One claim was checked since: on a
product page, only a signed-in parent can add a child, which section A.2 relies on.

## A. Answer to the owner's follow-up (added after the first report; supersedes section 3.4 and the order in section 7)

### A.1 The worry first: why the two answers pointed in opposite directions

My first recommendation, "the app owns the pixels again", **does not hold under your goal. I withdraw it.**

It was the answer to a different question. I optimised for the least code and the fewest things outside the repository that can break it. Under that objective, pulling the pixels into code is right: the fences go away because nothing unreviewed is left to fence. But it makes engineering the only place a tracking change can be made, so every request from the ad team becomes a code change. That is precisely the cost you want to stop paying. You did not get two conflicting answers to one question; you got one answer to "least code" and you are asking "least engineering time, with the ad team able to help themselves". Those have different answers, and I should have asked which you meant before recommending.

What still stands from the first report, under either goal:

- the four constraints (marketing consent; nothing from gamers or about children; ad platforms see only public marketing-page addresses; only a consenting parent's own hashed identifiers);
- the diagnosis: the cost comes from a third-party-edited container sharing a document with private pages and private data, not from the constraints;
- the server-side fixes (identifiers created by us at consent, server reports that do not depend on the container, a purchase report).

What changes: neither option I gave in 3.4 is the answer. Option A takes the tool away from the ad team. Option B leaves them a fenced container, where anything the fence blocks still comes back to you. There is a third design I did not put in front of you, and it is the one I now recommend.

### A.2 The recommendation: make the container safe to hand over by shrinking where it runs, then remove the fences

Today the container may run for a signed-in parent, in a document that can show a child's name, holds a session cookie, and can navigate to private addresses. All the fence code exists because of that. Change one rule and most of it becomes unnecessary:

> **The tag manager runs only in a document where nobody is signed in, and that document only ever shows public marketing pages.**

In such a document there is no child's data on the page, no session to steal, and no private address to leak. The three constraints that needed fences (children, addresses, identifiers) are then held by *where the container is*, not by restricting *what it may do*. So the container can be an ordinary Google Tag Manager container, and the ad team can use it the way every GTM guide describes.

Everything a signed-in parent does (adding a child, enrolling, paying, browsing the shop while signed in) is reported by our server only. That is already how the conversions that matter are reported today.

#### How the rule is held, by mechanism

1. **Signed-out only.** The browser gate changes from "not a gamer" to "nobody signed in" (`src/components/consent/pixel-gates.ts:61-65`, `google-tag-manager.tsx:109-113`). Signing in or out already forces a full page load by an existing repo rule, so a container can never be carried into a signed-in document. The gamer question disappears on the browser side: a gamer is by definition signed in.
2. **A container document leaves by full page load.** Every in-app link and `router.push` already goes through one module, `src/i18n/navigation.tsx` (I checked: there are no direct `next/link` imports anywhere in `src/`). For a signed-out visitor, that module makes any navigation that crosses between "reportable marketing address" and "anything else" a full page load, in both directions. A document is then either all marketing pages or none, so back/forward, vendor history listeners and Google's own page tracking can never see a non-marketing address. The existing allowlist and query check (`src/lib/marketing-pages.ts`) stay as the definition of "reportable"; a marketing page with a query that may not travel (the `/login?redirect=<private path>` case) counts as "anything else".
3. **Consent** stays exactly as it is, in the browser and on every server report.
4. **Which vendors** stays a list in code (a catalogue of vetted ad platforms with their hosts), because a new vendor is a new recipient of personal data and the privacy policy must name it. The catalogue drives the Content Security Policy, the one remaining container rule, and the vendor list in the privacy policy.

#### What the ad team gets

| They can, without an engineer | How |
|---|---|
| Add, change, pause and remove tags for any catalogued platform | Ordinary GTM |
| Use click, link, form-submit, scroll, visibility, timer, history and YouTube triggers | The nine blocked triggers are unblocked; they are safe in a signed-out marketing document |
| Debug with GTM Preview and Tag Assistant | The `gtm_debug` family of parameters is admitted |
| Let Meta and Reddit track single-page navigations and use their Events Manager settings, including automatic advanced matching | Our replacement `fbq`/`rdt` globals are deleted; the vendors' own libraries run as shipped. The only form data on a signed-out marketing page is the parent's own email and name |
| Use manual advanced matching and Google enhanced conversions | The app pushes the parent's hashed email and hashed account id in the data layer at sign-up |
| Track buttons on landing pages and product pages | Click triggers, plus a `cta_click` event the app pushes for landing-page buttons with the label the admin gave them |
| See whether server reports arrived and why something did not fire | A new admin page (below) |
| Send their own test visit to Meta's Test Events and Reddit's event testing | Test mode on the same admin page |
| Allow a new link parameter (a new ad platform's click id, a new email tool's tag) | A list on the same admin page |
| Switch a catalogued platform on or off, with the privacy policy updating itself | Toggles on the same admin page |
| Roll back a bad change | GTM's own versions |

#### The admin page ("Ad tracking"), the one new thing to build

Four cards, all on data SOG already hosts (Supabase), admin-only:

- **Health.** Per day, per event, per platform: reports sent, accepted, refused by the vendor (with the vendor's last error text); how many carried a browser id, a click id, a hashed email; and how many events were stopped by a gate and why (no consent, signed-in gamer, page not on the list, a query parameter named X). Counters only, like the consent tally: no IP, no cookie, no account, so it stays inside the policy's promise that we store none of those. Today this information exists only as `console.error` lines in Vercel's logs, which is why a question about delivery lands on you.
- **Test mode.** The admin pastes Meta's test event code and Reddit's test id and gets a link. Opening it in a private window sets a short-lived cookie; server reports from that browser carry the codes and show up live in the vendors' test screens. Today these are environment variables (`META_CONVERSIONS_API_TEST_EVENT_CODE`, `REDDIT_CONVERSIONS_API_TEST_ID`), which only an engineer can set.
- **Link parameters.** The query keys that may travel, seeded with the standard ad and email parameters, extendable by an admin. `redirect` stays judged by its value in code.
- **Platforms.** On/off per catalogued vendor. The privacy policy's list of advertising platforms renders from this, with its date.

The repo's rule about admin capabilities says to judge whether the admin MCP tools need the same; reading the health counters is the one I would expose.

#### What the server does (engineering-owned, built once)

- Reports every event itself, whether or not the container loaded (subject to your decision in A.5).
- Sets `_fbp` and `_fbc` first-party when marketing consent exists, so every report carries them.
- For signed-in, consenting parents: page view, product view and checkout start go server-only, with the hashed email and account id.
- Reports the purchase when the parent returns from Stripe.
- Sends the signed-in steps to Google Analytics through its free Measurement Protocol, because the container no longer sees them. This is new code and the one place the design costs Google's side something: those events join the visitor's session through the `_ga` cookie, and where that is missing they are skipped.
- Pushes each vendor's event name in the data layer from the same table the server uses, so the browser and server copies cannot drift apart by a typo in a web form.

### A.3 What engineering would still own, and how often it would change

| Engineering owns | Expected change |
|---|---|
| The gates: consent, signed-out, the marketing-page list | When a new *kind* of public page is added. A few times a year; landing pages an admin creates are already covered |
| The event feed (what moments exist, what each carries) | When the product gains a new step worth measuring. A few times a year |
| The server relay to Meta, Reddit and Google | Vendor API version bumps (Meta's pinned version is supported until 2028); otherwise stable |
| The vendor catalogue | A platform not yet in it: hosts, a policy sentence in each locale, and, if server reports are wanted, a reporter of about a day or two. Perhaps once a year |
| The privacy policy's substance | Only when a new category of data is shared |
| Secrets (pixel ids, API tokens) | Rotation |

**Where the ad team would still need an engineer:**

- Anything on a signed-in page. By design there is no browser tag there, ever.
- A fact that is not in the feed (a new product attribute, a new moment).
- A platform outside the catalogue, or server-side reports for a new platform.
- Custom HTML or custom JavaScript tags. These stay blocked (see A.5).
- The health page showing a vendor refusing reports for a reason that is ours (a field the vendor changed).
- A vendor moving its script or beacon to a new host.

I would expect that to be a handful of requests a year, against the roughly 80 commits in nine weeks this area took this autumn. That figure is a judgment, not a measurement.

**What they will get wrong on their own, and what happens:** a duplicated page view if they leave Meta's automatic navigation tracking on beside the page-view tag; a double count if they hand-type an event name where the pushed variable belongs. Both show up in the vendor's own diagnostics, neither leaks anything, and both are theirs to fix in GTM.

### A.4 What it costs, and what it removes

**Build, rough estimate for one engineer: about three weeks, in three stages that each stand alone.**

1. **Hand over the container (about a week).** Signed-out gate; the navigation boundary; unblock the triggers; delete the replacement vendor globals; admit GTM Preview; widen the link parameters; push vendor event names and the parent's hashed identifiers. The agency then rebuilds the container once, as an ordinary one.
2. **Make the server complete (about a week).** Independent server reports, first-party identifiers, signed-in page events, the purchase, the Google Analytics relay.
3. **The admin page (about a week).** Health, test mode, link parameters, platforms and the policy rendering.

The estimate is from reading the code, not from a plan; stage 1's navigation boundary is the part I am least sure of.

**Removed from the current code:**

- `src/lib/ad-pixel-stubs.ts` (317 lines) and its tests, including the dependence on vendor internals that fails silently.
- In `src/lib/gtm.ts`: the page pin, the trigger blocklist, and the address-bar re-checks after each wait.
- `src/lib/gtm-policy.ts` shrinks from a version-pinned reading of two templates to "catalogued vendors' hosts only, and never our session cookie".
- Reddit's deliberately failing tag, the generic-library workaround and the CSP reasoning around it.
- The `_fbc` "later of two clicks" comparison.
- The browser pushes for child added, enrolment and checkout handoff.
- Most of the ten "constraints on whoever configures the container" in `src/components/consent/CLAUDE.md`. What remains fits in a short handover note.

**Money.** No new service.

- Google Tag Manager's web container, Google Analytics and its Measurement Protocol, Meta's and Reddit's Conversions APIs and test tools are free at any volume SOG will reach.
- Supabase: a few small counter tables, inside the existing plan.
- Vercel: one extra function call per reported page event, plus a cookie header on some responses. I did not read SOG's usage, so I cannot say how close the plan's included allowance is; overage on Vercel's paid plans is billed per million invocations and is small at this scale, but check the current price list before relying on that.
- Not used: server-side GTM. It needs its own hosting (Google's Cloud Run, or a paid host such as Stape), which your no-paid-service rule excludes, and it would not remove anything this design leaves.

### A.5 Decisions and sign-offs it needs

1. **Owner: accept that signed-in parents are measured by the server only.** This is the trade the whole design rests on. Cost: Meta and Reddit lose the browser copy of signed-in events (they keep the server copy, which carries the stronger identifiers), and Google Analytics gets those steps through the relay.
2. **Owner: custom HTML and custom JavaScript tags stay blocked.** With them, whoever can publish the container can run any code on the login and register pages, where passwords are typed. I recommend keeping this one fence. Lifting it later is a one-line change and a trust decision about who holds publish rights.
3. **Owner: who may publish the container**, with two-step sign-in required on those Google accounts. The container becomes more powerful, so this matters more than it does today.
4. **Owner: whether to send server reports for a consenting visitor whose blocker stopped the tag manager** (section 2.5).
5. **Privacy policy edits**, ideally with counsel: the tag-manager paragraph ("can carry only these three platforms") becomes the catalogue wording; "never while a gamer is signed in" becomes "never while anyone is signed in", which is a stronger promise; hashed identifiers on page views for signed-in parents; the purchase report; and, before the ad team switches on automatic advanced matching, a sentence saying the platforms' scripts may read the email you type into our sign-up form. No banner re-prompt under the repo's own rule: the question asked is unchanged.
6. **Agency:** one rebuild of the container, and a short handover note replacing the current constraint list.

### A.6 What would change this recommendation

- If the ad team needs browser tags on signed-in pages (for example, an on-site tool that must run in the parent's dashboard), the fences come back for those pages and so does the engineering dependency. I do not see such a need in the code or the brief.
- If the navigation boundary in stage 1 turns out not to be clean in this app, the fallback is separate root layouts (section 3.3), which is more work for the same result.

---

## 0. Verdict in one page

**Is the owner's suspicion right?** Partly, and not where he might expect.

- **The privacy rules themselves are not excessive.** Stripped of mechanism there are only four, and all four are required by law, by Meta's terms, or by basic security: (1) nothing advertising-related runs or is sent without marketing consent; (2) nothing for a signed-in gamer and nothing about a child; (3) an ad platform only ever sees the address of a public marketing page; (4) only a consenting parent's own identifiers, hashed. I would keep all four as they are.
- **What is expensive is how rule 3 is enforced, and one architectural decision behind it.** Since 3 November the Meta and Reddit pixels run inside a Google Tag Manager container that a third party edits with no review. Roughly 1,500 lines (`src/lib/gtm.ts`, `gtm-policy.ts`, `ad-pixel-stubs.ts`, plus about 5,000 lines of tests) exist to fence that container and to stop vendor libraries reporting a private page after a client-side navigation. This is where the system fights the vendors' intended setup: Reddit's template is deliberately made to fail, Meta's parameter-builder is refused, GTM Preview cannot work, and the stubs depend on undocumented internals of two vendor libraries. It is also why the agency misread the setup.
- **A few self-imposed restrictions cost measurement and protect little.** The clearest: page events carry no parent identifier even when a consenting parent is signed in (Meta can already join them through `_fbp`); the query allowlist refuses every landing that carries a parameter it does not know, which includes Google Ads' own `gbraid`/`wbraid`/`gad_source`; and server twins are only sent if the container loaded, which defeats their purpose for the most common ad-blocker case.
- **The biggest gap is not a restriction at all.** A paid sign-up is never reported as a conversion. Only a *free* enrolment and a waitlist place send `CompleteRegistration` (`src/app/api/checkout/products/create/route.ts:297-313`, `src/app/api/participations/waitlist/route.ts:204-215`); the Stripe path reports nothing, and no `Purchase` event exists. Meta and Reddit cannot optimise for paying families.
- **The `_fbp` timing hypothesis is confirmed**, and Reddit's `_rdt_uuid` has the identical problem (section 4).

**Is this a hard problem, or are we making it hard?** Both. The parts that are hard for everyone (consent gating, pixel plus server deduplication, cookie timing, ad blockers) have standard answers, and Sogverse matches most of them. The part that is unusually hard here is self-inflicted in structure but not in motive: one single-page document spans public marketing pages and pages whose addresses contain a child's id or a single-use token, and an unreviewed tag container is allowed into it. Most sites solve that with a document boundary (marketing site and app are separate documents) rather than with runtime fences. Section 6 has the comparison.

## 1. The system as it is

### 1.1 Consent

- One cookie, `sog_consent`, version 1, six months, two purposes: `analytics` (Vercel's cookieless counting only) and `marketing` (everything advertising, including Google Analytics 4, because the container sets `_ga`) (`src/lib/consent.ts:14-47`).
- Banner: Accept all / Reject all / Customise at the first level; names purposes, not vendors (`messages/en/consent.json`). The privacy policy carries the dated vendor list (`messages/en/privacy.json`, `sections.cookies` and `sections.providers`).
- Granting is a state update; any withdrawal reloads the document, and withdrawing marketing first deletes vendor cookies by prefix, `sog_attribution`, and vendor web storage (`src/components/consent/consent-provider.tsx`, `choose` and `clearAdvertisingTraces`). A mount-time invariant deletes the same things in every document where marketing is not granted.

### 1.2 Browser side

Gates, all in the browser (`src/components/consent/google-tag-manager.tsx:109-140`, `pixel-gates.ts:50-66`):

1. marketing granted; 2. a post-hydration client render; 3. not a signed-in gamer, with doubt counted as a gamer; 4. a real `GTM-` id; 5. the page is one of ten marketing templates (`src/lib/marketing-pages.ts:41-52`: `/`, `/about`, three Roblox pages, `/shop`, `/shop/[id]`, `/discover/[idOrSlug]`, `/register`, `/login`); 6. the query contains only allowlisted keys (`marketing-pages.ts:79-98`) or a `redirect` whose value is itself a marketing page.

Load order inside `loadGtm` (`src/lib/gtm.ts:412-453`), all synchronous before the script element is appended:

1. `gtm.allowlist` / `gtm.blocklist` (`gtm.ts:138-159`): Google's own items and templates admitted; Custom HTML, Custom JS, non-Google built-ins, the cookie/JS/DOM variables and all nine automatic triggers blocked.
2. The template permission policy (`src/lib/gtm-policy.ts`).
3. Consent Mode default (all denied), then update (all four follow marketing).
4. The app's own `fbq` and `rdt` globals (`src/lib/ad-pixel-stubs.ts`): Meta's `disablePushState` pinned true and `autoConfig` forced off; Reddit's library replaced by the generic copy so its Events Manager configuration fetch hits the CSP and fails; both hold calls until the vendor library arrives and drop a report if the tab has left the page it was made on (`ad-pixel-stubs.ts:143-175`).
5. `gtm.start`, then the script.

Events pushed to `dataLayer` (`src/lib/gtm-events.ts`): `page_view`, `view_item`, `add_to_cart`, `sign_up`, `child_added`, `enrolment`, `begin_checkout`. Each carries `event_id` (a fresh UUID per push), `page_path` (internal path), and for product events `ecommerce`, `meta` and `advertised`. Each is preceded by `{ecommerce: null, meta: null}` (`gtm.ts:493-498`).

In the container (per the dashboard observations in the brief): Meta and Reddit gallery templates, fired on the custom events, `eventID` / `conversionId` from `event_id`.

### 1.3 Server side

- **Committed outcomes** are reported by the route that commits them, after the response: lead (`/api/auth/register`, `/api/auth/complete-registration`), child added (`/api/gamers/create`), free enrolment (`/api/checkout/products/create`), waitlist (`/api/participations/waitlist`). These do not depend on the container at all.
- **Page-event twins**: after a successful push the browser posts `{event, eventId, pagePath, productId?}` to `/api/page-events` with `keepalive` (`src/lib/page-events.ts:25-39`, called from `gtm.ts:578-585`). The route answers 204 immediately and re-applies every gate from the request (`src/app/api/page-events/route.ts:59-98`).
- One fan-out (`src/lib/ad-conversions.server.ts`) to Meta's Conversions API (Graph v25.0) and Reddit's. Each reporter checks the request's own consent cookie (`meta-conversions.server.ts:298-299`, `reddit-conversions.server.ts:185-186`).

What each vendor receives from the server (`meta-conversions.server.ts:301-354`, `reddit-conversions.server.ts:188-230`):

| Field | Page view / product view / checkout start | Lead / child added / enrolment |
|---|---|---|
| User agent, IP (first `x-forwarded-for` entry) | yes | yes |
| Vendor browser id (`_fbp`, `_rdt_uuid`) if the request carries it | yes | yes |
| Click id (`_fbc` / `_rdt_cid`, else from `sog_attribution`) | yes | yes |
| SHA-256 of parent's email, SHA-256 of parent's account id | **no**, even when signed in | yes |
| Product id, English name, topic, price | product events only | yes (no price on lead, child added, waitlist) |
| Anything about a child | never | never (child added says only that one was added) |

Not reported anywhere: a paid enrolment, a completed payment, the Stripe handoff (GA4 alone hears `begin_checkout`).

### 1.4 What the privacy policy promises

`messages/en/privacy.json`, `sections.providers` (Meta, Reddit, Google entries) and `sections.cookies`: the three platforms by name, reached through a tag manager "which can carry only these three platforms"; servers report public pages viewed and sign-up starts with IP, browser details, vendor cookies and click id; hashed email and hashed account id only "when you create an account or sign up" and when adding a child; never a child's name, age or details; nothing while a gamer is signed in; the 30-day attribution cookie and its click ids; withdrawal deletes the cookies. `sections.technical` also promises "we never store your internet address or browser details in any table of ours", which constrains any design that would persist them for a later server report.

### 1.5 Change history

`git log` over the consent, GTM, pixel, conversion and attribution files: about 80 non-merge commits between 3 September and 6 November 2026 (25 in September, 36 in October, 18 in November). The sequence shows what drove them:

- 3 Sep: banner. 11 Sep: Meta pixel loaded by the app itself, conversions from the server. Same day, two fixes for reporting against a stale address bar.
- 24 Sep: GTM added for Google's tags; three same-day fixes for tags outliving the page, the page pin, and storage twins of click ids.
- 5-6 Oct: product fields, hashed email, checkout start moved from Stripe handoff to click, `external_id`.
- 29-30 Oct: Reddit pixel (app-loaded), then a fix to load the generic library so the CSP fence holds; attribution cookie.
- 2-3 Nov: click ids kept; **the pixels moved into the container**; event ids and server twins; review fixes.
- 5-6 Nov: child-added event and two rounds of review corrections; `_fbc` precedence fixed twice in one day.

Three things recur: (a) the architecture for *where the pixel lives* changed three times in eight weeks; (b) every change was followed by fixes for an ordering or stale-URL leak found in review; (c) each new field or event required coordinated edits to code, the 550-line `CLAUDE.md`, and the privacy policy in every locale.

## 2. Assessment

### 2.1 Where the design is sound

- **Consent gating matches Finnish law and is not stricter than required.** Section 205 of the Act on Electronic Communications Services requires prior consent for non-essential cookies, Traficom does not accept legitimate interest, and rejection must be possible at the first level ([Traficom guidance](https://www.kyberturvallisuuskeskus.fi/sites/default/files/media/file/Guidance_on_the_use_of_web_cookies_for_the_service_providers.pdf), [Traficom cookies page](https://kyberturvallisuuskeskus.fi/en/our-activities/regulation-and-supervision/cookies)). Meta's own terms require the advertiser to obtain verifiable consent before Meta cookies are set or read in the EU ([Meta Business Tools Terms](https://www.facebook.com/legal/terms/businesstools), section on cookie consent). Loading nothing before consent is Google's "basic" consent mode, a documented mode ([Google consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode)).
- **Server reports gated on the request's own consent cookie.** A server report reads `_fbp` from the device and sends IP, user agent and hashed email for advertising; that needs the same consent. Checking it per request rather than trusting stored state is the right mechanism.
- **The gamer exclusion.** In Finland a child under 13 cannot consent to information society services (Data Protection Act 1050/2018, section 5; [official translation](https://data.finlex.fi/api/media/statute-foreign-language-translation/46200/mainPdf/main.pdf)), and Meta's terms have the advertiser warrant it will not share data it knows or should know is from or about a child under 13 ([Meta Business Tools Terms](https://www.facebook.com/legal/terms/businesstools), section 1.h). Sogverse knows exactly which sessions are children's. Excluding by role, with doubt resolved as "gamer", on both browser and server, is required in substance and cheap in form.
- **Meta's Automatic Advanced Matching off, and Reddit's equivalent blocked.** This one deserves to stay. AAM lifts names, emails and phone numbers out of form fields on the page. `/shop/[id]` is a marketing page and hosts the sign-up panel where a parent types a child's first name. With AAM on, a child's name would be hashed and sent, which breaks the policy and Meta's own under-13 term. This is a real constraint, not caution for its own sake.
- **Marketing-page allowlist as a safe default.** Reset, PIN, verification and seat-offer links carry single-use tokens and family pages carry a child's id; a vendor library sends the page URL with every event. An allowlist where a missing page costs a measurement is the right shape.
- **Event ids shared between browser and server**, minted once per event and required for twins. This is exactly Meta's recommended deduplication (same `event_name` and `event_id`, 48-hour window; [Meta deduplication](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events)), and Reddit's dashboard confirms it works.
- **Committed outcomes reported from the committing route**, not from a later page.
- **Click ids kept first-party for the consent-after-landing case.** A real problem solved sensibly.
- **No value on a waitlist place, lead or child added; `advertised` flag.** Campaign-quality rules, not privacy rules, and correct.

### 2.2 Where it fights the vendors' intended setup

| What Sogverse does | Vendor's intended setup | Consequence |
|---|---|---|
| Installs its own `fbq`/`rdt` and intercepts the libraries' arrival by trapping the assignment of `callMethod` / `sendEvent` (`ad-pixel-stubs.ts:241-246, 299-304`) | Vendor snippet builds the global; library replaces/fills it | Depends on two undocumented internals. The file itself says a vendor change "fails silently in production" with event counts going flat as the only sign (`ad-pixel-stubs.ts:47-60`) |
| Refuses the script Reddit's template injects (`pixel.js?pixel_id=`) and loads the generic library instead; CSP blocks Reddit's config host | Library loaded by pixel id with Events Manager configuration | Reddit's tag shows as failed in Tag Manager "and that is expected". Anyone reading the container sees a broken tag |
| Refuses Meta's parameter-builder bundle (served from jsdelivr/unpkg) in the template policy (`gtm-policy.ts`, `inject_script` section) | Meta's Parameter Builder is its recommended way to get high `fbp`/`fbc`/IPv6 coverage ([Parameter Builder Library](https://developers.facebook.com/docs/marketing-api/conversions-api/parameter-builder-library)) | The two improvements Meta's dashboard is asking for (browser id coverage, IPv6) are what that library provides |
| Query allowlist refuses `gtm_debug` | GTM Preview / Tag Assistant | The agency's normal debugging tool cannot work at all |
| Blocks every automatic trigger and three built-in variable types | Standard GTM | "Blocked tag types and triggers silently never fire" |
| No user data on the browser pixel | Manual advanced matching on `fbq('init')` ([Meta advanced matching](https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching)) | The "Set up manual advanced matching" diagnostic |
| Loads the container only after consent and only on ten page templates | Container on every page with consent mode | Fine and defensible; just unusual to the agency |

The pattern: **the container is offered to the agency as a normal GTM container, but it is not one.** It is a constrained runtime that accepts three fixed tag shapes. Ten bullet points of "constraints on whoever configures the container" in `CLAUDE.md` have to reach a third party by message, and several of them (event name spelled exactly `ChildProfileCreated`, pixel id identical to the server's, enhanced measurement off, no advanced matching fields) are enforced by nothing. The agency proposing a rebuild is the predictable result of handing someone a tool whose usual affordances have been removed without that being visible in the tool.

### 2.3 Where the complexity and churn come from

One root cause, three amplifiers.

**Root cause: one document spans public and private pages, and third-party code that reads `location.href` lives in it.** The app is a single Next.js tree under one root layout (`src/app/layout.tsx`, `src/app/[locale]/layout.tsx`); a container loaded on `/shop` is still running when the parent client-navigates to `/parent/gamers/<id>`. Every one of the "six knobs" in `CLAUDE.md` compensates for that:

- the address-bar re-read after every `await` (`gtm.ts:649-681`);
- the held-call page check in the stubs;
- `disablePushState`;
- the nine blocked triggers;
- the `page_location` pin for GA4's self-generated events (`gtm.ts:366-383`);
- `Referrer-Policy: strict-origin`.

And one acknowledged hole remains: Meta's library queues calls while it fetches a pixel's configuration and replays them against the URL the tab shows then, which the stubs cannot reach (`ad-pixel-stubs.ts:62-67`).

By the repo's own rule ("a flaw in the model is fixed in the model, not worked around"), this is a model flaw being compensated at every reader.

**Amplifier 1: the unreviewed container.** Moving the pixels into GTM on 3 November added the allowlist/blocklist, the 250-line permission policy pinned to specific template versions (Meta v2.0.9, Reddit v1.0.4, read on 2026-11-03), and the stub interplay with those templates. The stated benefit is that the agency can "set up their tags without changing the site". In practice the events, their names, ids and payloads are all defined in code; the container only maps them. The flexibility bought is small and the fence is large.

**Amplifier 2: disclosure written at field level.** The privacy policy lists exactly which fields go on which event, and `CLAUDE.md` says "adding a field is a privacy-policy edit". GDPR Article 13 requires recipients, purposes and categories of data, not a per-event field list. The precision is honest and commendable, but it couples every tracking improvement to a legal-copy change in every locale, and it is why "page events carry no account" became a hard rule: the policy sentence says hashes go "when you create an account or sign up".

**Amplifier 3: vendor-timing dependence.** Identifier cookies are created by vendor libraries on their own schedule, and the server reads whatever exists when its request happens to arrive. `_fbp` coverage, the `_fbc` "later of two clicks" logic (fixed twice on 6 November), and the click-id fallback are all consequences.

### 2.4 Required by law or terms, versus self-imposed

**Required (keep):**

| Rule | Source |
|---|---|
| No ad cookie, tag or server report before opt-in; reject at first level; withdrawal as easy as consent | Finland AECS s.205, Traficom guidance; GDPR Art. 7(3); Meta Business Tools Terms |
| Consent also covers server-side reports that read device cookies or send personal data for advertising | ePrivacy Art. 5(3) as read in [EDPB Guidelines 2/2023](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-22023-technical-scope-art-53-eprivacy-directive_en); GDPR Art. 6 |
| Nothing from a child's session, nothing about a child | Finnish DPA s.5 (13 years); GDPR Recital 38; Meta terms s.1.h |
| Contact data hashed before it reaches Meta | Meta Business Tools Terms s.1.a |
| Ad platforms never receive token-bearing or child-identifying URLs | GDPR Art. 5(1)(c), Art. 32; ordinary security |
| Name recipients and purposes in the policy | GDPR Art. 13 |
| Google tags get a consent default before they run | [Google consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode) for EEA traffic |

**Self-imposed:**

| Restriction | What it protects | What it costs | View |
|---|---|---|---|
| Page-event twins and browser pixel carry no hashed email / account id, even for a signed-in, consenting parent | The literal policy sentence. Little in fact: the lead event carries the same `_fbp` plus the hashed email, so Meta can already join that browser's page views to the parent | Match quality 5.5-6.1 on PageView / ViewContent / InitiateCheckout versus 7.7 on events with identifiers; the "manual advanced matching" diagnostic; weaker retargeting and lookalikes for existing parents | **Relax for signed-in non-gamer parents with consent.** Policy edit needed |
| Query allowlist refuses the whole page on any unknown key | Private values in a query (really only `redirect` on `/login` and `/register`) | Any landing carrying `gbraid`, `wbraid`, `gad_source`, `gad_campaignid`, `utm_id`, `msclkid`, `ttclid`, Klaviyo's `_kx`, `igshid` etc. gets no container, no page view, no twin, for any platform. Google Ads appends several of these routinely. Also kills GTM Preview. Refusals are silent | **Keep the allowlist shape, widen it with the standard ad and email parameters, and make refusals observable** |
| Server twin is posted only after a successful push, and a push only after the container loaded (`gtm.ts:666-667`, `578-585`) | Symmetry ("a twin with no push is nothing") | When a blocker stops `googletagmanager.com` (most do), neither copy is sent. The stated purpose of the twin, surviving a blocked library, only works when GTM loads and the vendor library does not | **Decouple.** See 2.5 for the value question this raises |
| Pixels inside a fenced GTM container | Agency autonomy | About 1,500 lines of fences and tests, template-version pinning, a "failed" Reddit tag, no Preview, the agency's confusion | **Owner decision.** Section 3 gives both paths |
| Reddit config fetch blocked by CSP; generic library | Anyone with Reddit Ads access switching on URL-rule events, page scraping or automatic matching | The stub and policy special-casing for Reddit | Justified in aim (same reasoning as AAM). Becomes trivial if the app loads the pixel itself |
| GA4 under `marketing`, not `analytics` | Honest bucket: GA sets `_ga` and links to Ads | GA4 sees only marketing-consenters | Defensible. Consent is required for `_ga` either way |
| Vercel's cookieless analytics behind consent | Caution | Lower analytics coverage | Arguably stricter than required; outside this review's scope, and a legal call |
| Field-level policy wording | Trust, precision | Every field change is a multi-locale legal edit | **Move to category-level wording** once, with counsel |
| "Never store IP or browser details in a table of ours"; click id never stored with an account | A clean promise | Rules out the textbook way to report a purchase from a webhook | Keep; section 3.5 shows a purchase report that does not need storage |
| 204-at-once on `/api/page-events` so status and timing reveal nothing | A side channel nobody would exploit | Nothing material | Harmless |
| No noscript pixel | Consent | Nothing | Correct |

### 2.5 A value question hidden in the decoupling

Sending server events for a visitor whose browser blocked the tag manager is legal when that visitor accepted marketing in the banner, and it is standard practice; recovering blocker-lost events is the main commercial reason Conversions APIs exist. But a person running a blocker has arguably expressed a second, contrary preference. Today the code half-honours it by accident. The owner should decide it on purpose: either "the banner answer is the answer" (decouple fully) or "we do not route around blockers" (then the twins add little and could be dropped for page events).

## 3. What a clean system would look like

Principle: **every guarantee that matters is held by structure or by a server check, not by ordering inside a running document; identifiers are created by us at a known moment, not by a vendor at an unknown one.**

### 3.1 One event function, two independent sinks

A single app function, say `trackMarketingEvent(event)`, called at the seven moments. It passes the visitor gates once and then:

- **always** posts the server twin (for the browser-originated events), independent of any vendor script;
- pushes to the browser sink if one is present.

The server report stops depending on the container having loaded. The event id is minted before either sink, as now.

### 3.2 First-party identifiers minted at consent, by mechanism

When marketing consent exists and the visitor is not a gamer, the proxy (server `Set-Cookie`) ensures:

- `_fbp` in Meta's documented format `fb.1.<creation ms>.<random>` if absent. Meta's library adopts an existing `_fbp` and only creates one "if one does not already exist", and Meta's docs describe server-generated values ([fbp and fbc parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc)). Meta's own Parameter Builder library does this server-side for the same reason.
- `_fbc` as `fb.1.<landing ms>.<fbclid>` when the landing carried an `fbclid`. The code already builds this value (`meta-conversions.server.ts:188-190`); writing it as the cookie means the browser pixel and the server send the same thing, and the "later of two clicks" comparison (`fbcFor`, `meta-conversions.server.ts:206-219`) disappears.

The banner's grant handler does the same client-side for the document in which consent is first given, exactly as it already does for `sog_attribution`.

Effects: `_fbp` coverage on server page events goes to effectively 100%, including the first page view and browsers that block `fbevents.js`; a server-set cookie also escapes Safari's 7-day cap on script-written cookies, which a library-written `_fbp` does not. The existing prefix sweep already deletes both on withdrawal.

Caveats: Meta says "do not override or adjust" these cookies; creating one that is absent, in the documented format, is what its own library does, but this is my reading and worth one line of confirmation from the Meta rep. **For Reddit I could not find official documentation that an advertiser may mint `_rdt_uuid`**; third-party connector docs describe it as pixel-generated. Until Reddit confirms, the clean alternative there is to keep the pixel-created cookie and accept that the first twin lacks it (Reddit deduplicates on `conversion_id` regardless).

### 3.3 A document boundary instead of runtime fences

Give the marketing pages their own root layout. Next.js performs a full page load when navigation crosses root layouts ([Next.js route groups](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)). Then:

- a document that contains advertising code can only ever show marketing pages;
- leaving for `/parent/...`, `/gamer/...`, a reset link or a seat offer destroys the document, and with it every queued vendor call, GA4's engagement timer, and Meta's internal replay queue.

That closes the one hole the stubs admit they cannot (Meta's config-fetch replay), and retires the GA4 page pin and most of the stale-page reasoning. Auth changes already force full loads, so the app already lives with this cost at its main boundary.

What it does not remove: `/login?redirect=<private path>` is still a marketing-document page with a private query, so the query check at load time stays, and so does "no vendor reports a navigation by itself" (`disablePushState`, no history trigger).

Uncertainty: the tree is `app/[locale]/(group)/...` with a pass-through `app/layout.tsx`. Multiple root layouts require removing the top-level layout and giving each group its own `<html>`; I did not verify how that interacts with this app's locale layout, providers and not-found handling. It costs one extra full load per shop-to-dashboard transition. I rate the payoff as real but moderate; it is the correct model, and worth a spike before committing.

### 3.4 Where the pixel lives: two coherent options

**Option A: the app owns the Meta and Reddit pixels (as it did before 3 November).** The app loads `fbevents.js` and Reddit's library itself and calls `fbq('track', name, data, {eventID})` and `rdt('track', ...)` from the same function that posts the twin. The container, if kept, carries Google's tags only.

- Removes: the template policy, the template-version pinning, the stub/template interplay, the "failed" Reddit tag, the Lynx constraint list for Meta and Reddit, event-name and pixel-id drift (names come from the same constants the server uses), and the agency's ability to misconfigure.
- Keeps: a small amount of pixel init code (`autoConfig` off, `disablePushState`).
- Costs: reverses the owner's 3 November ruling; the agency asks for changes instead of making them. Given that every event is already defined in code, that is a small real loss.
- This is what I would choose. It is also closest to the vendors' intent: base code on the page, events with ids, Conversions API alongside.

**Option B: keep the container, make it legible.** If agency autonomy matters more:

- Push the vendor's event name and the pixel id in the data layer (`meta_event: "Lead"`, `reddit_event`, `meta_pixel_id`), from the constants the server uses. Each vendor then needs one tag and one trigger with no lookup table and nothing hand-typed, and deduplication cannot drift.
- Admit `gtm_debug` so Preview works.
- Write the container's shape down for the agency as "three tags, do not add others", and export the container JSON into the repo on each change so it is at least reviewable after the fact.
- The fences stay.

Either way the server reports remain the source of truth for conversions.

### 3.5 Report the purchase

Add a paid-conversion event without breaking the "no IP in our tables" promise: when the parent returns from Stripe to the confirmation page, that request carries their consent cookie, `_fbp`, `_fbc`, IP and user agent. The server confirms the payment state it already knows, and reports `Purchase` (Meta) / `PURCHASE` (Reddit) with value, currency, hashed email and account id, using an event id derived from the participation id so a reload cannot double count within Meta's 48-hour window (a "reported" marker on the row covers anything later). This is "noticing when somebody looks" in the repo's own terms. The loss is the parent who pays and closes the tab before the redirect, which is small. The alternative, storing identifiers in Stripe metadata for the webhook, captures those too but needs the policy changed.

Whether a paid seat should also send `CompleteRegistration`, as a free one does, is a campaign-design decision for the owner and agency; today the same event name means "free seat or waitlist" only, which is probably not what the agency assumes.

### 3.6 Identify the consenting parent on page events

For a signed-in non-gamer parent with marketing consent, send the same two hashes on the three page-event twins (the route already reads the session; it currently passes `{ id: null, email: null }`, `page-events/route.ts:97`). This is the server-side equivalent of manual advanced matching. It will raise match quality on the upper-funnel events for returning parents. It may not clear Meta's diagnostic, which looks at the browser pixel; clearing that needs the hashes on `fbq('init')`, which is straightforward under Option A and a tag field fed from the data layer under Option B. I would do the server side and not chase the diagnostic for its own sake.

### 3.7 The `_fbp` case and the Meta diagnostic, concretely

- **`_fbp` share 60% / 54% / 100%: timing, confirmed.** `pushWithServerTwin` pushes to `dataLayer` and calls `fetch("/api/page-events")` in the same tick (`gtm.ts:578-585`). At that moment, on the first page view after consent in a browser with no `_fbp`, the Meta tag has only just called our stub, which holds the call and has not even finished downloading `fbevents.js`; the cookie is written by that library later. So the first page view (and a product page landed on directly) goes without `_fbp`; later pages in the same or later documents have it; a checkout start, lead or enrolment happens long after and has it 100% of the time. That is exactly the observed pattern. A second contributor: browsers where GTM loads but `fbevents.js` is blocked never get the cookie at all.
- **Reddit has the same issue**, and slightly worse: the generic library is only requested on the first `rdt()` call (`ad-pixel-stubs.ts:281-297`), so `_rdt_uuid` is also absent on the first twin. Reddit's dashboard does not surface a coverage figure for it; the 4.6-4.8 match quality is consistent with it.
- **Impact is smaller than the percentage suggests** where the browser pixel also delivers, because Meta deduplicates the pair and the browser copy carries the id. It matters for server-only events.
- **Fix:** 3.2 (mint first-party) solves it by construction. A wait-for-cookie delay would be a timer and a race, and does nothing for blocked libraries.
- **IPv6:** the server sends the first `x-forwarded-for` entry (`src/lib/conversion-request.server.ts`). Whether that can ever be IPv6 depends on Vercel's edge; I found no official statement either way. Meta's own answer is the Parameter Builder's client-side IP capture into an `_fbi` cookie, which requires calling a third-party "what is my IP" service from the browser. I would not add that; the gain is marginal and it is a new recipient.
- **"Set up manual advanced matching":** a direct consequence of the "no advanced matching fields" rule. See 3.6.
- **"+110% conversions from the Conversions API on ViewContent":** I could not explain this from code. Reddit's figures show its browser pixel delivering about 92% of page visits, so a general blocker effect of that size is unlikely. Candidates: Meta's tag in the container not firing reliably for `view_item` (for instance waiting on the template's ecommerce gate while the stub holds calls), the stub dropping reports, or the metric measuring attributed conversions rather than event counts. Worth comparing browser and server ViewContent counts in Events Manager.

## 4. Timing, ordering and races

For each: what happens now, and how a clean design holds it.

| # | Race or ordering dependency | Now | Held by | Clean design |
|---|---|---|---|---|
| 1 | Consent default must reach Google's tags before they run | Lists, policy, default, update, stubs all pushed synchronously before the script is appended (`gtm.ts:419-450`) | Mechanism (one function, fixed order) | Keep |
| 2 | Consent granted while a page is open | Cookie written, then state; gated effects re-run and report the current page (`google-tag-manager.tsx:115-140`); banner writes `sog_attribution` from the landing's in-memory values | Mechanism | Add: mint `_fbp` / `_fbc` in the same handler (3.2) |
| 3 | Ad click id gone from the address bar by the time consent is given | `sog_attribution` keeps it; server falls back to it. The browser pixel's own events still lack `_fbc` | Mechanism on the server; unhandled in the browser | Write `_fbc` ourselves; both sides agree |
| 4 | Landing values held only in memory until consent | Lost if the visitor does a full reload before answering | Accepted | Keep; legally the conservative choice (`src/lib/utm.ts`, point 2) |
| 5 | Consent withdrawn while scripts are running | Sweep, then reload; GA rewrites its cookie during unload; the mount invariant clears it in the next document | Mechanism (standing invariant) | Keep |
| 6 | Consent changed in another tab | The other tab's provider is "seeded once and never re-synced"; a container running there keeps running, and can rewrite cookies after the sweep, until that tab loads a new document. Server reports stop at once because they read the cookie per request | **Unhandled in the browser** | Re-read the consent cookie on `visibilitychange` and reload if marketing was withdrawn. Small |
| 7 | Server report for someone whose consent lapsed | Each reporter re-reads the request's cookie | Mechanism | Keep |
| 8 | Container still downloading when the visitor navigates | Page view waits for load, then re-reads the address bar; other events may queue because they state their own page | Code discipline at every `await` | Document boundary (3.3) makes the worst case "another marketing page" |
| 9 | Vendor library still downloading when a tag calls it | Stub holds the call with its page; drops a report if the tab moved | Code, resting on vendor internals | Option A: the app loads the library first and reports after; or boundary |
| 10 | Meta's library locked on its config fetch replays against a later URL | Acknowledged gap (`ad-pixel-stubs.ts:62-67`) | **Unhandled** | Document boundary |
| 11 | GA4's self-generated events read the live document | Sticky `set` pin before the re-checks | Code, order-sensitive ("never tidy it under the guards") | Boundary removes the need |
| 12 | Vendor auto-reports on client navigation | `disablePushState` pinned; nine triggers blocked; enhanced measurement off in the GA property | First two mechanism; **third is a setting in a web form** | Keep the first two; for the third, add a smoke check or drop GA4 automatic events by owning the config |
| 13 | Server twin sent before the vendor cookie exists | Twin lacks `_fbp` / `_rdt_uuid` on first events | **Unhandled** | Mint first-party (3.2) |
| 14 | Twin depends on the container having loaded | No container, no twin (`gtm.ts:666-667`) | By design, wrongly coupled | Decouple (3.1) |
| 15 | Page closed or navigated before the browser event is sent | `add_to_cart` pushed in the click handler; if the library has not arrived it is held and lost. `sign_up` / `enrolment` pushed just before a full navigation; beacon may be cancelled | Covered by the server copy under the same id | Keep; this is the purpose of the server copy |
| 16 | Page closed before the twin is sent | `keepalive` fetch | Mechanism | Keep |
| 17 | Server report fails or times out | One attempt, 10 s, logged and dropped (`meta-conversions.server.ts:361-388`) | Accepted | Keep. A durable retry would have to store IP and cookies, which the policy forbids; under-measuring is the safe direction |
| 18 | Deduplication when one copy is late or missing | Same id and name on both; Meta's window is 48 h and prefers the browser copy within 5 minutes; either copy alone still counts once | Mechanism for ids. **Event name and pixel id in the container are hand-typed** | Names and pixel id from code (Option A, or pushed in the data layer under B) |
| 19 | Two server copies of one event | Meta does not deduplicate server against server ([Meta deduplication](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events)); today nothing retries, so it cannot happen | By absence | For a purchase report, a marker on the row |
| 20 | Auth state unknown during hydration | Gate reads false until the profile is read; unreadable profile counts as a gamer | Mechanism | Keep |
| 21 | Parent consents on a shared device, child signs in | Role gate; account switch is a full navigation, so the old document and its scripts are gone | Mechanism | Keep |
| 22 | Old and new ad click on the same browser | `fbcFor` compares cookie time and landing time across two clocks | Code, fixed twice | Writing `_fbc` ourselves on landing makes the cookie authoritative |
| 23 | Effect order on a product page | The product view's effect runs before the page view's and loads the container itself; Meta receives ViewContent before PageView | Works; relies on React's child-first effect order | One event function with an explicit order |
| 24 | Checkout start counted once per page per document | Counts attempts, not people | Accepted and documented | Keep |
| 25 | Ad blocker stops GTM | Nothing sent for page events; lead and enrolment still sent from the server | See 2.5 | Owner's decision |
| 26 | Ad blocker stops only the vendor library | Twin sent without a browser id | Partially | Mint first-party |
| 27 | Safari caps script-written cookies at 7 days | Vendor-written `_fbp`, and a banner-written `sog_attribution`, expire early; a proxy-written `sog_attribution` does not | Unhandled | Server-set identifiers |

Summary: the ordering *inside* the loader is already held by mechanism and is good work. The races that remain open are all of one kind: something outside our code (a vendor library, another tab, a web-form setting) acts on its own schedule inside a document we share with it.

## 5. What changes would require outside code

| Change | Privacy policy | Banner re-prompt | Sign-off | Vendor / agency |
|---|---|---|---|---|
| Mint `_fbp` / `_fbc` first-party | One clause: cookies "Meta keeps" becomes cookies set for Meta, by its script or by us | No (same purpose) | Owner | Confirm with Meta rep; ask Reddit whether `_rdt_uuid` may be advertiser-minted |
| Decouple twins from the container | None | No | Owner decides the blocker question (2.5) | None |
| Hashes on page events for signed-in parents | Yes: the Meta and Reddit entries say hashes go "when you create an account or sign up" | No by the repo's own rule (recipient and purpose unchanged). Counsel may prefer otherwise since identified browsing is a step up | Owner, ideally counsel | For browser side: advanced matching on init |
| Report a purchase | Yes: add "when you pay" to the events listed | No | Owner | Agency: new optimisation event; decide whether paid seats also send CompleteRegistration |
| Widen the query allowlist | None | No | None | None |
| Option A (app owns the pixels) | Edit the "tag manager ... can carry only these three platforms" paragraph | No | **Owner: reverses his 3 November ruling** | Agency: remove Meta/Reddit tags from the container; agree a request process |
| Option B (legible container) | None | No | Owner | Agency rebuilds to one tag per vendor from data-layer variables |
| Document boundary | None | No | Owner (engineering cost, one extra full load at the boundary) | None |
| Category-level policy wording | Rewrite of two entries, all locales | No | Counsel, CEO | None |
| Cross-tab withdrawal | None | No | None | None |

A consent-version bump is not needed for any of these under the rule in `src/lib/consent.ts:20-36` (the question is unchanged). The banner text already says data is shared "for targeted advertising and measurement".

One existing open item to note: `CLAUDE.md` records that keeping click ids "has not had a legal review of its own".

## 6. Is this hard for everyone? Comparison with normal practice

### 6.1 What the vendors recommend

- **Meta:** pixel in the browser plus Conversions API for the same events, deduplicated by `event_id` and `event_name`, with `fbp`, `fbc`, IP, user agent and hashed identifiers; `external_id` and `event_id` on all events ([best practices](https://developers.facebook.com/docs/marketing-api/conversions-api/best-practices), [deduplication](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events)); capture the cookies "as early as possible", ideally on the landing page, using the Parameter Builder ([Parameter Builder Library](https://developers.facebook.com/docs/marketing-api/conversions-api/parameter-builder-library)).
- **Reddit:** the same shape: pixel plus Conversions API, deduplicated on conversion id and event name, with `uuid`, click id and match keys.
- **Google:** consent mode with a denied default and an update; "basic" mode blocks tags until consent, "advanced" loads them and sends cookieless pings ([consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode)).
- **Server-side GTM:** a web container forwards events to a server container on a first-party subdomain, which calls each vendor's API and can set first-party cookies server-side ([Meta's sGTM guide](https://developers.facebook.com/docs/marketing-api/conversions-api/guides/gtm-server-side)).

### 6.2 Common commercial patterns

- **Consent platforms (Cookiebot, OneTrust, Usercentrics):** a banner, a consent cookie, script blocking until consent, consent mode signals, a periodically scanned cookie list. They do not address SPA page leakage, children, or server-side reports; those are left to the site.
- **Server-side tagging (sGTM, Stape):** moves vendor calls to a server you control, sets identifier cookies from the server, and usually still runs a browser pixel for deduplication. It is infrastructure to host and another container to configure by web form.
- **Shopify:** the closest analogue to what Sogverse built. Shopify does not let third-party pixels run in the storefront document. App pixels run in a web worker and custom pixels in a sandboxed iframe; they receive a fixed set of standard events from Shopify and never see the page; the pixel manager loads them only when the visitor's consent allows ([Shopify web pixels](https://shopify.dev/docs/apps/build/marketing-analytics/pixels), [pixel privacy](https://shopify.dev/docs/api/web-pixels-api/pixel-privacy)). Shopify reached the same conclusion Sogverse did (third-party tag code must not see the real document) and solved it with isolation rather than with fences inside the shared document.
- **Team write-ups:** I found one independent account of a team building dual-fire Meta tracking themselves, which abandoned a community sGTM tag for a custom server function after it mis-mapped events ([dev.to write-up](https://dev.to/clarencyuboop/how-we-built-a-dual-fire-meta-capi-tracking-system-for-igaming-landing-pages-524)). It is one team's experience. I did not find a published account of a children's service solving this exact combination; treat that as "not found", not "does not exist".

### 6.3 Where Sogverse matches, and where it deviates

**Matches the norm:**

- opt-in banner with first-level reject, consent cookie, six-month life;
- basic consent mode with default and update;
- browser pixel plus Conversions API with shared event ids;
- hashed email and `external_id` on conversions;
- first-party storage of click ids for late consent (what the Parameter Builder and sGTM setups also do);
- server-side re-validation of every gate.

**Deviates:**

| Deviation | Justified by a real constraint? |
|---|---|
| Tags load on ten page templates only, never elsewhere | **Yes.** Token URLs and child ids in addresses. Most sites have no such URLs |
| Role-based exclusion of gamers, doubt counted as a child | **Yes.** Children's data, Finnish law, Meta's terms. Most sites cannot tell who is a child; Sogverse can and therefore must |
| Automatic matching and dashboard-driven configuration disabled | **Yes.** A child's name is typed into a form on a marketing page |
| Runtime fences inside a shared document (stubs, replay guards, page pin, trigger blocklist) | **The constraint is real; the solution is the costly one.** The norm is a marketing site and an app as separate documents, where this problem does not arise. Sogverse merged them (the legacy marketing site was retired in October) and inherited the problem |
| A third party's GTM container on a signed-in app, fenced by policy | **Choice that adds cost.** Normal either to trust the container fully (not acceptable here) or to keep ad tags in code (Option A) |
| Reddit template made to fail; Meta parameter builder refused | Consequence of the previous row |
| No identifiers on page events for signed-in consenting adults | **Choice.** Stricter than law, terms and practice; protects little |
| Unknown query key refuses the whole page | **Half.** The risk is real for `redirect`; refusing standard ad parameters is an oversight |
| Twins only when the container loaded | **Choice**, and contrary to why server events exist |
| Identifier cookies left to vendor timing | **Gap versus the norm.** Vendors and sGTM setups set them early and server-side |
| No purchase event | **Gap versus the norm.** Every standard setup reports the paid conversion |
| Field-level privacy policy | **Choice.** More precise than the law asks |

### 6.4 What a standard pattern would remove, and what stays regardless

**Would disappear:**

- With a document boundary (the normal site/app split, recreated inside one codebase): the page pin, held-call replay guards, most address-bar re-reads, and the unfixable Meta replay window.
- With app-owned pixels: the template policy, version pinning, the stub/template interplay, the agency constraint list for Meta and Reddit, name and id drift.
- With first-party identifiers: the `_fbp` coverage problem, the `_fbc` precedence logic, the Safari lifetime problem.
- With server-side GTM: nothing that the above does not remove more cheaply. It would move Meta and Reddit calls to a server container, but Sogverse already has a server that does this in about 650 lines with full knowledge of consent, role and product. sGTM would add hosting, a second unreviewed web form, and a place where the child and consent gates would have to be re-implemented. I would not adopt it.
- With a commercial consent platform: nothing. The banner is the small, settled part of this system; a CMP knows nothing about gamers or token URLs.

**Stays whatever is done:**

- Deciding per request and per document whether this is a child's session.
- The list of pages whose addresses are safe to disclose, and the `redirect` query problem on login and register.
- Consent checked on the server for every report.
- Keeping vendor automatic behaviour (matching, navigation reports) off.
- Choosing what each conversion means for campaign optimisation (free seat, paid seat, waitlist, purchase).
- Keeping the privacy policy true.

So: the problem is ordinary in four fifths of its surface and Sogverse has solved those parts in the ordinary way. It is harder than usual in one respect that is real (a children's service whose public and private pages share a document), and Sogverse has made that one respect harder again by letting an unreviewed container into the shared document and then fencing it.

## 7. Suggested order of work

1. **Widen the query allowlist** for standard ad and email parameters. Small, no sign-off, likely recovers Google Ads landings immediately. Verify first whether live Google Ads links carry `gbraid` / `gad_source`.
2. **Mint `_fbp` and `_fbc` first-party; decouple the twin from the container** (after the owner's decision on 2.5).
3. **Report the purchase** from the post-payment return.
4. **Hashes on page events for signed-in parents**, with the policy edit.
5. **Decide Option A or B** for where the pixels live. This is the decision that determines whether the fence code shrinks.
6. **Spike the document boundary.**
7. **Cross-tab withdrawal.**
8. With counsel: category-level policy wording, and the outstanding review of kept click ids.

## 8. What I could not determine

- **The container's actual contents.** I worked from the brief's description; I did not open GTM. Whether enhanced measurement is off, whether the Meta template's ecommerce box is ticked, and the exact triggers are unverified.
- **Why Meta shows +110% on ViewContent** (3.7).
- **Whether Reddit accepts an advertiser-minted `_rdt_uuid`.** No official source found.
- **Whether Meta formally permits pre-creating `_fbp`.** The documentation implies it and Meta's own library does it; I found no sentence saying so outright.
- **Whether Vercel passes IPv6 client addresses.** No official statement found.
- **Whether live ad links carry query keys the allowlist refuses.** Inferred from how Google Ads and others tag links; needs one look at real landing URLs or Vercel's request log.
- **How many visitors are affected by GTM-blocking.** No data read.
- **Feasibility of multiple root layouts in this tree** with the locale segment and existing providers.
- **Meta's exact wording for the "manual advanced matching" diagnostic.** I inferred its meaning from Meta's advanced matching documentation.
- **Legal conclusions.** The readings of Finnish law, GDPR and the vendor terms here are an engineer's, from public sources and (for Meta's terms) the Finnish-language page as fetched. Items in section 5 marked for counsel should go to counsel.
- **Minor line-number drift.** Line references in `consent-provider.tsx` are approximate; I cite functions by name there.
