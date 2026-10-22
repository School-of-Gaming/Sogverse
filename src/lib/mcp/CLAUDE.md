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

**Deleting an AI app's OAuth client cuts it off no faster than revoking a grant.** Supabase
only marks the client deleted and leaves every grant and session it had in place, but its
token endpoint refuses a deleted client, so the app's refresh token mints nothing more;
an access token already issued works until it expires. The immediate cut-off for an AI app
is removing the person's admin role, which the gate reads on every request.

**Rule: tools act as the admin, through `createBearerClient(authInfo.token)`, and never
through the service-role client.** Row policies and guarded RPCs then decide exactly as
they do for the admin in the browser. A tool reads who is calling with `readMcpCaller`.
The one exception is the bytes of an uploaded picture, which go to its purpose's bucket on
the service-role client exactly as the image catalogue's upload route sends them — that
bucket has no other writer — while the catalogue row is still written on the admin's client.
The analytics tools also read Vercel on the server's own analytics token, as the admin
Analytics page does; that token never reaches the database, and the landing page directory
they name pages from still reads on the admin's client.

## Adding tools

An area is a module here exporting a `register…` function, called from `server.ts`. Tool
schemas import `z` from **`zod-v4`**, an npm alias the SDK's Standard Schema needs, while
the app stays on zod 3 — so a schema shared with the rest of the app is redeclared here
rather than imported. Every tool states its annotations
(`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), since clients
decide on them how freely to call it. The endpoint test lists every tool by name, so a new
tool is added there too.

**Rule: a tool runs the area's own service, and writes through its piece-at-a-time
writers.** No table read or RPC of the tool's own: the service is what the area's UI
already trusts. Where the area has both a whole-object save (an editor's) and partial
writers, a tool takes the partial ones — the AI app edits one piece at a time, and a whole
save would carry a stale copy of everything else and undo another admin's edit.

**Rule: a refusal is a tool error the AI app can act on, never a throw.** The SDK turns a
thrown error into a tool error carrying its raw message, which would hand the app a
developer's sentence. A tool catches instead: a database refusal written for an admin (the
area's own refusal reader decides which SQLSTATEs those are) is quoted as is, anything
else is logged and answered with a generic line. Input the schema refuses never reaches the
database. The SDK prints a schema's refusal as its raw issue path, zero-based, so the landing
tools wrap their input schemas in `readableInput`, which says where each issue is the way
their answers do: a section as "section N (Type label)", numbered from one.

**The descriptions are the AI app's whole manual.** The editor teaches its rules by what it
lets the admin do; an AI app learns them only from the tool descriptions, so each tool
states the rules its writes are subject to — what is required, what publishing does, what
changes a public address, what cannot be undone. Where a rule has a definition in code,
the description is built from it rather than restated, so the two cannot drift.

**Rule: authored markdown written through a tool is checked against the field's use case
and refused outside it** (`src/lib/authored-markdown-subset.ts`), naming each construct and
its line, and nothing is saved. The renderer would silently unwrap what the editor's toolbar
could never produce; an AI app can type anything, and would never learn its table or image
is not what readers see. The check runs the renderer's own parse against the same
allow-list, and the subset the description states is generated from that list too.

**Rule: a picture in a tool result is re-encoded small, capped per result, and named in
text.** Claude's clients refuse a whole tool result over 1 MB, and a refused result is a
failed call. So a cover is never the stored original: `cover-images.ts` fetches it from the
public bucket and re-encodes it as JPEG image content, about 800 × 450 for one article and
256 × 144 for a list, and a result carries at most twenty pictures and stops adding them
at a base64 budget well under the limit. Every picture follows a text line naming it — the
catalogue id, label and public URL — so a client that drops images still knows each cover,
and a picture past either limit, or one that fails to load, keeps its line and says why.

**A link a tool hands back is absolute, on `getOrigin` of the request** (`ctx.http.req`),
and built with the app's own path helpers for its locale — the same address the page
itself would link to. An answer is structured content, repeated as JSON text for clients
that read only the text.

## Uploading through an MCP Apps view

The bytes of a picture must never pass through the model, so a catalogue picture is
uploaded through an **MCP Apps view** (extension `io.modelcontextprotocol/ui`): an opening
tool (`open_cover_uploader`, `open_landing_image_uploader`) carries `_meta.ui.resourceUri`
naming a `ui://` resource of type `text/html;profile=mcp-app`, which the AI app renders in a
sandboxed frame inside the chat. **One view serves every catalogue purpose.** The opening
tool's `uploader` field says what it is for — the frames the area's pictures come in, each
a purpose's exact size and, where this destination does not take that shape, the sentence
saying why; what a picture of no frame's shape is told; how many pictures the destination
takes at once and whether they must all be one shape; the largest JPEG a call may carry;
and the tool and arguments that place them (or none, to add them to the catalogue alone) —
so the view restates nothing the catalogue or an area defines. Every picture is stored
through one app-only tool that takes the frame's purpose, so a new purpose is a new frame
or a new opening tool — and an entry in the uploader's list of purposes it takes — never
a new view or a new upload tool.
A change to that protocol names a new view address, since hosts may cache a view by it.

**Rule: the view never crops.** It measures the admin's picture and takes it as the frame
it is already the shape of, within 1% of the frame's ratio, scaling it to that frame's
exact size (the sliver under 1% is trimmed, which nobody can see); the admin never chooses
a shape. A picture of no frame's shape, or of one the destination does not take, is
refused: nothing uploads, the view says why on screen, and it puts the same sentence —
the picture's measured ratio and size, and the rule — into the model's context, so the AI
app can explain it and the admin can re-crop the picture themselves. A crop the admin
cannot see would silently cut away what they meant to show, which is what this rule
exists against; the in-app crop dialog, where the admin drags the frame, is the place for
cropping. A picture smaller than its frame still uploads, with a warning that it will look
soft, and the server's exact-size check stays the last gate.

**The admin may pick several pictures at once, and the opening says how many** (`room`,
with the sentence a picture past it is told). Adding to the catalogue alone takes any
number; a single-picture destination — a Library cover, a hero or text section, a
replaced picture item — takes one, and the view turns its multi-select off; adding to an
image section takes the room it has left of its four. Each file is judged on its own, in
the order picked, and a refused one never holds back the others. **Where a destination
needs one shape (`oneShape`, an image section), the first picture taken fixes it**: the
section's existing pictures already restrict the frames, so this only decides a batch for a
section whose pictures have no known shape. Only pictures that pass count against the room,
and **pictures past it are refused before anything uploads** — never stored unplaced in the
catalogue, where nobody asked for them; the admin adds those through an opening without a
placement. Each picture is stored by a call of its own, never two in one request, and the
view shows each file's state: checking, ready, uploading, done, refused or failed with its
reason. The stored pictures are then placed through the opening's place tool — in one call
where it takes a list (`list`, `set_landing_section_image`'s `imageIds`), so the database
judges the whole batch in one write and stays the final gate — and **the model is told the
whole batch in one context update**, since a host keeps only the last: each file in pick
order with its new catalogue id, label and shape, or the sentence it was refused with, then
where the pictures went. A batch that stored something is final; one that stored nothing
lets the admin pick again. The view holds no token and opens no connection of its own,
so the gate in front of those calls is the endpoint's.

**An app-only tool is a tool all the same.** The upload tool, `upload_catalogue_picture`,
carries `_meta.ui.visibility: ["app"]`, which tells a host to keep it out of the model's
tool list and accept it only from this server's own views. That is the host's promise, not
a gate: the tool is in `tools/list` and any client holding a grant can call it, so it
checks its input exactly as a model-visible tool would — the caller an admin, the purpose
one an opening offers, the bytes a JPEG of exactly that purpose's size. A host that cannot show views gets the opening
tool's text instead, which says so and sends the admin elsewhere — to the Library's editor
for a cover, to an AI app that shows views for a landing page picture, since landing pages
have no editor; there is no other way to upload from an AI app, by the owner's ruling. The server cannot ask the client
first — it is stateless, so the initialize capabilities are gone by the next request.

**The picture travels as base64 inside one JSON-RPC request.** The catalogue's cap is 4 MB,
but the SDK refuses a request body over 4 MB (Vercel's own limit, 4.5 MB, sits above it), so
the view is told a smaller cap and re-encodes at a lower quality to fit; a JPEG at any
catalogue size is a few hundred kilobytes, so neither limit is near in practice.

**The view is its own workspace package, `packages/mcp-image-uploader`, built to one HTML
file that is committed.** `@modelcontextprotocol/ext-apps` needs zod 4 as a peer, which the
root package cannot give it, and the deployment installs only the root and `@sog/ui`, so
the server never builds the view: it reads `dist/image-uploader.html` from disk (named in
`next.config.ts`'s tracing includes). After editing the view, run `npm run build
--workspace=@sog/mcp-image-uploader` and commit the output; `check-fresh` in the same
package rebuilds it in memory and fails on a difference, in CI and in `npm run gates`. The
view takes its colours and face from `@sog/ui`'s token modules (not the package index, which
would bundle the icon set and React); its words are English, outside the app's message files.

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
