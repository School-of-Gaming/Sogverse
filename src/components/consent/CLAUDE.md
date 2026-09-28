# Cookie consent and the advertising scripts

This directory holds the consent question, the answer, and the two advertising scripts the
answer switches on: Meta's pixel, and the Google Tag Manager container. The strip's own
layout rules live in `src/components/layout/`; what is written here is those scripts —
where they may run, what leaves the browser, what leaves our servers, and how a withdrawal
takes effect. Everything below governs both unless it names one of them.

## Four gates in front of an advertising script, and two more that are the page

A script loads only when all of these hold, and every one of them is decided in the
browser:

1. **Marketing is granted** on this device, from the consent cookie — the same purpose
   for both scripts. A container mints a persistent client id and carries advertising
   tags, so it is an advertising recipient and nothing else; `analytics` covers Vercel's
   cookieless counting alone, which is what the strip and the privacy policy describe it
   as. A refusal, and a question still unanswered, loads neither script: no code, no
   request to either vendor. Consent Mode is sent all the same — everything denied, then
   the granted state — because a Google tag that has not been told what it may store is
   not permitted to guess for EEA or UK traffic.
2. **This is a client render**, not the server one and not the hydration one — the gate
   reads false on both, so the SSR HTML and the first client render agree.
3. **The visitor is not, and cannot be, a signed-in gamer.** Anonymous is fine; a
   signed-in visitor whose role is known and is not `gamer` is fine; anything else —
   still loading, or signed in with a profile we could not read — is not. A child's
   browsing never reaches an advertising platform on any surface, whatever a parent once
   answered on a shared device.
4. **The vendor's id is configured**, and is an id rather than a placeholder — a run of
   digits for the pixel, a `GTM-` id for the container. Unset means that script is off;
   for the pixel it also means our servers report nothing, one switch for both.

## Why they load only on marketing pages

An advertising script reports the page it runs on: Meta's library sends the page's own URL
and the document's referrer with every event, and a container tag reads whatever it is
configured to read. Some of our URLs are secrets — a password reset, a PIN reset, an email
verification and a seat offer each carry a single-use token in the query string — and
others name a child by id. A script mounted on every page would hand all of them to an
advertising platform, and no amount of care about *what events we send* would help,
because the URL travels with each one.

So an advertising script is allowed on an **allowlist of marketing pages**
(`src/lib/marketing-pages.ts`) and nowhere else: public pages a stranger can be sent to by
an ad, carrying no token and identifying nobody. The list is a **safe default rather than
a forcing check** — a page missing from it simply gets no script, which costs a
measurement, where a page wrongly on it costs a secret. That asymmetry is why there is no
completeness test demanding every route be classified: such a test only adds a place for a
new page to be waved through.

Six knobs hold that promise, and all six are load-bearing:

- **The allowlist** decides where a page view may be reported from at all.
- **Each script's automatic page view on client navigation is turned off** in the loader,
  so neither reports anything by itself. **A loaded script is not an inert one**, and the
  two vendors differ in how far that goes. The pixel is one library with one job and a
  flag that stops it reporting navigations, so once loaded it genuinely does nothing
  unasked. The container is a loader for whatever somebody configured, it stays loaded for
  the whole document, and every tag in it reads `document.location` at the moment it
  fires — so "it only loaded on a marketing page" says nothing at all about which page it
  reports. What keeps it quiet on the pages afterwards is the blocklist below and nothing
  else.
- **The container is loaded inside a blocklist it cannot lift**, naming every class
  capable of bringing in code or a third party, and **all nine of Google's automatic
  trigger listeners** — click, link click, form submit, timer, history, scroll depth,
  element visibility, JavaScript error and YouTube. The Tag Manager UI is a surface edited
  in a web form with no review and no deploy, so this is the one control this repository
  keeps over it: a tag added there cannot run arbitrary JavaScript on a platform children
  sign into, and cannot be fired by anything the visitor does after the page it was loaded
  on. The blocklist reaches *triggers*; it does not reach an analytics tag's own enhanced
  measurement, which reports page views, scrolls and outbound clicks from inside the tag.
  That switch lives in the analytics property, no code here can touch it, and it is the
  first of the constraints at the bottom of this file.
- **The page identity the analytics library holds is pinned, from the moment the container
  loads.** The blocklist reaches *triggers*, and the analytics tag's own automatic page
  view is turned off where that switch lives — in the container's configuration, not in
  any code here — but neither reaches the events the library **generates for itself**, an
  engagement event on unload above all, which is nobody's tag, answers to no trigger, and
  reads the live document at the moment it sends. So a container loaded on a marketing
  page and then client-navigated into a private one names that private page; on a child's
  page that is the child's record id, and the page title can be the child's name. The app
  therefore pins `page_location` and `page_title` through a `set` command, whose values are
  **sticky** — they stand until the next pin replaces them.

  **The pin is not a report, and is deliberately not gated like one.** It goes in as soon
  as the container has loaded, on the marketing path and the vetted query that authorised
  that load, and *before* the checks that decide whether a page view may still be sent. A
  visitor who navigates away mid-load gets no page view — but the library will still hold
  *something*, and the only alternative to a page we chose is the page it reads for
  itself. Refusing to pin is refusing to answer, and the default answer is the live
  document, which is the worst value available rather than a neutral one. The cost is that
  engagement time spent on a private page is attributed to the marketing page the visitor
  came from, which is the right way round.

  The pinned location keeps its query string, because that is the same allowlist that
  permitted the report: the campaign keys and click ids may travel, the analytics platform
  derives attribution from them, and stripping them would discard what the policy already
  blessed while protecting nothing. The title is pinned to a fixed string rather than the
  document's own, because the router updates `document.title` on its own schedule and
  reading it here can capture the *previous* page's — which is precisely the private one.
  Pinning the same two fields through the container's configuration settings instead does
  **not** work: they are honoured for the tags' own sends and ignored for the generated
  events, which was tested on the wire before this was built.
- **`Referrer-Policy: strict-origin`** site-wide (set in `next.config.ts`), so a
  same-origin navigation — from a reset link to the login page, say — cannot hand the next
  document a referrer carrying the token.
- **A report is sent only once the script has loaded, and only if the address bar still
  shows an allowed page with an allowed query** — the paragraph below.

**A page view is never queued for a script to replay.** Meta's stub queues a call made
before its library has downloaded and replays it on arrival against the URL the tab shows
*then*; the container's queue is read the same way. A parent can client-navigate from a
shop page into a child's page inside that window. So a report waits for the script to
load, then re-reads the address bar: the tab must still be on the page that authorised the
report, and the query string must carry only campaign keys, the platforms' click ids and
the shop's own filter state. The second check is what keeps
`/login?redirect=/parent/gamers/<id>` — the proxy's bounce for a signed-out parent — from
ever being reported, even though the login page itself is a marketing page — and the same
check runs before either script is loaded at all, so such a page never has their code in
it. A visitor who moved on gets no report for either page; a query with anything else in
it gets none.

**An event other than a page view may sit in the container's queue, and the distinction is
worth keeping straight.** What makes a page view unsafe to queue is not its payload but
its *permission*: the question is whether the tab is still on the page that authorised a
report, and that answer expires. An event states the page it happened on as a field of its
own, so it is still a true statement whenever the container gets to it.

## What the platforms are told

From the browser: one page view per marketing page *reached* — a re-render is not a view,
and coming back to a page after another one is. The pixel is told Meta's own event name;
the container is pushed the **internal path** — locale prefix removed and the slug
untranslated, with the record's own id kept, so one row covers every language's slug while
one product is still one page. Every event the browser pushes states that same field the
same way, which is what lets a view and the enrolment that followed it meet in one funnel
instead of forking into a template row and a concrete one.

From our servers, through Meta's Conversions API (`src/lib/meta-conversions.server.ts`),
each one sent after the response has gone out so it can neither delay nor fail what the
family asked for:

- **an account was created** — reported as a lead, someone reachable who has committed to
  nothing;
- **an enrolment** — a seat taken or a place in a queue accepted, carrying which of the
  two it was;
- **a checkout was started** — deliberately a different event name, because the platform
  optimises a campaign on the name and an abandoned checkout must not train it as an
  enrolment.

Each server report is gated on the **request's own consent cookie**, so a conversion for
someone who refused marketing is impossible rather than unlikely. Products we do not
advertise — a municipality club, or anything invoiced off-platform — are refused **by the
product row, never by the URL it was reached from**. No role check is needed on that side:
the three routes are customer-only, so a gamer cannot reach one.

**What identifies a person in a server report, exhaustively:** the user agent, the IP the
request arrived from, and Meta's own browser and click cookies if the browser carries them.
No email, no name, no user id, and nothing whatsoever about a child. Adding a field there
is a privacy-policy edit.

A completed purchase is reported nowhere today. When it is, it belongs on the same
server-side path, from the payment webhook — which is the only place that knows money
arrived.

## Withdrawal

Granting a purpose needs nothing beyond the state update: the gated components mount, and
each script is handed the new answer as it loads.

**Revoking one is not the mirror image of that, and no message can stand in for it.** A
script that has already installed itself on the document goes on running whatever it has
installed, and what it has already sent has already been sent — so a withdrawal deletes
the advertising scripts' own cookies, clears what either of them keeps in web storage, and
reloads. The new document has neither script in it, and starts from everything denied like
any other.

**There is deliberately no way to tell a running script that the answer grew**, and it is
worth knowing why rather than adding one back. Both advertising scripts load on marketing,
which is the fullest of the three answers the strip offers — so a document with either of
them running is a document whose visitor has already said everything there is to say. Any
later change to that answer takes a purpose away, which is the paragraph above. An
addition is therefore always an addition to a document that had neither script in it, and
the answer travels with the load.

Two things about the cookies. They are walked across every domain the page could have set
them on, because both vendors write on the registrable domain while our pages are served
from a subdomain. And the names are **read back off the document by prefix rather than
expired from a list**: the container's analytics cookies carry a property id in their own
names, decided in the Tag Manager UI and unknowable here. A cookie that survives a
withdrawal goes on identifying the same browser to the same platform — including from our
own server-side reports, which read these back off a later request.

**Web storage is not a second copy of the cookie list, and it cannot be derived from
it.** Both vendors keep a storage twin of a click id they also write to a cookie, under a
name the cookie list would never predict, so the two halves are separate lists kept
separately, and the storage half spans both vendors rather than the pixel alone. A click
id deleted from the cookie and left in storage is the same click id, and leaves the device
re-identifiable the moment the scripts are allowed to run again — which is the whole of
what a withdrawal is for. So this half is pinned to a browser rather than reasoned out:
the keys are whatever the two libraries were observed to write on a granted visit arriving
from an ad, both stores are swept because an observation cannot say the empty one will
stay empty, and the tests pin what was seen.

**And the clearing happens in two places, which is not belt and braces but two different
jobs.** Deleting before the reload races a script that is still running: the analytics
library rewrites its own session cookie as the document is torn down — measured at about a
third of a second after the deletion — and the reload then arrives too late to matter,
leaving a cookie no later document will ever remove, because consent is now refused and
the script never loads again. So the deletion before the reload is best-effort, and the
guarantee is a standing invariant checked on every mount: **an advertising cookie may
exist only in a document where marketing is granted.** In a document where it is not,
nothing is running to undo the clearing, which is the whole of why it holds. Stating it as
an invariant rather than as a step in the withdrawal also buys two things the withdrawal
path could not: it clears whatever an earlier failure stranded, with no migration and no
list of affected browsers, and it clears what the legacy site leaves on the registrable
domain, which sets its tags without asking anybody.

## What a new recipient does and does not cost

The privacy policy names the platforms and what each receives; the strip names none of
them, and asks about *purposes* instead. So what forces a consent-version bump — which
asks everyone who answered the old question again — is **the question changing**: a
purpose added, a purpose withdrawn, or a purpose that comes to cover something a reader
would not have taken it to cover. A further recipient *inside* a purpose that already
covers it is a privacy-policy edit alone: the sentence the visitor agreed to is unchanged,
and re-asking would put the banner back up to collect the same answer to the same words.

## Constraints on whoever configures the container

The Tag Manager UI is edited in a web form, with no review, no deploy and nothing in git.
The loader's blocklist is the only part of it this repository can enforce; everything
below is a promise the app makes that only the person configuring the container can keep,
and each one is load-bearing rather than tidy.

- **Turn off enhanced measurement's page views in the Analytics property.** Enhanced
  measurement reports a page view on every browser history change, from inside the
  analytics tag — the blocklist reaches container triggers and cannot reach this. Left on,
  the tag reports every private page the visitor walks to after the marketing page that
  loaded the container: a child's page by id, a reset link with its single-use token. It
  is the one setting that can undo the whole design from a screen no code here can see.
- **Every tag takes the page from the pushed field, never from the address bar.** Set
  `page_location` and `page_path` on each tag from the `page_path` the app pushes with the
  event. A tag left to its default reads `document.location` at the moment it fires, and a
  push can outlive a navigation — so the default reports whatever the tab happens to be
  showing, which is exactly the URL the app went to the trouble of not sending.
- **Meta never goes in the container.** The pixel is loaded directly and its conversions
  are reported server-side; a Meta tag here would double-count every page view with no
  event id to deduplicate against, and it would move a recipient behind a surface that has
  no review.
- **Whole tag types and every automatic trigger are blocked, and will silently never
  fire** — so nothing may be built on one. Blocked classes: Custom HTML and Custom
  JavaScript, custom templates from the gallery, and anything that runs a script, requests
  a pixel or injects a frame from a non-Google domain. Blocked triggers: all nine built-in
  listeners — click, link click, form submit, timer, history, scroll depth, element
  visibility, JavaScript error and YouTube. What is left is Google's own analytics and Ads
  tags, fired on the events the app pushes. A real need for one of the blocked ones is a
  conversation and a change in the loader, never a workaround in the UI.
