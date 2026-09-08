# Brevo's image proxy and the 8 September 2026 broken images

**Status: OPEN — a support ticket is with Brevo and unanswered. Researched 2026-09-08.**
Nothing here is decided, and no code changed. Re-verify the external claims before acting:
Brevo's settings and API surface move, and the failure itself was transient.

## The symptom

Session report emails went out during the afternoon of 8 September 2026 (UTC). Recipients
saw the brand mark and session photographs intermittently fail to load — mostly they
worked; closing the mail and reopening it later often fixed it permanently.

## What it is not

Each of these was measured, not reasoned about, and each came back clean:

- **Not our origins.** Neither the app's own CDN nor the storage bucket is in the path a
  recipient touches. Both answered every probe in well under 150 ms throughout.
- **Not image size.** The upload pipeline already bounds a phone original to a sane web
  image. Stored photos are ordinary web-sized files.
- **Not Cloudflare.** No incident on their status page fitting the window or the region.
- **Not our send volume.** A few hundred emails is invisible at an ESP's scale. The 503
  body says `envoy overloaded`, which reports one proxy instance's own resource state —
  it is not a verdict about whose traffic caused it.

## What it is

**Brevo rewrites every image `src` in outgoing mail to its own tracking infrastructure.**
We upload nothing; Brevo fetches each image from us once at send time, stores a copy, and
replaces the URL. Recipients therefore never reach our servers at all.

The rewritten URL resolves through **two hops**, and only the first was failing:

| Hop | Host | Behaviour under test |
|---|---|---|
| 1 | Brevo's tracking redirector (`r.mailin.fr`, single A record, Envoy) | intermittent `503 envoy overloaded` |
| 2 | Brevo's image cache, Cloudflare-fronted | 200 on 12 of 12 |

Hop 1 serves no image bytes. It records the open and 302s onward. It is a thin, stateful
hop that runs once per image, per recipient, per open — and it is a single point of
failure in front of every image in every transactional mail.

Measured failure rate on one unchanged URL: **54%** (13/24) at ~15:55 UTC, falling to
**8%** (1/12) by ~16:20 UTC. Pacing made no difference — 8 requests three seconds apart
still produced 5 failures — so it was not per-source rate limiting.

**The decisive evidence** that our content is irrelevant: two recipients received the
*same* stored logo object, identical path and identical bytes, differing only in the
per-recipient token appended to the URL. One rendered; one did not.

The per-recipient token is also what identifies the rewrite as tracking machinery rather
than a byte-delivery optimisation.

## It cannot be turned off

Checked in both places, on 2026-09-08:

- **Dashboard.** The transactional tracking page offers exactly one control, an anonymous
  tracking toggle whose own description says opens and clicks are still tracked — so the
  rewrite that produces them necessarily survives it. A per-contact tracking consent
  setting exists under contact settings, but it gates tracking per contact rather than
  disabling rewriting, and would break images for anyone who has not consented. No
  image-hosting control exists anywhere in the settings tree.
- **API.** The transactional send endpoint exposes a single per-recipient tracking-consent
  flag, which *anonymises* events. Brevo's reference states there is no parameter to
  disable image or link rewriting.
- **No custom tracking domain** is on offer — the domain configuration carries only
  authentication records — so the redirector cannot be moved onto our own hostname.

## Where it stands

A support ticket was filed 2026-09-08 asking two things: confirm and resolve the elevated
503s, and say whether body-image rewriting can be disabled account-side. **Follow up when
they reply.**

## What would change the answer

- **Brevo says rewriting can be disabled.** Then images come from our own origins, and the
  cache-header finding below becomes worth fixing.
- **Brevo says it cannot, and this recurs.** Then the only fix is the class rather than the
  instance: a transactional provider that leaves `src` alone. That is a real migration, not
  a setting, and is not justified by one bad afternoon.
- **It never recurs.** Close this with a record, or delete it.

## Two side findings, both unrelated to the outage

- **The brand mark is served with no caching** — the framework default for static assets,
  which nothing overrides. Near-worthless to fix while Brevo mirrors the file anyway, and
  worth fixing the moment it stops. If fixed, note that the file is regenerated under a
  stable name, so a long immutable TTL needs a content-hashed filename to go with it.
- **The account's plan reads inconsistently.** The support portal reports the account as
  Free and not Pro, while the API reports a paid subscription under a Marketing vertical.
  This may be why an expected pixel-disable feature could not be found. Unresolved, and a
  separate conversation with Brevo from the one above.

## Privacy note, for whoever picks this up

The rewriting means Brevo holds its own copy of every emailed session photograph — pictures
of children — on a third-party CDN at unauthenticated URLs that outlive the mail. This is
not a new exposure class, since the storage bucket is public by design and the mail
templates already assume a bare unauthenticated fetch. It is an additional copy on an
additional processor, which is a data-processing question rather than a defect.
