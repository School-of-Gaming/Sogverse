# Cookie consent and the Meta Pixel

This directory holds the consent question, the answer, and the one advertising script the
answer switches on. The strip's own layout rules live in `src/components/layout/`; what is
written here is the pixel: where it may run, what leaves the browser, what leaves our
servers, and how a withdrawal takes effect.

## Four gates in front of the pixel, and two more that are the page

The pixel loads only when all of these hold, and every one of them is decided in the
browser:

1. **Marketing consent is granted** on this device, from the consent cookie.
2. **This is a client render**, not the server one and not the hydration one — the gate
   reads false on both, so the SSR HTML and the first client render agree.
3. **The visitor is not, and cannot be, a signed-in gamer.** Anonymous is fine; a
   signed-in visitor whose role is known and is not `gamer` is fine; anything else —
   still loading, or signed in with a profile we could not read — is not. A child's
   browsing never reaches an advertising platform on any surface, whatever a parent once
   answered on a shared device.
4. **The advertiser id is configured**, and is a run of digits rather than a placeholder.
   Unset means the pixel is off *and* our servers report nothing: one switch for both.

## Why the pixel loads only on marketing pages

Meta's library sends the page's own URL and the document's referrer with every event it
reports. Some of our URLs are secrets — a password reset, a PIN reset, an email
verification and a seat offer each carry a single-use token in the query string — and
others name a child by id. A pixel mounted on every page would hand all of them to an
advertising platform, and no amount of care about *what events we send* would help,
because the URL travels with each one.

So the pixel is allowed on an **allowlist of marketing pages** (`src/lib/marketing-pages.ts`)
and nowhere else: public pages a stranger can be sent to by an ad, carrying no token and
identifying nobody. The list is a **safe default rather than a forcing check** — a page
missing from it simply gets no pixel, which costs a measurement, where a page wrongly on
it costs a secret. That asymmetry is why there is no completeness test demanding every
route be classified: such a test only adds a place for a new page to be waved through.

Four knobs hold that promise, and all four are load-bearing:

- **The allowlist** decides where a page view may be reported from at all.
- **Meta's automatic page view on client navigation is turned off** in the loader, so the
  library reports nothing by itself. Once loaded it stays loaded and inert: navigating
  from a marketing page into a private one sends nothing.
- **`Referrer-Policy: strict-origin`** site-wide (set in `next.config.ts`), so a
  same-origin navigation — from a reset link to the login page, say — cannot hand the next
  document a referrer carrying the token.
- **A report is sent only once the library has loaded, and only if the address bar still
  shows an allowed page with an allowed query** — the paragraph below.

**Nothing is ever queued for the library to replay.** Meta's stub queues a call made before
the library has downloaded and replays it on arrival against the URL the tab shows *then* —
and a parent can client-navigate from a shop page into a child's page inside that window.
So a report waits for the script to load, then re-reads the address bar: the tab must still
be on the page that authorised the report, and the query string must carry only campaign
keys, the platforms' click ids and the shop's own filter state. The second check is what
keeps `/login?redirect=/parent/gamers/<id>` — the proxy's bounce for a signed-out parent —
from ever being reported, even though the login page itself is a marketing page. A visitor
who moved on gets no report for either page; a query with anything else in it gets none.

## What Meta is told

From the browser: one `PageView` per marketing page *reached* — a re-render is not a view,
and coming back to a page after another one is.

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

Granting a purpose only has to mount something. Revoking one cannot unload a script that
has already installed itself on the document, so a withdrawal deletes the pixel's own
cookies (walking every domain the page could have set them on — the library writes them on
the registrable domain while our pages are served from a subdomain), clears what the
library keeps in local storage, and reloads. The new document has no pixel in it.

The privacy policy names the platform and what it receives; the strip names neither, and
adding a recipient is a policy edit **plus** a consent-version bump, which asks everyone
who answered the old question again.
