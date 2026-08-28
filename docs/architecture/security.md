# Security

The living security posture: where each enforcement layer lives, the risks accepted
deliberately, and what the next audit has to cover. Point-in-time audits are frozen in
`../records/` (currently `security-audit-2026-03.md`); this doc is what is true now, and
a new accepted risk or audit finding lands here first.

## Threat model, in brief

- **Admins are trusted** — including trusted to act only through the admin UI (root
  `CLAUDE.md`). "An admin could reach an invalid state via the raw API" is not a defect;
  the schema's own constraints are the accepted loud-failure backstop.
- **Everyone else is not.** Any authenticated role can hand-craft REST/RPC calls, so
  every grant, policy, and route posture is written for a hostile caller — and families
  include children, so safeguarding constraints (e.g. no links in staff-authored copy to
  families) sit alongside the technical ones.

## Enforcement map

Innermost first. Each layer's own doc is the source of truth; this is the index.

| Layer | Mechanism | Source of truth |
|---|---|---|
| Database | RLS on every table; guard-first RPC bodies; private-by-default grants; a verification spine that fails CI when a function or grant escapes classification | `db-authorization.md` |
| HTTP boundary | Route posture registry: every handler classified (auth posture, body handling, named test), completeness checks fail the build | `route-boundary.md` |
| Headers & CSP | Per-request nonce-based CSP set in the proxy, static headers in the Next config, both asserted against a served production build by the smoke suite | root `CLAUDE.md` (CSP section) |
| Redirects & origins | `resolveInternalPath()` for caller-supplied redirect targets; `getOrigin()` for absolute URLs built from a request, emailed links above all | root `CLAUDE.md` (Redirects section) |
| Stored content / XSS | User-authored markdown rendered only through the shared allow-list React renderer; no `dangerouslySetInnerHTML` anywhere in `src/` | root `CLAUDE.md` (Authored rich text) |
| Auth flows | Sign-out as form POST answered with a 303 (CSRF-safe); password changes only via the emailed reset flow; role promotion server-side only — signup metadata never decides a role | root `CLAUDE.md` (Auth architecture) |

The pattern behind the first two rows — converting correctness-by-convention into
correctness-by-mechanism with a build-failing completeness check — is generalized in
`../refactor-playbook.md`.

## Accepted risks

Each entry states what, why it is accepted, and what would reopen it. An accepted risk
is a standing decision — do not "fix" one without the owner reopening it.

### CSP `style-src 'unsafe-inline'`

Removing `'unsafe-inline'` from `style-src` would require nonce-ing every `<style>` tag,
which is impractical with Tailwind CSS (build-time style injection), `next/font`
(inline font variables), and JSX `style` props. The attack it prevents — CSS-based data
exfiltration via selector side-channels — already requires an HTML injection point and
is an extremely niche vector. **Accepted 2026-03.** Reopen if the styling stack changes
enough that nonce-ing becomes practical.

### Password-reset `token_hash` transits the query string

The reset flow (reworked 2026 to survive corporate email link-scanners that pre-fetch
and burn single-use links) emails a link to our own reset page carrying Supabase's
`hashed_token` in the query string; the token is consumed only on form submit — a POST a
passive scanner never makes. Until submit, the token is live in the URL and reaches the
places a query string is recorded: Vercel server access logs, and Vercel Web
Analytics/Speed Insights pageviews (no `beforeSend` scrub is configured). The recipient's
`email` param rides the same channel. `Referrer-Policy` closes the cross-origin
`Referer` vector but not these two.

**Accepted 2026-07**, because no privilege boundary is crossed: the only readers of
Vercel logs and analytics are admins, who already hold full access to every account, and
the token is single-use and short-TTL. The fragment alternative (`#token_hash=…`) would
close every vector at once but can be dropped by the very corporate link-rewriters the
flow exists to survive.

**Reopen if the trust model changes** — non-admin access to Vercel logs/analytics, or
forwarding to a third-party SIEM. Mitigation then: a `beforeSend` scrub stripping
`token_hash`/`email` from both analytics components, and reconsider the fragment.

## Continuous verification

- The DB access-control test and the authorization spine run on every CI push: a
  non-allowlisted callable function, a table without RLS, or an unclassified grant fails
  the build.
- The route posture registry's completeness checks fail the build on an unclassified or
  untested handler.
- The smoke suite asserts the security headers and per-request CSP against a served
  production build.

What CI cannot check is that the allowlists and classifications themselves are *right* —
that is what an audit is for.

## Next audit coverage

Beyond re-running the 2026-03 scope:

- **Redirect URL validation.** The 2026-03 audit did not cover it, and two real issues
  slipped through (a Host-header open redirect and a `//evil.com/path` return-path
  bypass — both since fixed, and both now impossible-by-mechanism via `getOrigin()` /
  `resolveInternalPath()`). The class needs explicit coverage.
- Re-verify served headers against production (e.g. securityheaders.com).

## Audit history

- **2026-03** — staging pen test, 10 findings (2 critical), all fixed or mitigated;
  remediation added the structural defenses now listed under Continuous verification.
  Frozen record: `../records/security-audit-2026-03.md`.
