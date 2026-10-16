/**
 * The decisions `export.mjs` makes before a browser starts — which origins a
 * signed-in run may point at, what backend the server at `--base` runs
 * against, who views each entry, and which account that viewer signs in as.
 *
 * Kept apart from the runner, and pure, so the guards that stand between a
 * password and the wrong server are proven by unit tests rather than by a run
 * that happened to go the right way. Each one throws an `Error` whose message is
 * the sentence the runner prints; nothing here reads the environment, the disk
 * or the network on its own.
 */

/**
 * The hosts a **signed-in** run may point a browser at — **loopback only, and
 * there is no override flag.**
 *
 * A signed-in run types a real password into the login form at whatever
 * `--base` names, so that one flag decides who receives a working credential. A
 * typo, a URL pasted out of a chat message or a copied command line is all it
 * would take to hand it to a stranger's server, and the person running it would
 * see nothing but an ordinary sign-in failure afterwards. A deployed origin, if
 * one is ever wanted for a signed-in run, is added here as a literal — never as
 * a flag, an environment variable, or a suffix pattern, since anyone can
 * register a hostname that ends the right way.
 *
 * **A signed-out run is not held to it, because the reason does not reach it**:
 * it reads no credential and types nothing, so the worst a wrong `--base` can do
 * is photograph the wrong site.
 */
export const ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** The URL's hostname as `URL` reports it — `[::1]` keeps its brackets. */
export const isLoopbackHost = (hostname) => ALLOWED_HOSTS.includes(hostname);

/** `--base` as an origin, or the reason it cannot be one for this run. */
export function resolveBase(raw, signedOut) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `--base is not a URL: ${raw}\n  Expected something like http://localhost:3005`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `--base must be http or https, not "${parsed.protocol}" (${raw}).`,
    );
  }
  if (!signedOut && !isLoopbackHost(parsed.hostname)) {
    throw new Error(
      `--base points at "${parsed.hostname}", which is not a local dev server\n` +
        `  (allowed: ${ALLOWED_HOSTS.join(", ")}, on any port).\n` +
        `  This preset signs in with a real password, so it only ever types it\n` +
        `  into a server on this machine. There is no override flag.`,
    );
  }
  return parsed.origin;
}

// ---------------------------------------------------------------------------
// Which backend the server runs against
// ---------------------------------------------------------------------------

/**
 * The Supabase origin a server is configured with, read off the
 * `Content-Security-Policy` header it sends with every page.
 *
 * **Asking the server, not a checkout.** The tool may run from one checkout
 * while `--base` is served by another, so the only file that knows which
 * database the server talks to is one the tool may not be able to see. The CSP
 * says it out loud: its `connect-src` names the configured Supabase origin as
 * the first concrete URL after `'self'` — `http://127.0.0.1:<port>` on a local
 * stack, `https://<ref>.supabase.co` on a hosted project. The wildcards that
 * follow it (`https://*.supabase.co`, the third parties) are never that origin,
 * and a server without the variable set falls back to the wildcard alone, which
 * is reported as "cannot tell" rather than guessed at.
 */
export function supabaseOriginFromCsp(csp) {
  if (!csp) return null;
  const directive = csp
    .split(";")
    .map((d) => d.trim().split(/\s+/))
    .find((tokens) => tokens[0] === "connect-src");
  if (!directive) return null;
  for (const token of directive.slice(1)) {
    if (!/^https?:\/\//.test(token) || token.includes("*")) continue;
    try {
      return new URL(token).origin;
    } catch {
      // A malformed token is not the origin; keep looking.
    }
  }
  return null;
}

/**
 * `"local"` — a stack on this machine, which carries the rich seed's accounts;
 * `"staging"` — a hosted Supabase project, which is staging for every local dev
 * server; `null` — the header did not say, and the run needs `--stack`.
 */
export function stackFromSupabaseOrigin(origin) {
  if (!origin) return null;
  const { protocol, hostname } = new URL(origin);
  if (isLoopbackHost(hostname)) return "local";
  if (protocol === "https:" && hostname.endsWith(".supabase.co")) {
    return "staging";
  }
  return null;
}

export const STACKS = ["local", "staging"];

/**
 * What the run signs in against: the detected stack, or `--stack` when the
 * server's header could not say.
 *
 * **The flag never overrides a detection.** Its job is to answer a question the
 * server left open; a flag that disagrees with what the server says would type
 * one backend's password into the other's login form, so the disagreement is
 * the error.
 */
export function resolveStack(detected, flag) {
  if (flag !== undefined && !STACKS.includes(flag)) {
    throw new Error(`--stack must be one of ${STACKS.join(", ")}, not "${flag}".`);
  }
  if (detected && flag && detected !== flag) {
    throw new Error(
      `--stack ${flag} disagrees with the server, which runs against ${
        detected === "local" ? "a local Supabase stack" : "hosted Supabase (staging)"
      }.\n  Drop the flag; it only answers when the server cannot say.`,
    );
  }
  const stack = detected ?? flag;
  if (!stack) {
    throw new Error(
      "Could not tell whether the server at --base runs against a local stack or\n" +
        "  staging: its Content-Security-Policy names no Supabase origin.\n" +
        "  Pass --stack local or --stack staging.",
    );
  }
  return stack;
}

// ---------------------------------------------------------------------------
// Who views an entry
// ---------------------------------------------------------------------------

export const ROLES = ["admin", "parent", "gamer", "gedu"];

/**
 * An entry's viewer: `entry.viewer`, else the preset's `viewer`, else `admin`.
 *
 * Written `"admin"`, `"parent"`, `"gedu"`, `"gamer"` (the parent's first gamer)
 * or `"gamer:<first name>"`. A signed-out preset has no viewer — every shot is a
 * first visit — so naming one there is refused rather than ignored.
 */
export function viewerOf(entry, preset) {
  const raw = entry.viewer ?? preset.viewer;
  if (preset.signedOut === true) {
    if (raw !== undefined) {
      throw new Error(
        `Entry "${entry.slug}" names viewer "${raw}" in a signed-out preset, ` +
          `where every shot is a first visit by nobody.`,
      );
    }
    return null;
  }
  const value = raw ?? "admin";
  const [role, ...rest] = String(value).split(":");
  const gamer = rest.join(":").trim() || null;
  if (!ROLES.includes(role) || (gamer && role !== "gamer")) {
    throw new Error(
      `Entry "${entry.slug}" names viewer "${value}"; expected one of ` +
        `${ROLES.join(", ")}, or gamer:<first name>.`,
    );
  }
  return { role, gamer, key: gamer ? `${role}:${gamer}` : role };
}

/**
 * Each viewer's sign-in on a local stack — the rich seed's accounts, all on the
 * password `password`. A gamer is reached through the parent, the way a family
 * hands a child the device, so it signs in as the parent.
 */
const SEED_PASSWORD = "password";
const SEED_ACCOUNTS = {
  admin: { email: "admin@example.com" },
  parent: { email: "parent@example.com", pin: "1111" },
  gamer: { email: "parent@example.com", pin: "1111" },
  gedu: { email: "gedu@example.com" },
};

/**
 * Staging's sign-ins, by the `.env.local` variables that hold them. There is no
 * staging educator account, so a gedu viewer against staging has none.
 */
const STAGING_VARS = {
  admin: { email: "STAGING_ADMIN_EMAIL", password: "STAGING_ADMIN_PASSWORD" },
  parent: {
    email: "STAGING_PARENT_EMAIL",
    password: "STAGING_PARENT_PASSWORD",
    pin: "STAGING_PARENT_PIN",
  },
  gedu: null,
};
STAGING_VARS.gamer = STAGING_VARS.parent;

/**
 * The account a viewer signs in with, or why there is none.
 *
 * **The base is checked again here, against the credential it is about to
 * receive.** A signed-in run only ever reaches this with a loopback base, but
 * the check costs one line and is the last thing between a password and a
 * stranger's server — so the function that hands a password out refuses to hand
 * it out for any other host, rather than trusting its caller did.
 *
 * Which password is chosen follows from `stack` and nothing else: the seed's
 * password goes only to a server running against a local stack, and the
 * staging password only to one running against staging.
 *
 * `source` is how an error names the account without printing a value.
 */
export function credentialsFor(role, stack, baseHostname, env) {
  if (!isLoopbackHost(baseHostname)) {
    throw new Error(
      `Refusing to sign in at "${baseHostname}": a signed-in run only types a ` +
        `password into a server on this machine.`,
    );
  }
  if (stack === "local") {
    const seed = SEED_ACCOUNTS[role];
    return {
      email: seed.email,
      password: SEED_PASSWORD,
      pin: seed.pin ?? null,
      source: `the rich seed's ${seed.email}`,
    };
  }
  if (stack !== "staging") throw new Error(`Unknown stack "${stack}".`);
  const vars = STAGING_VARS[role];
  if (!vars) {
    throw new Error(
      `The ${role} viewer has no staging account: there are no staging ` +
        `credentials for that role. Shoot it against a server running on a ` +
        `local stack (npm run db -- up), whose rich seed has one.`,
    );
  }
  const missing = Object.values(vars).filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(
      `The ${role} viewer against staging needs ${missing.join(", ")} in ` +
        `.env.local (or the environment).`,
    );
  }
  return {
    email: env[vars.email],
    password: env[vars.password],
    pin: vars.pin ? env[vars.pin] : null,
    source: Object.values(vars).join(" / "),
  };
}

/**
 * The gamer a `gamer` viewer switches into, from `GET /api/family/list`'s
 * `family`: the one with that first name, or the first gamer listed.
 */
export function pickGamer(family, name) {
  const gamers = family.filter((m) => m.role === "gamer");
  const found = name
    ? gamers.find((m) => m.first_name.toLowerCase() === name.toLowerCase())
    : gamers[0];
  if (!found) {
    throw new Error(
      name
        ? `The parent has no gamer named "${name}" (has: ${
            gamers.map((m) => m.first_name).join(", ") || "none"
          }).`
        : "The parent has no gamers to switch into.",
    );
  }
  return found;
}

/**
 * The page a viewer's sign-in is proven on: a page only that role is let into,
 * so landing anywhere else — the login form, the PIN gate, another role's
 * dashboard — means the sign-in did not produce the viewer the run asked for.
 */
export const VIEWER_PROBE = {
  admin: "/preview/products/consumer-club",
  parent: "/parent",
  gamer: "/gamer",
  gedu: "/gedu",
};
