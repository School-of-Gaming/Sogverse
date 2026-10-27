# Move Sogverse from sogverse.sog.gg to sog.gg

## Problem

`sog.gg` becomes School of Gaming's official site, and it has to be Sogverse. Today the
address serves the old Webflow marketing site (bare `sog.gg` 301s to `www.sog.gg`), and
Sogverse lives on `sogverse.sog.gg`. Two things retire: the Webflow site and the
`sogverse.sog.gg` address.

The danger is the machines, not the people. Browsers follow a redirect; most machine
callers do not, or they follow it badly (a POST becomes a GET with no body, or the
`Authorization` header is dropped on the change of host). A machine caller left on the
old address fails silently. A failure must never drop data or money; a short spell of
error pages for people is acceptable (owner, 2026-10-26).

## Scale

Every machine that called `sogverse.sog.gg/api/*` in the 30 days to 2026-10-26. Re-pull
with the query in step 0.4 before trusting these numbers; they are the evidence the
integration list below is complete, not a fixed fact.

| Caller (user agent) | Route | Calls | Method |
|---|---|---|---|
| Claude connectors (`Claude-User`) | `/api/mcp` | 761 | POST |
| Stripe | `/api/webhooks/stripe/products` | 484 | POST |
| Lynx (`Ruby`) | `/api/partner/v1/*`, seven routes | 331 | GET only |
| Discord | `/api/discord/interactions` | 77 | POST |
| Prod database (`pg_net`) | `/api/substitution-notifications/sync` | 55 | POST |
| Slack | `/api/slack/interactions` | 11 | POST |
| Unidentified (`python-httpx`) | `/api/mcp` | 7 | POST, all answered 401 |

Two known callers made no calls in that window, and are known only from the code: the
WhatsApp webhook (`/api/webhooks/whatsapp`) and the Minecraft servers
(`/api/minecraft/join-check`).

Every signed-in user is signed out once (see Constraints).

## The decision

Decided by the owner on 2026-10-15 and 2026-10-26.

- **`sog.gg` (bare, no `www`) is the one official address.** `www.sog.gg` redirects to
  it.
- **Everything moves in one quiet hour**, people and machines together. The owner accepts
  a short spell of error pages. This is safe for data and money because every machine
  caller either retries on its own or only reads:
  - Stripe retries a failed webhook delivery for up to three days in live mode.
  - The substitution notifications wait in their outbox, and the database retries the
    sync every minute.
  - Meta retries WhatsApp webhooks.
  - Lynx only reads; the partner API has no write route.
  - Discord, Slack and the Claude connectors fail visibly, and the person retries.
  - The Minecraft servers' join check keeps players out while it fails. Their team
    changes the URL within the hour, and the quiet hour falls outside sessions.
- **`sogverse.sog.gg` becomes a pure domain-level permanent redirect in Vercel,
  preserving the path** (`sogverse.sog.gg/<path>` → `sog.gg/<path>`), in the same hour.
  There is no app code and no splash page. The DNS record is kept for about a year and
  then deleted. Nothing in the app may know `sogverse.sog.gg` existed.
- **Staging moves to `staging.sog.gg` in the same hour, and `sogverse-staging.sog.gg` is
  deleted outright, with no redirect** (owner, 2026-10-26). Staging is internal, so
  nothing outside the team holds a link worth keeping. Lynx is the one outside caller,
  and is told with its production change.
- **Clean break from Webflow.** No old Webflow path is redirected; they return the app's
  404. The Webflow blog, Library content and landing pages are not ported.
- **Webflow's data is exported to the team Google Drive before the subscription is
  cancelled**, as was done for SOGGA.
- **The app stays on its current Vercel project**, `sogverse`, with domains added to it.

## Rejected alternatives

- **Two phases, with both addresses serving the app while integrations move one by
  one.** The app trusts exactly one public host: the one in `NEXT_PUBLIC_SITE_URL`
  (`src/lib/url.ts`). Any request on another host builds its return URLs on the official
  one. So on the second host, Google sign-in, Stripe checkout and the billing portal send
  the person back to the official host, where they have no session. MCP clients would be
  handed a resource address that doesn't match the one they added. People can't be served
  on two hosts at once, and the machines don't need the overlap, given the retries above.
- **One cut for people, with `sogverse.sog.gg/api/*` kept serving until third parties
  moved.** It works, but it needs a temporary host rule in the repo's config, which goes
  against "nothing in the app knows". The only callers it would protect are Lynx's reads.
- **A "we've moved" page on `sogverse.sog.gg`.** It breaks every deep link, drops
  rankings, and costs more to run than a redirect.
- **A page-to-page redirect map for the ~289 Webflow URLs.** The owner does not want to
  support legacy routes. Most of those URLs are blog posts (about 70 English and 70
  Finnish) with no equivalent on the new site. A redirect only keeps value when the
  target is equivalent, and redirecting them all to one page is treated by Google as a
  soft 404. The domain's own standing and brand searches carry over without any rule.
- **Redirecting everything Webflow had to the home page.** Rejected 2026-10-15; it is a
  soft 404 for every URL.
- **`www.sog.gg` as the official address.** It's longer, and the brief named `sog.gg`.
- **Serving the site on several domains as copies.** It produces duplicate content and
  splits sign-ins by host.
- **Relying on the `sogverse.sog.gg` redirect for Lynx or the Minecraft servers.** An API
  client would drop the body or the key on a redirect, so both change the base URL on
  their side.

## Constraints discovered while deciding

- **`NEXT_PUBLIC_SITE_URL` drives the app's public identity:** canonical tags, sitemap,
  robots, mailed links, JSON-LD, IndexNow, the MCP resource address and the one trusted
  host. It is inlined at build time, so changing it needs a production rebuild
  (`vercel redeploy`), not just an env edit.
- **Google sign-in sends the browser back to `window.location.origin`**, so `sog.gg` has
  to be in Supabase Auth's redirect allow-list before the cutover. The Google Cloud OAuth
  client's redirect URI is the Supabase callback and does not change.
- **Sign-in cookies, the parent PIN cookie and the cookie-consent choice belong to the
  exact host.** Moving host signs everyone out once and shows the cookie banner again.
  It's unavoidable.
- **Emailed links already sent keep working.** Password resets, seat offers and email
  verification carry their token in the URL, and the redirect preserves path and query.
- **Supabase Auth is not pushed from the repo.** CI runs `supabase db push` only. The
  `[remotes.*.auth]` blocks in `supabase/config.toml` document the dashboard values, so the
  live change goes through the Management API (or the dashboard) and the file is updated
  to match. Prod's values on 2026-10-26: site URL `https://sogverse.sog.gg`, allow-list
  `https://sogverse.sog.gg/**`, OAuth server consent path `/oauth/consent` (relative to the
  site URL).
- **The substitution sync URL lives in the prod database's Vault**, as the secret
  `substitution_sync_url`. On 2026-10-26 it was
  `https://sogverse.sog.gg/api/substitution-notifications/sync`. pg_net does not follow
  redirects.
- **The Klaviyo parent sync URL sits beside it**, as `klaviyo_sync_url`, written on
  2026-10-27 to `https://sogverse.sog.gg/api/klaviyo-sync/sync` (staging:
  `https://sogverse-staging.sog.gg/api/klaviyo-sync/sync`). Its neighbour
  `klaviyo_sync_secret` holds no host and stays. Nothing reads the entry until the
  `feat/klaviyo-parent-sync` migration has run on that database; once it has, a stale host
  fails silently: parent changes queue up and never reach Klaviyo. Update it either way.
- **Updating a Stripe webhook endpoint's URL keeps its signing secret.** No Vercel env
  change is needed. The live endpoint is `we_1U2rZcCD5Q5ECgrcKzDSQRcJ` (2026-10-26).
- **The email records stay untouched.** On 2026-10-26 the apex held:
  - Google Workspace MX records;
  - SPF `v=spf1 a mx ip4:135.181.12.10 … include:_spf.google.com include:sendinblue.com ~all`;
  - DMARC on `_dmarc` as a CNAME to EasyDMARC;
  - verification TXT records for Google (four), Microsoft, Canva, Brevo and Webflow.

  **Never delete `google-site-verification=GV6B-…`**: it holds the Search Console Domain
  property. The SPF's `a` mechanism will authorise Vercel's IP instead of Webflow's once
  the apex moves. That's harmless, so leave it.
- **TTLs (2026-10-26):** the zone default is 1800 s and the `www` CNAME is 3600 s. There
  is no CAA record, so nothing blocks Vercel's certificate issuance.
- **Vercel issues the `sog.gg` certificate only after DNS points at it**, so the switch
  can show a certificate error for up to a few minutes.

## Steps

The person driving this works through the dashboards with the owner:
- Nordname runs in Claude's built-in browser, with the owner signing in.
- The developer dashboards (Discord, Slack, Meta, Google Cloud, Google Tag Manager,
  Klaviyo, Brevo, Search Console, Bing) run in the owner's Chrome. The chrome-devtools MCP
  is set up per the owner's global instructions, when the owner asks.

Every write outside the repo is confirmed with the owner before it is made.

### 0. Before the day

1. **Export Webflow to the team Drive.** *Exported locally 2026-10-26; it reaches Drive
   with step 2.6, where the details are.*
   - CMS collections (blog, lessons, camps, staff, categories) as CSV.
   - Form submissions.
   - Members and e-commerce orders, if the site used them. These hold personal data, so
     they go to the same restricted place as the SOGGA archive.
   - A static mirror of the public site (`wget --mirror` or similar), to keep what it
     said. Webflow's hosted images disappear when the site is unpublished.

   *Verify:* the files open, and the counts match the Webflow dashboard.
2. **Prepare the repo branch** (`feat/move-to-sog-gg`, off the latest `dev`). It lands
   in the first normal release **after** the cutover. Nothing in it is needed for the
   cutover itself, so it stays out of the hour.
   - Replace `sogverse.sog.gg` with `sog.gg` everywhere outside `docs/records/`: code
     comments and fallbacks, email-template example links, tests, scripts, skills,
     colocated `CLAUDE.md` files, `docs/architecture/` and the `packages/sog-ui`
     guidebook. Records are frozen history and stay.
   - Set the production remote in `supabase/config.toml` to site URL `https://sog.gg` and
     allow-list `https://sog.gg/**`.
   - Drop the `https://www.sog.gg/` entry from the Organization `sameAs` list
     (`src/lib/seo/`), and its comment.

   - Replace `sogverse-staging.sog.gg` with `staging.sog.gg` the same way, including the
     staging remote in `supabase/config.toml`.
   - Tests and the email-template previews name no real host at all: they use the neutral
     origin in `tests/mocks/site-origin.ts` and the render's own origin (done on the
     branch, 2026-10-26).

   `npm run gates` passes.
   Until this branch is released, `supabase/config.toml` documents the old values.
   That's accepted, since the file is never pushed to prod.
3. **Message the two external API users: Lynx and the Minecraft server team.** Draft each
   with `/slack-msg` or `/whatsapp-msg`. Each message gives the date and the hour, and
   says:
   - their base URL moves from `https://sogverse.sog.gg` to `https://sog.gg`, and Lynx's
     staging one from `https://sogverse-staging.sog.gg` to `https://staging.sog.gg`
     (Lynx calls both);
   - nothing changes for their key;
   - their calls fail from the cutover until they switch.

   For the Minecraft servers, a failing join check keeps players out, so their change has
   to land within the hour. Agree with them who makes it, at that time.
4. **Re-pull the machine-caller list**, and add anything new to step 1.6:

   ```bash
   vercel metrics vercel.request.count --prod --since 30d -g 1d -l 100 -f 'requestHostname:"sogverse.sog.gg" and requestPath:/api/* and not clientUserAgent:Mozilla*' --group-by route --group-by clientUserAgent --json | grep -v '^<claude'
   ```

   - This is the KQL filter syntax (camelCase dimensions), which ran on 2026-10-26 with
     CLI 64.5.0. The snake_case `eq` syntax in the `vercel-analytics` skill is OData, which
     the CLI now warns is deprecated.
   - `route` is Next's route template, which is enough to name the caller.
   - Long windows can time out; split them into weeks with `--since`/`--until`.

   - The `python-httpx` MCP caller came from Google Cloud addresses, and every one of its
     calls was refused with 401: it never held a token. So no working connector depends on
     it, and the cutover cannot break it (checked 2026-10-26).
   - The Minecraft servers do use the join check (owner, 2026-10-26), though its 30-day
     log held only one manual `curl`. Their base URL is the Minecraft server team's to
     change (step 0.3).
   - Re-pulled 2026-10-26 (needs `--project sogverse --scope school-of-gaming` when run
     outside a linked checkout): the same callers as the Scale table, plus some that need
     no step. `vercel-image-optimization` fetching `/api/team/photos/*` (3,133) is
     Vercel's optimiser fetching a relative image address on whichever host the visitor
     is on, so it moves with them. Googlebot-Image, Slack link previews of the MCP
     address, a scanner probe and our own `curl`s are the rest.
   - **The staging host's callers** (the same query on `sogverse-staging.sog.gg`,
     2026-10-26): Claude connectors on `/api/mcp` (2,912), the opencode CLI on `/api/mcp`
     (97, re-added by whoever runs it), Lynx's `Ruby` client on the partner API (186),
     the staging Discord app (71), the Stripe test-mode webhook (53), the staging Slack app
     (5) and the staging database's `pg_net` (3). `python-httpx` made 17 MCP calls there:
     confirm they were all refused, as on production. Each one is moved in step 1.7.
5. **Check the dashboards that may hold `sogverse.sog.gg` or depend on the Webflow site**,
   and write what each needs into step 1.6's table, in this file. None of these shows up
   in a request log:
   - **Meta Business Manager:** whether `sog.gg` is verified by a meta tag on the Webflow
     site. If it is, re-verify it by DNS TXT before the day, or verification is lost when
     the apex moves. Also the Pixel's allowed domains, and the WhatsApp app's webhook
     callback URL.
   - **Google Cloud OAuth client:** the authorised JavaScript origins, and the consent
     screen's home, privacy and terms URLs.
   - **Google Tag Manager / GA4:** any trigger or filter on the hostname.
   - **Klaviyo and Brevo:** templates, flows and campaigns linking to old `www.sog.gg`
     Webflow pages, which will now say "not found". `sogverse.sog.gg` links keep working
     through the redirect.
   - **Daily.co:** any domain restriction.
   - **Sogverse's own stored content:** product descriptions, Library articles, landing
     pages and spotlights that link to `www.sog.gg` or bare `sog.gg` Webflow pages. After
     the cutover those links open this app's 404. Find them with a read-only prod query
     over the authored text columns, and fix them in the admin UI.
6. **Add `https://sog.gg/**` to Supabase Auth's redirect allow-list**, keeping
   `sogverse.sog.gg/**`. It is harmless before the cutover.
   - Every Supabase Auth change in this plan goes through the Management API:
     `PATCH https://api.supabase.com/v1/projects/<SUPABASE_PROD_PROJECT_REF>/config/auth`
     with a JSON body of `site_url` and/or `uri_allow_list` (comma-separated).
   - Send `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>` and a `User-Agent` header. Both
     variables are in the owner's `.env.local`.
   - A `GET` on the same address reads the config back. The dashboard (Authentication →
     URL Configuration) works equally well.
   - The OAuth consent page is a path relative to the site URL, so it follows the site URL
     on its own.

   *Verify:* a `GET` lists both entries.

   Done 2026-10-26: prod's allow-list is `https://sogverse.sog.gg/**,https://sog.gg/**`,
   and its site URL is unchanged. Staging's (the project ref is in `supabase/config.toml`)
   is `https://sogverse-staging.sog.gg/**,https://staging.sog.gg/**`, also done
   2026-10-26.
7. **Add the domains in Vercel.**
   - Add `sog.gg` to the `sogverse` project as a production domain, and `www.sog.gg` as a
     domain that redirects (308) to `sog.gg`. Both stay unverified until DNS moves.
     *Done 2026-10-26* through `vercel api /v10/projects/sogverse/domains`. Pass the body
     with `-f`/`-F`; the CLI has no `-d`.
   - Add `staging.sog.gg` to the project with git branch `dev`, the way
     `sogverse-staging.sog.gg` is set up today. *Done 2026-10-26.*
   - Vercel asked for (2026-10-26):
     - three TXT records on `_vercel.sog.gg`, which prove ownership:
       `vc-domain-verify=sog.gg,15aa4e3f612a0a0e9641`,
       `vc-domain-verify=www.sog.gg,3eaea6edb8b650f1ddb6` and
       `vc-domain-verify=staging.sog.gg,cb5672db6f4dc6d97232`;
     - apex `A` records `216.150.1.1` and `216.150.16.1`;
     - a `www` CNAME to `88d8df46e7ff3b6f.vercel-dns-017.com.`
     Re-read with `vercel api "/v6/domains/<domain>/config?projectIdOrName=sogverse"
     --scope school-of-gaming` before the hour. The existing hosts point at
     `cname.vercel-dns.com`, which Vercel ranks second and still serves.
8. **The day before, at Nordname:**
   - Lower the TTL on the apex `A` and the `www` CNAME to 300 s.
   - Add the `_vercel` TXT records from step 0.7.
   - Add a `staging` CNAME to `cname.vercel-dns.com`. A new name changes nothing for
     anyone, so `staging.sog.gg` serves the `dev` deployment from then on. Sign-in and
     links there still return to the old staging host until step 1.7.

   *Verify:* `https://dns.google/resolve?name=www.sog.gg&type=CNAME` shows the new TTL,
   and `curl -sI https://staging.sog.gg/` answers from Vercel.

### 1. The cutover hour

At a quiet hour, in this order. Each step lists its check.

**The expected error window is about five minutes.** From the DNS switch until the
rebuild in step 2 is live, `sog.gg` serves the app while the app still treats
`sogverse.sog.gg` as official. Sign-in and checkout returns, mailed links and the MCP
resource address point at the old host during that time. The rebuild runs while DNS
propagates: a production build took 2–3 minutes in October 2026, and propagation takes
up to the lowered 300 s TTL. The owner accepted a window of this size. Flipping the
address before the DNS switch is no better: it would send `sogverse.sog.gg` visitors
back to `sog.gg` while that is still Webflow.

1. **Switch DNS at Nordname.**
   - The apex `A` record goes from Webflow (`198.202.211.1`) to Vercel's two values,
     `216.150.1.1` and `216.150.16.1` (step 0.7).
   - `www` changes from `cdn.webflow.com` to `88d8df46e7ff3b6f.vercel-dns-017.com.`
   - Change no other record.

   *Check, once it resolves:*
   - `curl -sI https://sog.gg/` serves the app with a valid certificate.
   - `https://www.sog.gg/` answers 308 to `https://sog.gg/`.
   - `https://dns.google/resolve?name=sog.gg&type=MX`, `…&type=TXT` and
     `https://dns.google/resolve?name=_dmarc.sog.gg&type=CNAME` match the values listed
     under Constraints.
2. **Straight after the DNS change, without waiting for it to resolve, set
   `NEXT_PUBLIC_SITE_URL` for production to `https://sog.gg` and rebuild production.**
   - Change the value with the `env-vars` skill.
   - Rebuild from the Vercel dashboard: Redeploy the current production deployment with
     "Use existing Build Cache" unticked. The value is inlined at build time, so a reused
     cache could keep the old one. `vercel redeploy` would also work, but the dashboard
     makes the cache choice explicit.

   *Check, once the build is live:* on `sog.gg`, the canonical tags, `robots.txt` and
   `sitemap.xml` name `sog.gg`.
3. **Move Stripe and the substitution sync as soon as `sog.gg` serves the app.** This
   keeps their window short.
   - **Stripe:** update the live endpoint's URL with
     `stripe webhook_endpoints update we_1U2rZcCD5Q5ECgrcKzDSQRcJ --live -d url=https://sog.gg/api/webhooks/stripe/products`.
     From Git Bash, set `MSYS_NO_PATHCONV=1` first.
   - **Substitution sync:** over psql on prod, per the `remote-supabase` skill, run
     `SET default_transaction_read_only = off;`, then
     `SELECT vault.update_secret(id, 'https://sog.gg/api/substitution-notifications/sync') FROM vault.secrets WHERE name = 'substitution_sync_url';`.
     Read the value back from `vault.decrypted_secrets`.
   - **Klaviyo sync:** in the same session,
     `SELECT vault.update_secret(id, 'https://sog.gg/api/klaviyo-sync/sync') FROM vault.secrets WHERE name = 'klaviyo_sync_url';`,
     and read it back the same way.

   This plan, approved by the owner on 2026-10-26, is the authority for these
   production writes and for the Supabase Auth changes. Each one is still confirmed with
   the owner at the moment it is made.
4. **Set Supabase Auth's site URL to `https://sog.gg`.** *Check:* a Google sign-in on
   `sog.gg` completes and lands on My SOG, signed in.
5. **Turn `sogverse.sog.gg` into a redirect.** Edit the domain in the Vercel project to
   redirect (308) to `sog.gg`. By now `sog.gg` is the project's serving production
   domain, so the project still has one. Also delete the dead `beta` CNAME
   (`proxy-ssl.webflow.com`) at Nordname.
   *Check:* `curl -sI https://sogverse.sog.gg/fi/kauppa` answers 308 to
   `https://sog.gg/fi/kauppa`.
6. **Move the rest.** These are the production apps; staging's follow in step 7.

   | Integration | Change | Check |
   |---|---|---|
   | Discord | Interactions Endpoint URL in the developer portal | Discord validates the URL on save, and `/sub` answers |
   | Slack | Interactivity URL and the `/link` command's URL | `/link` answers |
   | WhatsApp | Webhook callback URL in the Meta app | Meta's verification handshake passes on save |
   | Claude connectors | Re-add with `https://sog.gg/api/mcp`, for the owner and Reksi | `whoami` answers |
   | Minecraft servers | The Minecraft server team changes the base URL in their config, as agreed in step 0.3 | A join check succeeds |
   | Google Cloud OAuth | Consent screen URLs, and JavaScript origins if they list the old host | Saved |
   | Anything step 0.5 found | As found | As found |
7. **Move staging to `staging.sog.gg`.** It's the same work as production's, on test
   data. Nothing here can drop real data or money, so it runs after production is
   confirmed working.
   - Set `NEXT_PUBLIC_SITE_URL` for **Preview** to `https://staging.sog.gg` with the
     `env-vars` skill. In Vercel it's one value for every preview deployment, not one per
     branch. Then redeploy the latest `dev` preview with the build cache unticked.
   - Staging Supabase Auth: site URL `https://staging.sog.gg`, and an allow-list of
     `https://staging.sog.gg/**` only.
   - The Stripe **test-mode** endpoint `we_1U0cUCCD5Q5ECgrcpTkY9xnU`: URL
     `https://staging.sog.gg/api/webhooks/stripe/products` (`stripe webhook_endpoints
     update`, without `--live`).
   - Staging Vault: `substitution_sync_url` becomes
     `https://staging.sog.gg/api/substitution-notifications/sync` and `klaviyo_sync_url`
     becomes `https://staging.sog.gg/api/klaviyo-sync/sync`, the same way as step 3.
   - The staging Discord app's Interactions Endpoint URL, and the staging Slack app's
     Interactivity and `/link` URLs.
   - Claude connectors on staging: re-add them with `https://staging.sog.gg/api/mcp`.
     Whoever runs the opencode CLI re-adds it the same way.
   - Remove `sogverse-staging.sog.gg` from the Vercel project, and delete its CNAME at
     Nordname. There is no redirect.

   *Check:* a Google sign-in on `staging.sog.gg` lands signed in, a staging `/sub`
   answers, and a Stripe test event shows as delivered.
8. **Confirm nothing was dropped.**
   - Stripe: list the live endpoint's recent deliveries, or the events since the hour
     began. Resend any failed delivery with
     `stripe events resend <event id> --webhook-endpoint we_1U2rZcCD5Q5ECgrcKzDSQRcJ --live`.
   - Substitution outbox on prod: this returns 0 rows:
     `SELECT count(*) FROM public.substitution_notification_outbox WHERE next_attempt_at < now() - interval '5 minutes' AND (leased_until IS NULL OR leased_until <= now());`.
   - The request log shows Stripe and `pg_net` arriving on `sog.gg`.
9. **Submit `https://sog.gg/sitemap.xml`** to Google Search Console and Bing Webmaster
   Tools. The Domain property already covers every subdomain, so nothing is
   re-verified. Google's Change of Address tool does not apply to a move within one
   domain.
10. **Remind the owner** that everyone has been signed out once and sees the cookie banner
   again. The owner handles any message to families.

**Rolling back the hour** undoes it in reverse:
1. Clear the `sogverse.sog.gg` redirect, so the domain serves the app again.
2. Set Supabase's site URL and `NEXT_PUBLIC_SITE_URL` back, and redeploy.
3. Point every moved integration back at `sogverse.sog.gg`.
4. Put back the Webflow `A` and `www` values, which take effect within the lowered TTL.

The rollback takes about as long as the cutover, because rollback step 2 needs another
full rebuild. Stripe and the substitution sync are pointed back by hand, the reverse of
cutover step 3. They
retry through the rollback the same way they do through the cutover.

Staging (step 7) rolls back on its own and needs no prod rollback. Its last action is
removing the old staging host, so until then each change can be pointed back at
`sogverse-staging.sog.gg`.

### 2. Afterwards

1. **About a week later, look for stragglers.** Run the step 0.4 query again over the
   days since the cutover. Every non-browser caller on `sogverse.sog.gg` is now getting
   308s; move each one, Lynx included if they haven't switched.
2. **Land `feat/move-to-sog-gg`** in the next normal release. Before merging, re-verify
   the domain → branch mapping in the `vercel-analytics` skill and change its
   "verified" date to the day of the check.
3. **Remove `sogverse.sog.gg/**` from the Supabase allow-list.**
4. **About two weeks after the cutover, review Search Console** once its reports describe
   only this app. Issues reported before the move were deliberately left until now
   (owner, 2026-10-27), because they mixed Webflow, the app and staging.
   - Expected and fine: "Page with redirect" for old `sogverse.sog.gg` and `www.sog.gg`
     addresses, and "Alternate page with proper canonical tag" for parameter variants.
   - Events structured data: add `eventStatus` (scheduled) and `performer` (the
     Organization) to the `Event` in `src/lib/products/`. Leave `offers.availability` and
     `offers.validFrom` out on purpose: availability changes with every signup and would
     go stale in search results, and the page shows no sales-start date to state.
   - Anything else is a real finding about this app.
5. **Remove the old sitemaps a few weeks later:** `https://sogverse.sog.gg/sitemap.xml`
   and the Webflow sitemap `https://www.sog.gg/sitemap.xml`, from both Search Console and
   Bing.
6. **Cancel the Webflow subscription and every add-on**, once the exports are confirmed
   on Drive. Then delete the `proxy-ssl.webflow.com` TXT record on the apex.
   - The export (2026-10-26) is in `~/work/webflow-export-2026-10-26`, with the scripts
     that made it so it can be re-run just before cancelling. The token it uses is
     `WEBFLOW_EXPORT_TOKEN` (read-only) in `~/work/sog-translations/.env`. Its
     `personal/` folder goes to the restricted Drive folder.
   - Two things aren't in it: the site's custom head and footer code, which no token can
     read (copy it by hand from Site settings → Custom code), and the "My child is a
     gamer" guidebook PDF, which Webflow refused to serve (download it from the Assets
     panel if Sogverse's guide store doesn't already hold it).
   - The add-ons are the connected apps Jetboost, LiveChat and Flowbase. Revoke the
     site's API tokens with the subscription.
   - The site's form webhooks also sent submissions to Zapier, Make, phoneflow and
     nocodelytics. Check whether any of them keeps its own copy of that personal data.
7. **Delete the disabled live Stripe webhook** `we_1Ghre2CD5Q5ECgrcZmaxzWl8` (the old
   WooCommerce shop at `sog.gg/?wc-api=wc_stripe`).
8. **About 2027-10, delete the `sogverse.sog.gg` DNS record** and remove the domain from
   Vercel.

## Acceptance criteria

- `https://sog.gg/` serves Sogverse, and its canonical tags, sitemap and mailed links
  name `sog.gg`.
- `www.sog.gg/<path>` and `sogverse.sog.gg/<path>` answer 308 to `sog.gg/<path>`.
- No Stripe event from the cutover is left undelivered, and the substitution outbox has
  drained.
- A Discord `/sub`, a Slack `/link`, an MCP `whoami` and a Google sign-in all succeed on
  `sog.gg`.
- A week on, no non-browser caller is left on `sogverse.sog.gg`.
- The MX, SPF, DMARC and every verification TXT record match the values listed under
  Constraints.
- `git grep sogverse.sog.gg` matches only `docs/records/` and the dated 2026-09-10 search
  baseline in `docs/architecture/site-quality.md`, which names the hosts as they were that
  day (owner, 2026-10-26). `git grep sogverse-staging.sog.gg` matches only
  `docs/records/`.
- `staging.sog.gg` serves the `dev` deployment, and `sogverse-staging.sog.gg` no longer
  resolves.
- The Webflow data is on the team Drive, and the subscription is cancelled.

## Follow-ups

- **The other `schoolofgaming.*` domains.** The owner hasn't decided what to do with them.
  - The recommendation is to add each domain and its `www` to Vercel as a 308 redirect to
    `sog.gg`, changing only their `A` and `www` records. Then decide which to let lapse at
    their 2027-10 renewals.
  - `.fi` currently uses Nordname's forwarding to `www.sog.gg`. Once `www` redirects, that
    makes two hops but keeps working.
  - `.se` points at the server that hosts `pelipaku.fi`, showing a placeholder.
  - `pelipaku.fi` and `geduacademy.com` are separate sites and are not touched.
  - The CEO counts 15 domains and Nordname shows 14, so ask him for the registrar list.
- Country domains landing on their own language (`.fi` → `/fi` and so on), which needs
  host-based redirects in the app.
- Re-writing a few high-traffic Webflow blog posts as Library articles, if Search
  Console's Performance report shows any worth it.
