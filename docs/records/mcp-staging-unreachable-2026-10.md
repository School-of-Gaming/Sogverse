# Claude.ai could not reach the staging MCP endpoint (Oct 2026)

**Status: frozen, 2026-10-03. Fixed by a DNS change; why the old route failed is still
unknown.** Re-verify the DNS facts below before relying on them. Times are UTC.

## The symptom

The admin MCP endpoint on staging (`https://sogverse-staging.sog.gg/api/mcp`) worked with
Claude.ai on Friday 2 October. On Saturday, Claude.ai said "connection issue". After a
re-authorization (the consent page loaded, Allow spun, then timed out), it went back to
the same error. Removing the connector and adding it again failed with "Couldn't reach
this address. No server responded at this URL." Two admins on different devices and
networks saw the same thing.

## What it turned out to be

Claude.ai's servers could not reach the Vercel addresses staging's hostname resolved to,
and the fix was changing the address range.

- **Before:** staging's CNAME at the DNS host (Nordname) pointed at a per-project Vercel
  target, `88d8df46e7ff3b6f.vercel-dns-017.com`, which resolves into Vercel's `216.150.x`
  range.
- **After:** it points at `cname.vercel-dns.com`, the classic target prod's hostname has
  always used, which resolves into a different Vercel range (`66.33.x` / `76.76.x`).

Claude.ai connected and called tools within minutes of the change. The Vercel project,
the deployment and the code were the same before and after.

## The mystery that remains

We do not know why the `216.150.x` route failed, or whose network it failed in.

- From everywhere we could test, which was a home connection in Helsinki, OpenCode, curl,
  and a fetch tool, the old addresses answered normally. Only Claude.ai's servers could
  not get through, and they sent nothing we could see.
- The route worked at 01:54 on Saturday: Claude.ai's requests still arrived and got
  answers. By 08:52 they had stopped arriving. Nothing was deployed and no DNS record was
  edited in between.
- Vercel's status page reported nothing for 1 to 3 October.
- A public DNS monitor on GitHub (`BusariAnees/dns-watch`, issues #27 and #28) recorded a
  different `vercel-dns-017.com` target changing its addresses from `216.150.1.1` /
  `216.150.16.1` to `.129` on 30 September and back on 1 October. On 3 October, two
  resolvers gave staging those two different answers. That is churn in the range around
  the time it broke, not proof of a cause.

Because the cause is unknown, staging staying on the classic target is the fix that
worked, not a rule. Vercel's dashboard may recommend moving back to a per-project target.
If anyone does, test Claude.ai straight after, and read this record if it fails.

## How we got there, and the leads that were wrong

Every check on our side was clean, so the day went to ruling things out.

1. **The expired-token 500, which was real but not the outage.** Supabase's `getClaims`
   throws a plain `Error` for an expired token instead of returning an error. The gate
   treated the throw as our own fault and answered 500. A client refreshes only on a 401,
   so Claude.ai kept presenting its dead token. Vercel's logs showed bursts of these from
   Friday 18:02 to Saturday 01:54. This is why the connector died overnight and did not
   recover by itself. It was fixed on 3 October: an expired token is now a 401. It did not
   cause Saturday's outage, because after fresh sign-ins Claude.ai still sent nothing.

2. **The server icon, which was dropped without being proven guilty.** On Friday the server
   began declaring an icon, which meant rebuilding the MCP handler on every request. From
   about an hour after that deployment, nearly every connection left one request open
   until Vercel's 300-second limit. It was the only server change between the clean
   deployments and the hanging ones. It was reverted. The icon bought nothing anyway,
   because Claude.ai shows the parent domain's favicon from Google's favicon service and
   ignores server icons. The revert did not restore Claude.ai, so it was not the outage.
   Whether the icon caused the hangs is unconfirmed. Each request now logs its JSON-RPC
   method, so another hang will name itself.

3. **"Claude.ai is refusing our hostname", which was half right.** These results looked
   like a per-hostname block on Anthropic's side:
   - other connectors worked in Claude.ai;
   - OpenCode worked against our endpoint;
   - the same hostname with `?v=2` failed;
   - the Vercel branch address (`…vercel.app`) reached our server immediately.

   What cracked it was comparing addresses. The `vercel.app` address resolves into yet
   another Vercel range (`216.198.x` / `64.29.x`). So the name and the route had changed
   together, and the DNS switch separated them.

## The lessons

- **When a remote client reports a server unreachable while every check on our side is
  clean and nothing shows in the logs, resolve the hostname first.** Compare the address
  that fails with one that works, including which Vercel range each lands in.
- **A client's "no server responded" with nothing in our logs means the request never
  reached Vercel's edge.** Code changes cannot fix that, so look at the network path.
- **Testing from a different client, on a different hostname, and on a different address
  range isolates three different layers.** Run all three before theorising.
