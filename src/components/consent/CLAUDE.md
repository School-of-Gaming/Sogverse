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

A product page also tells the pixel which product it showed, as Meta's product view, and
only for a product we advertise — the same product-row rule the servers apply. It is not a
second reporting path: it goes through every gate and check the page view does, once per
product page reached, and it waits for the product to have been read rather than being
dropped when the read is slow.

**The checkout start is a click, reported from the browser.** A parent on an advertised
product's page who clicks into the sign-up flow — the create-an-account link while signed
out, or the button that enrols while signed in — is Meta's checkout start, for a free
product exactly as for a paid one, once per product page reached however many times they
click or retry. Joining a waitlist is not one, and neither is signing in. The click usually
navigates, so the event goes out synchronously inside the click handler, while the address
bar still shows the product page, or not at all: when the library has not arrived yet the
click is dropped rather than queued, because a queued event would be replayed against
whatever URL the tab shows by then. It never loads the library and never holds up the
parent's navigation. Same gates as the views, same address-bar check at the moment of
sending.

**A checkout start counts attempts, not people, and that is accepted.** The once-per-page
memory dies with the document, and every sign-in ends in a full load, so a parent who
creates an account and comes back to enrol is two checkout starts for one sign-up, and so
is one who abandons Stripe and retries. Meta keeps both — it deduplicates only a browser
event against its server twin, never two from the browser. The enrolment itself is still
reported exactly once, and that is the number a campaign is judged on; the checkout start
is a higher-volume signal for steering delivery, where the same parent twice changes
nothing about who Meta looks for. Making it once per person would mean storage of our own
that the withdrawal sweep then has to clear — not worth building unless someone reports
or bids on checkout starts as a figure in itself.

From our servers, through Meta's Conversions API (`src/lib/meta-conversions.server.ts`),
each one sent after the response has gone out so it can neither delay nor fail what the
family asked for:

- **an account was created** — reported as a lead, someone reachable who has committed to
  nothing, and naming the product whose page the sign-up started from when that was an
  advertised product's page;
- **an enrolment** — a seat taken or a place in a queue accepted, carrying which of the
  two it was.

Handing a parent to Stripe is reported from neither side to Meta: its checkout start is the
browser's click above, and a server report as well would count every paid attempt twice.
(Analytics still hears it, as its own `checkout` push from the panel.)

The enrolment, the lead from a product page, and the browser's product view and checkout
start, name the product in Meta's standard product fields, built in one place so they cannot describe one product two
ways: its id, its English name whatever the visitor's locale, its topic as the category —
an enum value, stable across renames, and the axis a campaign is run per — and the price
the family pays with its currency, zero for a free product. A paid product with no price in the currency
states no value at all rather than a guessed one. **A queue place carries no value**: a
waitlisted enrolment drops the value and currency in the server report itself, whatever the
caller passed, because nobody has paid or committed to pay and a priced queue would train a
campaign to count a full product's waitlist as revenue. **A lead carries no value either**,
for the same reason and by the same rule in the server report. On the browser's two product
events these are only facts the product's public page shows anyone. On the server's
enrolment they ride beside the parent's email and account-id hashes, so Meta learns that an
identifiable parent signed up for that named club, camp or event — which the privacy policy
says — and on a lead, that an identifiable parent opened an account from that product's page.

**Which product a lead names comes from the register page's own `?redirect=`**, the product
page the visitor left to create an account. Both forms send it in the registration body —
the password form from its address, the finish page of a Google sign-up from the intent it
carried across the round trip — and the server treats it as untrusted: resolved through
`resolveInternalPath()`, matched on its locale-stripped internal path, accepted only as a
shop product page, and read through the anon client after the response has gone out.
Anything else — no redirect, another page, an unknown or unadvertised product, a failed
read — sends the lead without a product, and never touches the registration. The lead's
`event_source_url` stays the register page, which is where the account was created.

Each server report is gated on the **request's own consent cookie**, so a conversion for
someone who refused marketing is impossible rather than unlikely. Products we do not
advertise — a municipality club, or anything invoiced off-platform — are refused **by the
product row, never by the URL it was reached from**. No role check is needed on that side:
the three routes are customer-only, so a gamer cannot reach one.

**What identifies a person in a server report, exhaustively:** the user agent, the IP the
request arrived from, Meta's own browser and click cookies if the browser carries them, a
SHA-256 hash of the parent's own account email (Meta's advanced matching), and a SHA-256
hash of the parent's own account id (Meta's `external_id`) — both hashed on our server, so
neither the address nor the id is ever sent or logged, and never a gamer's. The address is
sent whether or not it has been verified; that is standard practice and accepted as such.
The id hash is the same on every report for that account, so Meta can join one parent's
events across visits and devices. With the product fields above, that tells Meta which
product an identifiable parent signed up for, or opened an account from. No name, and
nothing about a child beyond that — not their name, age, account or its id, or anything
else. The privacy policy's Meta entry says
this in plain words; adding a field there is a privacy-policy edit.

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
worth knowing why rather than adding one back. Both advertising scripts load on marketing
and read no other purpose, so a document with either of them running has nothing left to
tell them: the one change they could need to hear is marketing taken away, which is the
paragraph above. A purpose being added was off until then, so the scripts it covers are
not in the document yet, and the answer travels with their load.

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

## Reading what the platforms received

Checking a change against the vendors' own screens goes wrong in the same few ways, so
they are written down here.

- **Neither destination is Sogverse's alone.** The Sogverse and Sogverse Staging streams
  are web data streams inside the **sog.gg - GA4** property, not properties of their own,
  and the live Meta pixel is shared with the marketing site and School of Gaming's other
  sites. Filter by stream, or by an event name only Sogverse sends, before reading a count.
- **Judge delivery by GA4, never by the browser's network panel.** Google's tag holds
  events for several seconds and sends whatever it holds as the page unloads. A push
  followed by a full-page navigation is therefore delivered, but the request is not
  visible in the tab afterwards. The collect endpoint also answers `204` whether it counts
  a hit or discards it. DebugView and Realtime are the evidence. On a new stream Realtime
  can lag 15 to 25 minutes, and the stream list's "No data received" badge lags far longer.
- **GTM Preview and Tag Assistant cannot work here.** Preview adds a `gtm_debug` parameter
  to the URL, and the query allowlist refuses any parameter it does not know before the
  container is fetched, so a previewed page never loads the container. That is the
  privacy gate doing its job. Admitting the parameter would leak nothing, but it widens a
  deliberately narrow gate.
- **The property carries an `Internal Traffic` data filter in Testing state.** No stream
  defines internal-traffic rules for it to match, so it changes nothing. Switched to
  Active, office traffic vanishes from the reports, which looks exactly like the site
  having stopped reporting.
- **Events Manager will not show the parameters we send.** Meta displays this dataset's
  custom data and referring URLs as `_removed_`, so `outcome` cannot be read there.
