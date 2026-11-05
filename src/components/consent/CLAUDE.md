# Cookie consent and the advertising scripts

This directory holds the consent question, the answer, and the one advertising script the
answer switches on: the Google Tag Manager container. Meta's and Reddit's browser pixels
are tags inside it, configured in Tag Manager by the partner who runs our campaigns. Our
servers report the same moments to Meta and Reddit through their Conversions APIs. The
strip's own layout rules live in `src/components/layout/`; what is written here is where
the container may run, what leaves the browser, what leaves our servers, and how a
withdrawal takes effect.

## Four gates in front of the container, and two more that are the page

The container loads only when all of these hold, and every one of them is decided in the
browser:

1. **Marketing is granted** on this device, from the consent cookie. A container mints a
   persistent client id and carries advertising tags, so it is an advertising recipient
   and nothing else; `analytics` covers Vercel's cookieless counting alone, which is what
   the strip and the privacy policy describe it as. A refusal, and a question still
   unanswered, loads nothing: no code, no request to any vendor. Consent Mode is sent all
   the same — everything denied, then the granted state — because a Google tag that has
   not been told what it may store is not permitted to guess for EEA or UK traffic.
2. **This is a client render**, not the server one and not the hydration one — the gate
   reads false on both, so the SSR HTML and the first client render agree.
3. **The visitor is not, and cannot be, a signed-in gamer.** Anonymous is fine; a
   signed-in visitor whose role is known and is not `gamer` is fine; anything else —
   still loading, or signed in with a profile we could not read — is not. A child's
   browsing never reaches an advertising platform on any surface, whatever a parent once
   answered on a shared device.
4. **The container id is configured**, and is a `GTM-` id rather than a placeholder.
   Unset means no container and so no browser report to anyone. The Meta and Reddit pixel
   ids in the environment are not browser gates: they name where our *servers* report,
   and unset turns that platform's server reports off. The browser tags carry their own
   copy of the id, typed into Tag Manager.

## Why it loads only on marketing pages

An advertising script reports the page it runs on: Meta's and Reddit's libraries send the
page's own URL with every event, Meta's the document's referrer too, and any other tag
reads whatever it is configured to read. Some of our URLs are secrets — a password reset,
a PIN reset, an email verification and a seat offer each carry a single-use token in the
query string — and others name a child by id. A script on every page would hand all of
them to an advertising platform, and no amount of care about *what events we send* would
help, because the URL travels with each one.

So the container is allowed on an **allowlist of marketing pages**
(`src/lib/marketing-pages.ts`) and nowhere else: public pages a stranger can be sent to by
an ad, carrying no token and identifying nobody. The list is a **safe default rather than
a forcing check** — a page missing from it simply gets no script, which costs a
measurement, where a page wrongly on it costs a secret. That asymmetry is why there is no
completeness test demanding every route be classified: such a test only adds a place for a
new page to be waved through.

But a container stays loaded for the whole document, and the app client-navigates, so
"it loaded on a marketing page" says nothing about which page it reports later. Six knobs
hold the promise, and all six are load-bearing:

- **The allowlist** decides where the container may load and an event may be reported
  from at all.
- **The container runs inside fences it cannot lift**, pushed ahead of it into
  `dataLayer` (`src/lib/gtm.ts`). The Tag Manager UI is a web form with no review and no
  deploy, so these are the one control this repository keeps over it:
  - an **allowlist** admitting Google's own tags and templates — Meta and Reddit ship
    their tags only as templates;
  - a **blocklist** refusing Custom HTML, Custom JavaScript variables, Custom Image tags,
    Google's built-in non-Google tag types, the 1st-Party Cookie, JavaScript Variable and
    DOM Element variables (the Supabase session cookies are readable by page script, and
    any of the three could feed a session or a child's name into an admitted tag's field),
    and **all nine automatic trigger listeners** —
    click, link click, form submit, timer, history, scroll depth, element visibility,
    JavaScript error and YouTube — each of which would fire with whatever page the tab
    shows by then;
  - a **template policy** (`src/lib/gtm-policy.ts`), because Google cannot admit one
    template and not another: any template, a hand-written one included, may load scripts
    only from Google, Meta's `fbevents.js` and Reddit's generic `pixel.js`, send beacons
    and frames only to Google's hosts and the two vendors' transports, touch only the
    vendors' globals and Google's, read only the vendors' and Google's own ad and
    analytics cookies, and never run arbitrary JavaScript or HTML.

  Under the production CSP's `'strict-dynamic'`, anything the container inserts is
  trusted transitively, which is why the fences, not the CSP's host list, decide what a
  tag may load.
- **No vendor reports anything by itself.** The app installs Meta's and Reddit's globals
  before the container (`src/lib/ad-pixel-stubs.ts`), and both vendors' templates use a
  global they find rather than building their own. Ours keep Meta's library from reporting
  a page view on every client navigation and from taking Automatic Advanced Matching —
  lifting emails, phone numbers and names out of the page — from Meta's dashboard; no tag
  setting can turn either back on. Reddit's library fetches a configuration from Reddit's
  Events Manager that can add event rules fired on URL changes and clicks, automatic
  matching and page scraping, and has no switch for any of it. **The CSP is that switch**:
  it leaves the configuration host and the event setup tool's host out of `connect-src`,
  so the fetch fails. That needs the generic library, because the copy Reddit serves when
  asked by pixel id — which is what Reddit's template asks for — has the configuration
  inlined, past any CSP. So the policy refuses the template's request and our Reddit
  global loads the generic copy itself. Those two hosts stay out; adding one hands a web
  form nobody here reviews the power to report private pages and lift form fields.
- **The page identity the analytics library holds is pinned, from the moment the container
  loads.** The blocklist reaches *triggers*, and the analytics tag's own automatic page
  view is turned off in the container's configuration, but neither reaches the events the
  library **generates for itself**, an engagement event on unload above all, which answers
  to no trigger and reads the live document at the moment it sends. So a container loaded
  on a marketing page and then client-navigated into a private one names that private
  page; on a child's page that is the child's record id, and the page title can be the
  child's name. The app therefore pins `page_location` and `page_title` through a `set`
  command, whose values are **sticky** — they stand until the next pin replaces them.

  **The pin is not a report, and is deliberately not gated like one.** It goes in as soon
  as the container has loaded, on the marketing path and the vetted query that authorised
  that load, *before* the checks that decide whether a page view may still be sent: the
  library will hold *some* page, and the only alternative to one we chose is the live
  document. The cost — engagement time on a private page attributed to the marketing page
  the visitor came from — is the right way round. The location keeps its vetted query,
  since the campaign keys and click ids are what the allowlist exists to let travel; the
  title is a fixed string, because `document.title` can still be the *previous*, private
  page's. Pinning the same fields in the container's configuration settings does **not**
  work: they are ignored for the generated events, which was tested on the wire.
- **`Referrer-Policy: strict-origin`** site-wide (set in `next.config.ts`), so a
  same-origin navigation — from a reset link to the login page, say — cannot hand the next
  document a referrer carrying the token.
- **An event is pushed only while the address bar still shows the page that authorised
  it, with an allowed query** — the paragraphs below.

**A page view is never queued for a script to replay.** It waits for the container to
load, then re-reads the address bar: the tab must still be on the page that authorised the
report, and the query must carry only campaign keys, the platforms' click ids, the shop's
own filter state, or a `redirect` whose value is itself a reportable marketing page. The
second check keeps `/login?redirect=/parent/gamers/<id>` — the proxy's bounce for a
signed-out parent — from ever being reported; it also runs before the container is loaded,
so such a page never has its code in it. The vendor globals hold the same line one step
later: a vendor's own stub replays a report made before its library arrived against
whatever URL the tab shows *then*, while ours drop it if the tab has left the page it was
made on.

**`redirect` is the one key judged by its value.** It travels only when the value, resolved
through `resolveInternalPath()` and matched on its locale-stripped internal path, is itself
a marketing page whose own query passes the plain list — so the register and login pages a
parent reaches from a product page or a landing page's guide are reported, and the proxy's
bounce is not. A `redirect` inside a `redirect` refuses rather than being followed, and
every occurrence of a repeated one is checked. The value must already be in the canonical
form it is matched in — handed back unchanged by the URL parser, with no empty path segment
and no `%` in its path — because a vendor library reports the raw address, so a dot
segment, a backslash or an encoded slash that a rewriting would turn into a marketing page
refuses.

**The query allowlist is one list for every platform, so each platform's click id reaches
all of them.** A page reached from a Reddit ad loads Meta's tag too, and it sees `rdt_cid`
in the address, exactly as Reddit sees `fbclid` and `gclid`. That is accepted: a click id
is an opaque token naming one ad click, the visitor has allowed marketing for every
platform at once, and a per-platform list would split one gate into several for no
protection a reader could name.

**Any other event may sit in the container's queue**, because what makes a page view unsafe
to queue is not its payload but its *permission* — whether the tab is still on the page
that authorised it, an answer that expires. Every other event states its page as a field
of its own, so it is still a true statement whenever the container gets to it.

## What the container is pushed

**`dataLayer` carries the whole funnel, complete enough that a tag can be built on any step
without a change here** (`src/lib/gtm-events.ts` has the names and why each):

- `page_view` — one per marketing page *reached*: a re-render is not a view, and coming
  back to a page after another one is;
- `view_item` — a product page showed its product, once per product page reached, once the
  product has been read; it loads the container itself if the page view has not yet;
- `add_to_cart` — the click into the sign-up flow from a product's page (below);
- `sign_up` — a parent account was created;
- `child_added` — a parent added a child from a product's sign-up panel; adding one from
  the family's own dashboard pushes nothing;
- `enrolment` — a seat or a queue place was taken, with `outcome` saying which;
- `begin_checkout` — the parent was handed to Stripe.

- **Every push names its page as `page_path`, the internal path** — locale prefix removed
  and the slug untranslated, with the record's own id kept — so one row covers every
  language's slug while one product is still one page, and a view and the enrolment that
  followed it meet in one funnel.
- **Every push carries its own `event_id`**, the key each platform deduplicates a browser
  event against its server twin by (next section). Minted per push, never per page: a
  second view of a page is a second event.
- **Every product event names its product in GA4's `ecommerce` shape**, built from the same
  facts as the server reports' fields, plus the same product as `meta`, the object Meta's
  template takes whole (Reddit's reads `ecommerce` itself), and **is pushed for every
  product with `advertised` beside it**. Analytics counts them all; an advertising tag fires only where `advertised`
  is `true`. A `sign_up` carries no `advertised`: it names a product only when the
  server's lead would, so its tag fires on every one. A queue place, a lead and a child
  added carry no value, on this side as on the server's.
- **Every push is preceded by `{ ecommerce: null, meta: null }`.** The container merges
  pushes into one model that keeps what it was last told, so without the reset an event
  leaving a field out reads the previous event's — a queue place priced at the view before
  it.

**The checkout start is a click.** A parent on a product's page who clicks into the sign-up
flow — the create-an-account link while signed out, or the button that enrols while signed
in — pushes `add_to_cart`, for a free product exactly as for a paid one, once per product
page reached however many times they click or retry. Joining a waitlist is not one, and
neither is signing in. The click usually navigates, so the push is made inside the click
handler while the address bar still shows the product page, or not at all, and it never
loads the container or holds up the navigation.

**A checkout start counts attempts, not people, and that is accepted.** The once-per-page
memory dies with the document, and every sign-in ends in a full load, so a parent who
creates an account and comes back to enrol is two checkout starts for one sign-up, and so
is one who abandons Stripe and retries; each has its own id, so the platforms keep both.
The enrolment is still reported exactly once, and that is the number a campaign is judged
on. Once per person would need storage of our own that the withdrawal sweep then has to
clear — not worth building unless someone bids on checkout starts as a figure in itself.

## What our servers report

Through Meta's and Reddit's Conversions APIs, each sent after the response has gone out so
it can neither delay nor fail what the family asked for:

- **an account was created** — a lead (Meta's `Lead`, Reddit's `LEAD`): someone reachable
  who has committed to nothing, naming the product whose page the sign-up started from
  when that was an advertised product's page;
- **a child was added** — from a product's sign-up panel, on an advertised product's page
  (Meta's custom `ChildProfileCreated`, and Reddit's custom event of the same name):
  past the account, short of a seat. The panel sends the product's id with the create,
  and the route reports only when that product's row is one we advertise; no id (the
  family's own dashboard), an unknown product or an unadvertised one reports nothing.
  It names the product, unpriced, and says nothing about the child;
- **an enrolment** — a seat or a place in a queue (Meta's `CompleteRegistration`, Reddit's
  `SIGN_UP`), carrying which of the two it was to Meta. Reddit's event has no field for
  it, so Reddit tells the two apart only by the missing value on a queue place;
- **the browser's three moments** — the page view, the product view and the checkout start
  (Meta's `PageView`, `ViewContent` and `InitiateCheckout`; Reddit's `PAGE_VISIT`,
  `VIEW_CONTENT` and `ADD_TO_CART`), as server twins of the pushes. Once a push has gone
  out the browser posts it, id and all, to `/api/page-events` — a product event only for an
  advertised product — so a browser that blocked a vendor's library still has the event
  arrive, and one that let it through is counted once.

**Every server report shares its id with the browser's push.** For the lead, the child
added and the enrolment, the browser mints the id, sends it in the body of the request that commits the
action, and pushes under it once the route has answered; absent, the server mints its own.
For the three twins it is required, since a twin with no push to match is nothing. The
server hands it to Meta as `event_id` and to Reddit as `conversion_id`. It is validated as
a UUID and used for nothing else: the worst a forged one can do is make a platform discard
one of that client's own events.

**The page-event route trusts nothing in the body and re-applies every gate** from what the
server can see: the request's consent cookie, a session that is not a gamer's (a session
whose role cannot be read is refused), a marketing page whose query may travel — and for a
product event, an advertised product on its own shop page, read from its row. It answers
`204` at once whatever happened, so neither its status nor its timing says whether anything
was reported.

**A route reports once, to every platform at once** (`src/lib/ad-conversions.server.ts`),
with the product already described in each platform's fields; each platform's reporter
applies its own switch and the consent gate and swallows its own failures, so one platform
refusing or switched off leaves the other's report untouched. A new platform is added
there, never at a call site.

Handing a parent to Stripe is reported to neither platform from either side: its checkout
start is the earlier click, and a second report would count every paid attempt twice.
Analytics still hears it, as `begin_checkout`. A completed purchase is reported nowhere
today; when it is, it belongs on the server, from the payment webhook — the only place that
knows money arrived.

Every event naming a product names it in Meta's standard product fields and in Reddit's,
built from one place so they cannot describe one product two ways: its id, its English name
whatever the visitor's locale, its topic as the category — an enum value, stable across
renames, and the axis a campaign is run per — and the price the family pays with its
currency, zero for a free product. A paid product with no price in the currency states no
value at all rather than a guessed one. **A queue place, a lead and a child added carry
no value**, dropped
in the server report itself whatever the caller passed, because nobody has paid or committed
to pay and a priced queue would train a campaign to count a full product's waitlist as
revenue.

**Which product a lead names comes from the register page's own `?redirect=`**, the product
page the visitor left to create an account. Both forms send it in the registration body —
the password form from its address, the finish page of a Google sign-up from the intent it
carried across the round trip — and the server treats it as untrusted: resolved through
`resolveInternalPath()`, matched on its locale-stripped internal path, accepted only as a
shop product page, and read through the anon client after the response has gone out.
Anything else — no redirect, another page, an unknown or unadvertised product, a failed
read — sends the lead without a product, and never touches the registration. The lead's
`event_source_url` stays the register page, which is where the account was created.

Each server report is gated on the **request's own consent cookie**, so a report for
someone who refused marketing is impossible rather than unlikely. Products we do not
advertise — a municipality club, or anything invoiced off-platform — are refused **by the
product row, never by the URL it was reached from**. The lead, child-added and enrolment
routes are customer-only, so a gamer cannot reach one; the page-event route makes its own gamer check.

**What identifies a person in a server report, exhaustively:** the user agent, the IP the
request arrived from, the platform's own browser and click cookies if the browser carries
them (Meta's `_fbp` and `_fbc`, Reddit's `_rdt_uuid` and `_rdt_cid` — each platform is sent
only its own) or, where the click cookie is missing, that platform's click id kept in our
attribution cookie (Meta's in the `_fbc` format, `fb.1.<landing ms>.<fbclid>`; Reddit's as
the link carried it) — and, **on the lead, the child added and the enrolment only**, a
SHA-256 hash of the
parent's own account email and a SHA-256 hash of the parent's own account id
(`external_id`), both hashed on our server, so neither the address nor the id is ever sent
or logged, and never a gamer's. **The three page-event twins carry no account, even from a
signed-in parent**: they tell a platform that a browser reached a page or a product, never
that an identifiable parent did, which the privacy policy does not describe.

**The two platforms canonicalise the email differently before hashing**: Meta trims and
lowercases; Reddit also removes every dot from the local part and drops everything from a
`+` on, so one address hashes to two different values and neither may be "fixed" to match
the other. The address is sent whether or not it has been verified; that is standard
practice and accepted as such. The id hash is the same on every report for that account, so
each platform can join one parent's leads, children added and enrolments across visits and
devices. With the product fields, that tells the platform which product an identifiable
parent signed up for, opened an account from, or added a child while signing up for. No
name, and nothing about a child beyond that — the child-added event says only that this
parent added one, never their name, age, account or its id, how many there are, or
anything else. The privacy policy's entry for each platform says
this in plain words; adding a field is a privacy-policy edit.

## Withdrawal

Granting a purpose needs nothing beyond the state update: the gated components mount, and
the container is handed the new answer as it loads.

**Revoking one is not the mirror image of that, and no message can stand in for it.** A
script that has already installed itself on the document goes on running whatever it has
installed, and what it has already sent has already been sent — so any withdrawal reloads.
Withdrawing marketing also deletes the advertising scripts' own cookies and clears what
any of them keeps in web storage first; the new document has none of them in it, and
starts from everything denied like any other. Withdrawing analytics alone reloads and
clears nothing: Vercel's components leave their scripts installed when they unmount, so
only a new document stops them, while the advertising scripts' state belongs to marketing,
which is unchanged.

**There is deliberately no way to tell a running container that the answer grew**, and it
is worth knowing why rather than adding one back. The container loads on marketing and
reads no other purpose, so a document with it running has nothing left to tell it: the one
change it could need to hear is marketing taken away, which is the paragraph above.

Two things about the cookies. They are walked across every domain the page could have set
them on, because the vendors may write on the registrable domain rather than on the page's
own host, and staging is served from a subdomain. And the names are **read back off the
document by prefix rather than expired from a list**: the container's analytics cookies
carry a property id in their own names, decided in the Tag Manager UI and unknowable here.
A cookie that survives a withdrawal goes on identifying the same browser to the same
platform — including from our own server-side reports, which read these back off a later
request.

**Web storage is not a second copy of the cookie list, and it cannot be derived from
it.** The vendors keep a storage twin of a click id they also write to a cookie, under a
name the cookie list would never predict, so the two halves are separate lists kept
separately. A click id deleted from the cookie and left in storage is the same click id,
and leaves the device re-identifiable the moment the scripts are allowed to run again —
which is the whole of what a withdrawal is for. So this half is pinned to a browser rather
than reasoned out: the keys are whatever Meta's and Google's libraries were observed to
write on a granted visit arriving from an ad, both stores are swept because an observation
cannot say the empty one will stay empty, and the tests pin what was seen. **Reddit's are
the exception, and say so**: its cookie family and its one storage key were read off its
library's source, not observed on a visit, so the cookies are swept by their shared prefix
and the key is pinned as read rather than as seen — replace that with an observation once
one is made.

**And the clearing happens in two places, which is not belt and braces but two different
jobs.** Deleting before the reload races a script that is still running: the analytics
library rewrites its own session cookie as the document is torn down — measured at about a
third of a second after the deletion — leaving a cookie no later document would remove,
because consent is now refused and the script never loads again. So the deletion before
the reload is best-effort, and the guarantee is a standing invariant checked on every
mount: **an advertising cookie, or our own attribution cookie, may exist only in a
document where marketing is granted.** Where it is not, nothing is running to undo the
clearing. As an invariant it also clears whatever an earlier failure stranded, and what the
legacy marketing site left on the registrable domain.

## The attribution cookie

**`sog_attribution` is ours: first party, no vendor sets or needs it, and it is the one
cookie here that is not an advertising script's.** It sits behind marketing all the same,
because it keeps a campaign link's tag on the device (`src/lib/utm.ts` has the legal
reasoning). It holds the latest tagged link's five values, and the latest Meta `fbclid`
and Reddit `rdt_cid` an ad link carried, each with the time it landed. **A landing replaces
only what it carries**: a tagged link replaces the whole tag, a link with an `fbclid`
replaces the Meta id and leaves the Reddit one, and a link carrying neither writes nothing.
Every part is read as absent 30 days after its own landing, so a later write renewing the
cookie never stretches an older part's life; a tag kept before landing times were recorded
is read as it stands and dropped on the next write rather than renewed. The proxy writes it
when a landing request already carries marketing consent; otherwise the proxy passes the
values to the page in memory, and the banner writes them if marketing is accepted during
that document's life. Both writers merge into the cookie they can see. Neither writes it
for a signed-in gamer, or for a session whose role is unknown.

**The click ids are there for one reader: each platform's server report.** A vendor's
library turns its platform's click id into its own click cookie only if it loads while the
id is still in the address bar, and it loads only once marketing is granted, on a marketing
page — so a parent who answers the banner a few pages after landing would otherwise convert
with no click on record. The report sends the vendor's own cookie where there is one and the
kept id where there is not, and never the other platform's. A click id is never stored on
an account or a booking and never reaches Klaviyo. Google's `gclid` is not kept, because no
server report reads it. Keeping the click ids is newer than counsel's ruling on the tag and
has not had a legal review of its own (`src/lib/utm.ts`).

**The tag stands ahead of the click ids in the byte budget.** The tag is measured alone and
dropped whole when it does not fit; each click id is added only into the room the tag
leaves, so a long `fbclid` can never cost a parent their tag.

**It is not httpOnly because the banner writes it from client code**, so a script in the
page can read it. A value it holds is therefore never trusted: it is sanitised again on
every read.

Withdrawing marketing deletes it with the advertising cookies, and the mount invariant
above removes it from any document where marketing is not granted.

**Consent is checked again at read, off the request itself.** A tag or click id written
during consent is usable only while the request storing or reporting it still carries
marketing consent, so a cookie that outlived its consent stores and reports nothing, even
before a document has mounted to remove it.

**It did not change the question (owner's ruling, 2026-10-30).** Marketing consent already
governed storing the tag, so the cookie is a change in how that is kept: the banner names
no cookie, the privacy policy describes it, and the consent version stayed where it was.

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
The fences above are what this repository enforces; everything below is a promise the app
makes that only the person configuring the container can keep, so each one has to reach
the marketing team in whatever setup instructions they are sent.

- **Only Meta's and Reddit's official gallery templates.** Any template is admitted, a
  hand-written one or a third vendor's included, and the policy bounds what it can load and
  where it can send, not what it reads off the page. A further vendor is a privacy-policy
  edit and a change to the policy, never a tag added in the UI.
- **Each ad tag fires only on our Custom Event triggers** — `page_view`, `view_item`,
  `add_to_cart`, `sign_up`, `child_added`, `enrolment` — **with `advertised` equal to `true`** on every
  event that carries it. Analytics is pushed every product, municipality clubs included; a
  campaign optimised on them is optimised on noise. `begin_checkout` feeds no ad tag: the
  checkout start is `add_to_cart`.
- **Meta's `eventID` and Reddit's `conversionId` come from the `event_id` Data Layer
  Variable**, and **the pixel ids are the same as the server's**
  (`NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_REDDIT_PIXEL_ID`). A platform deduplicates
  only an event with the same id on the same pixel; either one wrong and every event
  counts twice.
- **No advanced matching fields** on either tag — no email, phone or name. The policy's
  promise is that only the lead, the child added and the enrolment carry an identifier, hashed on our
  server; a tag sending one would put it on every page view. The globals keep the vendors'
  *automatic* matching off; they cannot vet a field typed into a tag.
- **Meta's "Meta-enabled CAPI" opt-in box stays unticked.** Our servers already report
  every event to the Conversions API under the browser's id. What the box would add on top,
  and what Meta would then receive, has not been worked out; it stays off until it has.
- **Reddit's tag shows as failed in Tag Manager, and that is expected.** Its template's own
  script injection is the request the policy refuses; the events still go out through the
  generic library our Reddit global loads. Never use Reddit's "link your GTM container"
  flow; build the tag by hand from the template. Linking grants Reddit publish rights on
  the container, so a third party could change tags outside anyone's review.
- **Turn off enhanced measurement's page views in the Analytics property.** Enhanced
  measurement reports a page view on every history change from inside the analytics tag,
  which the blocklist cannot reach. Left on, it reports every private page the visitor
  walks to after the marketing page that loaded the container. It is the one setting that
  can undo the whole design from a screen no code here can see.
- **Google's tags take the page from the pushed field, never from the address bar.** Set
  `page_location` and `page_path` on each from the `page_path` the app pushes. A tag left
  to its default reads `document.location` at the moment it fires, and a push can outlive
  a navigation. Meta's and Reddit's libraries read the address bar themselves and have no
  such field, which is why every push is made while the address bar still shows the page
  the push names.
- **Blocked tag types and triggers silently never fire**, so nothing may be built on one.
  A real need for one is a conversation and a change in the loader, never a workaround in
  the UI.

## Reading what the platforms received

Checking a change against the vendors' own screens goes wrong in the same few ways, so
they are written down here.

- **Neither destination is Sogverse's alone.** The Sogverse and Sogverse Staging streams
  are web data streams inside the **sog.gg - GA4** property, not properties of their own,
  and the live Meta pixel is shared with the marketing site and School of Gaming's other
  sites. Filter by stream, or by an event name only Sogverse sends, before reading a count.
- **Judge delivery by the platforms' own screens, never by the browser's network panel.**
  Google's tag holds events for several seconds and sends whatever it holds as the page
  unloads, so a push followed by a full-page navigation is delivered but not visible in the
  tab afterwards, and the collect endpoint answers `204` whether it counts a hit or
  discards it. GA4's DebugView and Realtime are the evidence — on a new stream Realtime can
  lag 15 to 25 minutes — and for the ad tags, Meta's Events Manager Test Events and
  Reddit's Events Manager, where a browser event and its server twin show as one.
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
