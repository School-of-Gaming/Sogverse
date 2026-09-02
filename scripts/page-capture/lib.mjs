/**
 * Shared plumbing for the page-capture tool: environment, the three guards, and
 * the two ways this tool talks to Supabase (the service-role key, and a real
 * signed-in user's JWT).
 *
 * All three trust decisions live here together, on purpose — *which database may
 * be written to* (`assertStaging`), *which server the fleet's password may be
 * typed at* (`assertCaptureOrigin`), and *where the file holding that password
 * may be written* (`resolveStatePath`). Each is imported by every script that
 * needs it so there is exactly one copy of each check; a second copy is a second
 * thing to get wrong, and keeping them in one file is what lets a reader see the
 * whole trust boundary at once. None of the three has an override flag.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** This tool's own directory — the only place its state file may live. */
export const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));

const HERE = TOOL_DIR;

/** `scripts/page-capture/` → the repo (or worktree) root two levels up. */
export const REPO_ROOT = path.resolve(HERE, "..", "..");

/**
 * The Supabase projects this tool is allowed to write to.
 *
 * Hardcoded, not read from the environment, and with no override flag — the
 * whole point is that it cannot be pointed somewhere else by editing a `.env`
 * or typing a flag in a hurry. Prod (`yoqkelsopqsksqrkrorx`) is deliberately
 * absent and must stay absent: this tool invents accounts, enrols them, and
 * then deletes them again, none of which has any business happening near a
 * family's real data.
 */
export const STAGING_PROJECT_REFS = ["dbcozhkmfsczwgduizkg"];

/** Load `.env.local` without clobbering the shell — the shell always wins. */
export function loadEnvLocal() {
  const p = path.join(REPO_ROOT, ".env.local");
  if (!existsSync(p)) {
    throw new Error(`No .env.local at ${p}`);
  }
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

/**
 * Resolve the Supabase project this run would touch, and refuse anything that
 * is not on the staging allowlist.
 *
 * The ref is taken from **two** independent places — the project ref variable
 * and the host of the API URL the scripts actually call — and both have to
 * agree. That matters because the URL is what every request goes to; checking
 * only the ref variable would happily pass a `.env.local` whose ref says
 * staging while its URL points at prod.
 */
export function assertStaging() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const declaredRef = process.env.SUPABASE_PROJECT_REF;

  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
    !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    !declaredRef && "SUPABASE_PROJECT_REF",
  ].filter(Boolean);
  if (missing.length > 0) {
    fail(`.env.local is missing: ${missing.join(", ")}`);
  }

  let urlRef;
  try {
    urlRef = new URL(url).hostname.split(".")[0];
  } catch {
    fail(`NEXT_PUBLIC_SUPABASE_URL is not a URL: ${url}`);
  }

  if (urlRef !== declaredRef) {
    fail(
      `SUPABASE_PROJECT_REF (${declaredRef}) and NEXT_PUBLIC_SUPABASE_URL ` +
        `(${urlRef}) name different projects. Refusing to guess which one you meant.`,
    );
  }

  if (!STAGING_PROJECT_REFS.includes(urlRef)) {
    fail(
      `Project "${urlRef}" is not on the staging allowlist ` +
        `(${STAGING_PROJECT_REFS.join(", ")}).\n` +
        `This tool creates and deletes accounts. It only ever runs against staging.`,
    );
  }

  return { url, serviceKey, anonKey, ref: urlRef };
}

/** Print loudly and exit non-zero. Guard failures are never warnings. */
export function fail(message) {
  console.error(`\n  REFUSING TO RUN\n  ${message}\n`);
  process.exit(1);
}

/**
 * The hosts `capture.mjs` is allowed to point a browser at.
 *
 * Hardcoded and loopback-only, for the same reason the project allowlist above
 * is hardcoded: the capture types the fleet's shared password into a login form
 * at whatever `--base-url` names, so that flag decides who receives a working
 * staging credential. A typo, a pasted URL from a chat message or a copied
 * command line is all it takes to hand it to a stranger's server, and the person
 * running it would see a perfectly ordinary sign-in failure afterwards.
 *
 * If this tool is ever wanted against a deployed staging preview, that origin is
 * added here as a literal — never as a flag, an environment variable or a
 * pattern. A hostname suffix match ("ends with .vercel.app") is not an allowlist:
 * anyone can register a name that satisfies it.
 */
export const CAPTURE_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Resolve `--base-url` and refuse anything that is not a local dev server.
 *
 * Any port is fine — the tool's own `serve.mjs` defaults to 3002 and everyone
 * has a different one running — but the host and the scheme are not negotiable.
 */
export function assertCaptureOrigin(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    fail(
      `--base-url is not a URL: ${baseUrl}\n` +
        `  Expected something like  http://localhost:3002`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail(
      `--base-url must be http or https, not "${parsed.protocol}" (${baseUrl}).`,
    );
  }

  if (!CAPTURE_ALLOWED_HOSTS.includes(parsed.hostname)) {
    fail(
      `--base-url points at "${parsed.hostname}", which is not a local dev server\n` +
        `  (allowed: ${CAPTURE_ALLOWED_HOSTS.join(", ")}, on any port).\n` +
        `  This capture signs in with the seeded fleet's real staging password, so it\n` +
        `  only ever types it into a server running on this machine. There is no\n` +
        `  override flag: point it at your own dev server, or start one with\n` +
        `    node scripts/page-capture/serve.mjs --port 3002`,
    );
  }

  return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
}

/**
 * Resolve a `--state` / `--out` state-file path, confined to this directory.
 *
 * `seed-state.json` holds the fleet's shared password and the parent's PIN in
 * plain text, and this directory is the one place the repo's `.gitignore`
 * accounts for it. A flag that can walk out of here — `--state ../../creds.json`,
 * or an absolute path into a synced folder — turns a screenshot run into a
 * credential written somewhere nobody is watching, and the tool would report
 * nothing wrong because it works perfectly.
 *
 * So the flag names a **file in this directory**, and nothing else: the value is
 * resolved against this directory rather than the working directory (so a bare
 * name means the same thing from any cwd), and anything that lands outside is
 * refused rather than silently re-anchored — a path that quietly became a
 * different path is the failure this is meant to make visible.
 */
export function resolveStatePath(flagName, value) {
  const raw = value ?? "seed-state.json";
  const resolved = path.resolve(TOOL_DIR, raw);
  const relative = path.relative(TOOL_DIR, resolved);

  const escapes =
    relative === "" || relative.startsWith("..") || path.isAbsolute(relative);
  const nested = !escapes && relative.includes(path.sep);

  if (escapes || nested) {
    fail(
      `The seed state carries the fleet's password and the parent's PIN, so it may\n` +
        `  only be written inside the tool's own (gitignored) directory:\n` +
        `    ${TOOL_DIR}\n` +
        `  --${flagName} ${raw}\n` +
        `  resolves to ${resolved}, which is ${escapes ? "outside it" : "in a subdirectory"}.\n` +
        `  Pass a bare file name (--${flagName} other-run.json), or omit the flag.`,
    );
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Supabase over plain fetch
//
// No @supabase/supabase-js here on purpose: everything this tool needs is two
// REST endpoints and the auth admin API, and going direct keeps the script
// readable as a list of the HTTP calls a person would otherwise make by hand.
// ---------------------------------------------------------------------------

/** A client bound to one project and one credential. */
export function supabaseClient({ url, key, token }) {
  const bearer = token ?? key;

  async function request(pathname, { method = "GET", body, headers = {} } = {}) {
    const res = await fetch(`${url}${pathname}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const detail =
        parsed && typeof parsed === "object"
          ? (parsed.message ?? parsed.error_description ?? parsed.error ?? JSON.stringify(parsed))
          : String(parsed ?? "");
      const err = new Error(`${method} ${pathname} → ${res.status}: ${detail}`);
      err.status = res.status;
      err.payload = parsed;
      throw err;
    }

    return parsed;
  }

  return {
    request,

    /** Call a Postgres function. Errors carry the RAISE text, which is the point. */
    rpc: (name, args = {}) =>
      request(`/rest/v1/rpc/${name}`, { method: "POST", body: args }),

    /** PostgREST read. `query` is a raw query string, e.g. `id=eq.…&select=*`. */
    select: (table, query) => request(`/rest/v1/${table}?${query}`),

    insert: (table, rows) =>
      request(`/rest/v1/${table}`, {
        method: "POST",
        body: rows,
        headers: { Prefer: "return=representation" },
      }),

    update: (table, query, patch) =>
      request(`/rest/v1/${table}?${query}`, {
        method: "PATCH",
        body: patch,
        headers: { Prefer: "return=representation" },
      }),

    remove: (table, query) =>
      request(`/rest/v1/${table}?${query}`, { method: "DELETE" }),
  };
}

/**
 * Create an auth user the way the app's own admin client does: confirmed
 * email, names in `user_metadata` so `handle_new_user()` can seed the profile.
 *
 * A password is passed here where the app would omit one. That is a deliberate
 * departure from `docs/runbooks/create-admin-account.md`, which has a real
 * person set their own through the reset mail: these accounts exist to be
 * *logged into by a script* minutes after they are made, and they are deleted
 * again at the end of the same run.
 */
export async function createAuthUser(service, { email, password, firstName, lastName }) {
  const displayName = [firstName, lastName].filter(Boolean).join(" ");
  const user = await service.request("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      ...(password ? { password } : {}),
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName ?? "",
        display_name: displayName,
      },
    },
  });
  return user.id;
}

export async function deleteAuthUser(service, userId) {
  await service.request(`/auth/v1/admin/users/${userId}`, { method: "DELETE" });
}

/**
 * Sign in and return an access token.
 *
 * Every admin-gated RPC this tool calls guards on `assert_admin()`, which reads
 * `auth.uid()` — so the service-role key cannot call them at all (it carries no
 * `sub`). A real session token is not a convenience here, it is the only way
 * in, and it is also what makes the seed exercise the same guards the admin UI
 * does rather than a privileged bypass around them.
 */
export async function signIn({ url, anonKey }, email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      `sign-in failed for ${email}: ${body.error_description ?? body.msg ?? res.status}`,
    );
  }
  return body.access_token;
}

// ---------------------------------------------------------------------------
// Small shared utilities
// ---------------------------------------------------------------------------

/** `--flag value` → value; `--flag` present with no value → `fallback`. */
export function argOf(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : fallback;
}

export function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

/**
 * A run suffix: `0902-1431-a7f3`. Date-first so a directory listing sorts
 * chronologically, random tail so two runs in the same minute cannot collide.
 * Every account, product and group this tool creates carries it, which is what
 * lets a second seed run happily beside a first fleet.
 *
 * **This is an identifier, not a secret, and nothing may be derived from it.**
 * It is printed, stamped on every seeded product name and embedded in every
 * seeded address, so anyone who can see a fleet can read it — and `Math.random`
 * is a collision-avoidance tail here, never entropy. The fleet password used to
 * be built from this string; it is now drawn from `crypto.randomBytes` instead.
 */
export function makeRunId(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const stamp =
    `${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  const tail = Math.random().toString(16).slice(2, 6);
  return `${stamp}-${tail}`;
}

export const log = {
  step: (msg) => console.log(`\n▸ ${msg}`),
  ok: (msg) => console.log(`  ✓ ${msg}`),
  warn: (msg) => console.warn(`  ! ${msg}`),
  info: (msg) => console.log(`    ${msg}`),
};
