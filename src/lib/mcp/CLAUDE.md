# MCP server — AI apps acting as an admin

`/api/mcp` is a remote MCP server (Streamable HTTP, stateless, on `mcp-handler` 2 and the
MCP SDK v2) through which an admin manages Sogverse from any AI app — Claude, ChatGPT,
Cursor, a command-line agent — with nothing but the endpoint's URL. This directory holds
the gate (`auth.ts`), the server factory (`server.ts`) and one module per area of tools.

## How a client gets in

The endpoint answers an unauthenticated request 401 with a `resource_metadata` pointing at
`/.well-known/oauth-protected-resource/api/mcp` (served from `src/app/.well-known/`), which
names the project's own **Supabase Auth OAuth 2.1 server** as the authorization server.
The client registers itself there (dynamic registration is open, by the owner's ruling),
sends the admin through Supabase's authorize step to the app's consent page
(`/oauth/consent`, at the Auth project's site URL), and exchanges the code for a token.
The token is an ordinary user JWT plus a `client_id` claim.

**Rule: the consent page is the defence that open registration leans on, and it judges the
redirect URI, never the client's name.** The name is whatever the registrant typed; the
redirect URI is where the code goes. The known AI apps' exact callback URLs (scheme, host
and path — a host alone would admit any URI a phisher registers on claude.ai) plus loopback
at any port get a calm page, anything else a warning (`src/lib/oauth-consent.ts`). The page refuses a
non-admin *before* reading the authorization, because the read binds it to the reader and
auto-approves a client they approved before.

## The gate

**Rule: every request is verified afresh, in this order — signature and expiry
(`getClaims`), issuer is this project's Auth, `client_id` present, and the caller's role
read now.** The `client_id` check is what refuses a first-party session token presented as
a bearer; the role read is per request because a grant outlives a role change. A non-admin
is a 403 and never an `insufficient_scope` challenge, which would only send the client
round a step-up loop no scope can end.

**Revoking a grant is not immediate.** `getClaims` verifies the token locally and
PostgREST checks only the JWT, so an access token from a revoked grant keeps working until
it expires — up to one access-token lifetime, an hour. Only the role read is live: a
demoted admin is refused on their next request. Nothing in Sogverse lists or revokes grants
yet; that is done from the Supabase dashboard.

**Rule: tools act as the admin, through `createBearerClient(authInfo.token)`, and never
through the service-role client.** Row policies and guarded RPCs then decide exactly as
they do for the admin in the browser. A tool reads who is calling with `readMcpCaller`.

## Adding tools

An area is a module here exporting a `register…` function, called from `server.ts`. Tool
schemas import `z` from **`zod-v4`**, an npm alias the SDK's Standard Schema needs, while
the app stays on zod 3 — so a schema shared with the rest of the app is redeclared here
rather than imported. Every tool states its annotations
(`readOnlyHint`, `destructiveHint`, `idempotentHint`), since clients decide on them how
freely to call it.

## Environments

`[auth.oauth_server]` in `supabase/config.toml` switches the server on for local stacks
only; a hosted project needs the same three settings in its Auth configuration, and its
site URL is where the consent page is looked for. A local stack's site URL is the main
checkout's `http://127.0.0.1:3000`, so a worktree serving the app on another port has to
create its stack with `SUPABASE_AUTH_SITE_URL` set to its own origin (forwarded into WSL by
adding the name to `WSLENV`) and run its dev server with `NEXT_PUBLIC_SITE_URL` matching,
or the authorization lands on the wrong server.

A local stack serves the authorization-server metadata only at
`/auth/v1/.well-known/openid-configuration` (and `…/oauth-authorization-server`), not at
the RFC 8414 inserted form; MCP clients find it through the spec's OpenID fallback.
