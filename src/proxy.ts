import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

import { ROUTES } from "@/lib/constants";
import { ROLE_DASHBOARD_PATHS } from "@/lib/constants/roles";
import { PIN_COOKIE_NAME, isPinTokenValid } from "@/lib/pin-session";
import {
  REFERRAL_CODE_HEADER,
  REFERRAL_QUERY_PARAM,
  sanitiseReferralCode,
} from "@/lib/referral";

// Paths a LOCKED customer session may still reach (so the parent-PIN gate
// doesn't trap them). `/api/*` is owned by requireRole(); auth routes are the
// sign-in/out flow; the rest are the gate itself, the profile chooser (where
// they can drop to a gamer or choose to enter the PIN), and the landing pages
// an emailed link points at. `verifyEmail` is exempt for the same reason
// `resetPin` is: the signed token in the URL is the authorization, the page
// grants nothing a parent's session would have granted, and bouncing a parent
// who opened their inbox on a locked device to the PIN pad would just lose the
// link.
//
// `resetPassword` and `forgotPassword` are exempt on exactly that reasoning,
// and the "lose the link" half is literal rather than figurative here: the
// bounce below redirects to the unlock gate carrying `?redirect=<pathname>`,
// and a pathname has no query string — so `?token_hash=…` is dropped on the
// way, and entering the PIN then lands the parent on a bare /reset-password
// that can only tell them their link expired. The gate buys nothing in return.
// Both pages are public, so a signed-out visitor walks onto them regardless,
// and the reset is authorized by possession of the mailbox, not by the parent
// session — a locked session reaching them is no more than an unlocked one
// could do by signing out first. The settings-page flow makes this the common
// case rather than the edge one: the parent presses the button while unlocked,
// then opens the mail an hour later, or on their phone, where the session has
// re-locked or never existed.
function isPinExemptPath(pathname: string, isAuthRoute: boolean): boolean {
  if (pathname.startsWith("/api/") || isAuthRoute) return true;
  const exempt = [
    ROUTES.customer.unlock,
    ROUTES.selectProfile,
    ROUTES.resetPin,
    ROUTES.verifyEmail,
    ROUTES.forgotPassword,
    ROUTES.resetPassword,
  ];
  return exempt.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

// Routes that don't require authentication
// resetPassword is public (not an auth route) because the page is reached from
// an emailed link carrying a single-use token, and the person holding that link
// may be in EITHER auth state: signed out because they forgot their password,
// or signed in because they asked for the mail from their own settings page. An
// auth route bounces the signed-in half to their dashboard, which would eat the
// token before the page read it.
// forgotPassword is public for the second half of that same story: when a link
// is expired or already used, the dead-link card sends the visitor here for a
// fresh one, and a signed-in visitor bounced to their dashboard has no way to
// ask for one. The form is harmless with a session — it only mails a link to
// the address typed into it, and the route behind it answers the same 200 to
// everyone regardless.
// ROUTES.voice.prefix is public because instant voice rooms are share-via-link
// by design — see src/components/voice/instant/CLAUDE.md. The authenticated group voice
// room at /voice/group/[id] is carved back out below — it shares the prefix
// but must require a session.
// ROUTES.shop covers the storefront and its product-detail pages (/shop/[id])
// via the prefix match below.
// ROUTES.schools is the public municipality-club discovery page; the prefix
// match also covers the per-municipality pages (/schools/[slug]).
// ROUTES.roblox is the partnership landing page — public so it can be shared
// with partners, but kept out of robots.txt and the sitemap rather than gated.
// ROUTES.verifyEmail is public rather than an AUTH_ROUTE: an auth route bounces
// a signed-in visitor to their dashboard, and the person clicking a
// verification link is very often already signed in — that bounce would eat the
// token before the page ever read it.
const PUBLIC_ROUTES = [ROUTES.home, ROUTES.shop, ROUTES.schools, ROUTES.help, ROUTES.privacy, ROUTES.termsAndConditions, ROUTES.antiBullying, ROUTES.attributions, ROUTES.docs, ROUTES.forgotPassword, ROUTES.resetPassword, ROUTES.resetPin, ROUTES.verifyEmail, ROUTES.roblox, ROUTES.voice.prefix];

// The /voice/* prefix is public for instant rooms, but /voice/group/[id] is
// the authenticated group voice room — seat-holders (a gamer, or a parent on
// their own seat) join as participants, gedus and admins as moderators. Every
// signed-in role may load the page; the token endpoint enforces membership and
// decides moderator rights. (A locked customer is still bounced to the PIN
// unlock screen by the parent-PIN gate below, like anywhere else.) We still
// gate at the proxy so unauthenticated visitors get redirected
// to /login instead of landing on a page that can't mint a token. Pulled
// from `ROUTES.voice.groupSessionPrefix` so a rename of the route helper
// stays in sync with the proxy carve-out.
const AUTH_REQUIRED_VOICE_PREFIX = ROUTES.voice.groupSessionPrefix;

// Routes for authentication (login, register, etc.)
const AUTH_ROUTES = [ROUTES.login, ROUTES.register, ROUTES.registerGedu];

/**
 * Build a Content-Security-Policy header value.
 * In production, uses a per-request nonce so only scripts explicitly tagged by
 * Next.js's SSR pipeline can execute (blocks injected inline scripts — the main
 * XSS vector CSP exists to stop).
 * In development, falls back to unsafe-inline/unsafe-eval because Next.js HMR
 * injects scripts outside the SSR pipeline that can't receive nonces.
 */
// Pulled from NEXT_PUBLIC_SUPABASE_URL at module load so we don't hardcode the
// project ref in CSP. Falls back to the wildcard host when the env var is
// missing (e.g. early in test setup) — production builds always have it set.
const SUPABASE_HOST = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "https://*.supabase.co";
  try {
    return new URL(url).origin;
  } catch {
    return "https://*.supabase.co";
  }
})();

function buildCspHeader(nonce: string): string {
  const isProd = process.env.NODE_ENV === "production";

  return [
    "default-src 'self'",
    isProd
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://c.daily.co",
    "style-src 'self' 'unsafe-inline'",
    // mc-heads.net renders the Minecraft skin body, which the shared game-account
    // row derives straight from a username — so it loads anywhere an identity is
    // shown (settings, rosters, the admin panel, the voice room).
    // tr.rbxcdn.com serves the Roblox avatar bust render — the thumbnails API hands back that one
    // host for every completed render, so it is named rather than wildcarded across *.rbxcdn.com.
    `img-src 'self' data: blob: ${SUPABASE_HOST} https://mc-heads.net https://tr.rbxcdn.com`,
    "font-src 'self'",
    // wss: Supabase Realtime, Daily.co signaling; sentry: Daily.co's bundled error reporting
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.daily.co wss://*.daily.co https://*.ingest.sentry.io",
    "frame-src 'self' https://*.daily.co https://*.stripe.com",
    // blob: workers used by Daily.co for WebRTC media processing
    "worker-src 'self' blob:",
    "frame-ancestors 'self'",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  // Generate a per-request nonce for CSP. Setting it on the request headers
  // lets Next.js's SSR pipeline read the nonce and apply it to every <script>
  // tag it renders (including next/script components like SpeedInsights).
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const cspHeader = buildCspHeader(nonce);

  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", cspHeader);

  // Referral attribution: `?ref=<code>` on the landing URL, sanitised here and
  // handed to the root layout, which seeds it into a client context provider so
  // it survives the whole visit as client-side navigation. See src/lib/referral.ts
  // for the constraints this feature is built to — the value never reaches the
  // user's device, at any point.
  //
  // **Delete unconditionally, then set conditionally.** A browser can send its
  // own `x-referral-code:` header, and an incoming request header reaches the
  // layout untouched on any request the proxy does not overwrite it on — so a
  // bare conditional `set` would leave a forgeable path. The harm is small
  // (anyone can type `?ref=` themselves, and the profile-creation trigger
  // re-sanitises regardless), but this is the difference between "the value
  // always came through our own sanitiser" being true and merely being intended.
  //
  // This runs above every branch and early return, like the two sets above, so
  // no path bypasses it. `.getAll()` rather than `.get()`: a repeated
  // `?ref=a&ref=b` is not a code and must resolve to absent, and `.get()` would
  // silently hand back the first value. (A `typeof x === "string"` check — the
  // idiom the register *page* uses on its `searchParams` — is dead code here:
  // `URLSearchParams.get()` can never return an array.)
  request.headers.delete(REFERRAL_CODE_HEADER);
  const referralValues = request.nextUrl.searchParams.getAll(REFERRAL_QUERY_PARAM);
  const referralCode =
    referralValues.length === 1 ? sanitiseReferralCode(referralValues[0]) : null;
  if (referralCode !== null) {
    request.headers.set(REFERRAL_CODE_HEADER, referralCode);
  }

  const { pathname } = request.nextUrl;

  let supabaseResponse = NextResponse.next({
    request,
  });
  supabaseResponse.headers.set("Content-Security-Policy", cspHeader);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          // Re-apply CSP after Supabase cookie handling recreates the response
          supabaseResponse.headers.set("Content-Security-Policy", cspHeader);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Verify (and refresh, if near expiry) the session — must happen before any
  // other logic. getClaims() verifies the JWT locally against the project's
  // ES256 JWKS, so there's no GoTrue round-trip on the hot path. The
  // getSession() it calls internally still refreshes the token when it's within
  // the expiry margin — writing new cookies via the handler above — so the
  // proxy remains the single token-refresh point. See docs/performance.md.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub ?? null;
  const sessionId = claimsData?.claims.session_id ?? null;

  // Helper: create a redirect that preserves refreshed auth cookies and CSP
  function redirect(url: URL) {
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    redirectResponse.headers.set("Content-Security-Policy", cspHeader);
    return redirectResponse;
  }

  // Check if route is public. /api/* always passes (handlers own their auth).
  // The /voice/group/[id] branch is excluded so its public-prefix match here
  // can't shadow the authenticated-route handling below.
  const isPublicRoute =
    pathname.startsWith("/api/") ||
    (!pathname.startsWith(AUTH_REQUIRED_VOICE_PREFIX) &&
      PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`)));

  // Check if route is for authentication
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  // Resolve the caller's role once (when authenticated) and reuse it for every
  // routing decision below. A valid PIN-unlock cookie is itself proof of a
  // verified customer, so it lets us skip the profile lookup entirely — that's
  // the short-circuit that keeps logged-out and already-unlocked traffic on
  // public pages (e.g. /shop) from paying for a query.
  //
  // Note this treats cookie validity as proof of *current* customer role, not
  // just unlock state — the token is an unforgeable HMAC over (userId,
  // session_id), so only a genuine customer who unlocked THIS session could hold
  // it. Not a security concern: the worst a stale cookie buys is acting as the
  // account it was already minted for. The one theoretical gap is a mid-session
  // role change (customer → gedu) leaving the old cookie treating them as a
  // customer until re-login — and we treat role changes as a thing that doesn't
  // happen mid-session. Privileged routes (`/admin`) are role-gated below
  // regardless, so this never grants access the role itself wouldn't.
  let userRole: Database["public"]["Enums"]["user_role"] | null = null;
  if (userId) {
    const pinVerified =
      sessionId !== null &&
      (await isPinTokenValid(request.cookies.get(PIN_COOKIE_NAME)?.value, userId, sessionId));

    if (pinVerified) {
      userRole = "customer";
    } else {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();
      if (!profileError) userRole = profile.role;

      // Parent-PIN gate: a locked customer session may not act as the parent
      // ANYWHERE — including public pages like /shop — so this runs before the
      // public-route early return. The boundary is the session's state, not the
      // route. API routes are gated separately in requireRole().
      if (userRole === "customer" && !isPinExemptPath(pathname, isAuthRoute)) {
        const unlockUrl = new URL(ROUTES.customer.unlock, request.url);
        unlockUrl.searchParams.set("redirect", pathname);
        return redirect(unlockUrl);
      }
    }
  }

  // Logged-in users on auth routes go to their dashboard.
  if (userId && isAuthRoute && userRole) {
    const dashboardPath = ROLE_DASHBOARD_PATHS[userRole] || ROUTES.customer.dashboard;
    return redirect(new URL(dashboardPath, request.url));
  }

  // Signed-in users visiting the home page get bounced to their dashboard, so
  // the home page isn't a dead-end once you're logged in. Mirrors the SOG-logo
  // behavior, which links to the dashboard for every role.
  if (userId && userRole && pathname === ROUTES.home) {
    return redirect(new URL(ROLE_DASHBOARD_PATHS[userRole], request.url));
  }

  // If public route or auth route, allow access
  if (isPublicRoute || isAuthRoute) {
    return supabaseResponse;
  }

  // For protected routes, require authentication
  if (!userId) {
    const loginUrl = new URL(ROUTES.login, request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return redirect(loginUrl);
  }

  // Protected route but the role lookup failed → bounce to login.
  if (!userRole) {
    return redirect(new URL(ROUTES.login, request.url));
  }

  // /settings is shared across roles — accessible to any authenticated user.
  if (pathname.startsWith(ROUTES.settings)) {
    return supabaseResponse;
  }

  // /preview/* are admin-only mock surfaces indexed on /admin/ui-previews:
  // full pages rendered from fixtures, each composing the chrome of the role
  // whose page it mocks. Only admins should be able to reach them. Non-admins
  // bounce to their own dashboard; unauthenticated users were already
  // redirected to /login above. The prefix match covers every future scene.
  if (pathname.startsWith("/preview/") && userRole !== "admin") {
    return redirect(new URL(ROLE_DASHBOARD_PATHS[userRole], request.url));
  }

  // Check if user has access to the requested route
  for (const [role, basePath] of Object.entries(ROLE_DASHBOARD_PATHS)) {
    if (pathname.startsWith(basePath)) {
      if (role !== userRole) {
        const correctDashboard = ROLE_DASHBOARD_PATHS[userRole];
        return redirect(new URL(correctDashboard, request.url));
      }
      break;
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     * - Next.js metadata file conventions (opengraph-image, sitemap.xml, robots.txt)
     * - api/locations/search — see below, this one is load-bearing
     *
     * **Rule: a route whose response is marked publicly cacheable must not pass
     * through here.** This proxy refreshes a near-expiry session and writes the
     * new auth cookies onto whatever response it is handling. The location
     * search route answers with `s-maxage=300` because its body depends only on
     * the URL — but if the proxy attached a `Set-Cookie` to that same response,
     * a shared cache holding it would hand one signed-in user's refreshed
     * session to every anonymous requester of that URL. Concretely: a gedu
     * whose token is inside the refresh margin types in the coverage picker,
     * and the reply carries both their cookies and permission to cache.
     *
     * Vercel declines to cache a response carrying `Set-Cookie`, so this has
     * never been reachable in production — but that is one vendor's behaviour
     * standing between us and session disclosure, not a decision this repo
     * made. Excluding the path makes it ours. The route needs nothing from the
     * proxy anyway: it reads no cookies and builds its own anonymous client.
     */
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|sitemap\\.xml|robots\\.txt|api/locations/search|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
