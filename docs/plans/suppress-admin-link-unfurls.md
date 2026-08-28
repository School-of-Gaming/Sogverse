# Suppress the admin links' Slack unfurls

## Problem

The Stripe-workflow purchase message in the staff Slack channel carries three links,
and Slack unfurls all of them. The shop link unfurls correctly — real product image,
name, short description, built on purpose by the product metadata. The two admin links
(`adminProductUrl`, `adminUserUrl`) unfurl as *"Sign In to Sogverse — Sign in to your
Sogverse account…"*: every gated URL 307-redirects to `/login`, which is a public page
with a genuine OG card, so every admin link inherits the sign-in card. Useless, and it
triples the height of every purchase message. Verified against prod 2026-08-23.

## The decision (owner's ruling, 2026-08-23)

**Exactly one preview per message: the shop link.** The fix: in the unauthenticated
branch of `src/proxy.ts` (the block that builds the login URL and redirects), **return
404 instead of the login redirect when the User-Agent is a link-preview crawler**.
Slack's is `Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)` — match on
`Slackbot`. With no page to fetch, Slack renders no card. Shop pages are public, never
reach that branch, and keep their product card.

UA sniffing is the trade, and it is defensible *here specifically*: we serve **less**
to a bot, on paths our own `robots.txt` already declares off-limits — enforcing the
stated policy where robots.txt failed to, not cloaking. Humans keep the login bounce
with `?redirect=` intact.

## Rejected alternatives, with the reason

- **robots.txt** — already live and correct (`Disallow: /admin`, verified 200 on
  prod). Slack's crawler either ignores it or evaluates it only after following the
  redirect. This was the first wrong guess; it is not the lever.
- **Slack's labelled-link form** — the template already uses it and the card appears
  anyway. Settled by our own evidence.
- **Anything on the Stripe side** — `unfurl_links`/`unfurl_media` are per-message,
  all-or-nothing, owned by the posting app; the Workflow's Slack action exposes no
  toggle, Workflows have no API, and Slack has no per-link switch anywhere.
- **Backticking the URL** — kills the unfurl and the clickability together; one-click
  to admin is the whole point of the link.
- **Stripping OG tags from `/login` when it carries `?redirect=`** — half a fix: Slack
  falls back to `<title>` + meta description, producing a smaller ugly card rather than
  none.

## Steps

1. In the proxy's unauthenticated branch, before building the login redirect: if the
   request's User-Agent contains `Slackbot`, return a plain 404 response (~5 lines).
2. Deploy to a preview/staging URL and verify with a spoofed UA
   (`curl -A "Slackbot-LinkExpanding 1.0" -i <admin-url>` → 404; without the UA → 307
   to `/login?redirect=…`).
3. After production release: paste an admin product URL into any Slack channel and
   confirm no card renders; paste a shop URL and confirm the product card still does.
4. Add the outcome to `docs/runbooks/slack-integration.md` — its "Link previews"
   section points at this plan today.

## Acceptance criteria

- An admin URL pasted in Slack renders no unfurl card.
- A shop URL still unfurls with the product image and name.
- A human visiting a gated URL still gets the login bounce with `?redirect=` intact.

## Constraints discovered while deciding

- **Slack caches unfurls per URL** — test with a *fresh* product id, or Slack re-shows
  the old card and the fix looks broken.
- The fix is invisible in local dev unless hit with a spoofed UA.
- A live workflow cannot be triggered synthetically (`stripe trigger` is test-mode
  only), but the unfurl is testable on its own by pasting URLs directly — no need to
  fight that constraint.
