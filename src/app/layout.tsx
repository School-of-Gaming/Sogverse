import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import {
  Dancing_Script,
  Poppins,
  Press_Start_2P,
  Space_Mono,
} from "next/font/google";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Providers } from "@/providers";
import { getUserWithProfile } from "@/lib/supabase/server";
import { resolveTimezone, TIMEZONE_COOKIE_NAME } from "@/lib/timezone";
import { REFERRAL_CODE_HEADER } from "@/lib/referral";
import { BRAND_LOCKUP, toDetectedLocale } from "@/lib/constants";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// The brand's workhorse face, and the one every page's body and headings are
// set in — `--font-sans` in globals.css points at it, so nothing outside that
// one line names the family. Poppins is not a variable font on Google Fonts, so
// each weight is a separate file and has to be asked for by name: 400/500/600/
// 700 are what `font-normal`/`font-medium`/`font-semibold`/`font-bold` render,
// and a weight not listed here is synthesised by the browser rather than drawn.
// `latin-ext` is not optional — the product ships Finnish, Swedish and French.
const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-poppins",
});

// DELIBERATELY UNUSED IN THIS BRANCH — do not remove it as dead weight. Space
// Mono is a sanctioned brand face; where it is actually placed is decided by the
// companion design-pass plan, and this load exists so that plan is a styling
// change rather than a styling change plus a font wiring change. It is loaded,
// its variable is on <html>, and nothing reads it yet. That is the intended
// state. `preload: false` follows from that: a preload link for a face no
// element renders costs every visitor a font download for nothing, so preload
// turns back on in the same change that first places the face.
const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-space-mono",
  preload: false,
});

const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start-2p",
});

// The hand-written face a signature renders in. `latin-ext` is not optional:
// the names it draws are Finnish ones, and without that subset every ä and ö
// falls back to the body font mid-name.
const dancingScript = Dancing_Script({
  weight: "600",
  subsets: ["latin", "latin-ext"],
  // The face's own variable; `--font-cursive` in globals.css points at it, the
  // same indirection `--font-display` uses for Press Start 2P, so a component
  // asks for "the cursive font" and never for a specific family.
  variable: "--font-dancing-script",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  // Both names, brand first — and not a translated string. It was one in every
  // locale file and identical in all five, which is what a mark being copied
  // rather than translated looks like; locales localise the copy around it.
  // The root title is the one place with room for the lockup; the sub-page
  // template and `og:site_name` below carry the brand alone, because a tab is
  // read while scanning a row of them for the name the reader came looking for
  // (CLAUDE.md § Brand vs. Platform).
  const title = BRAND_LOCKUP;
  const description = t("description");

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL!),
    title: {
      default: title,
      template: "%s | School of Gaming",
    },
    // One description, everywhere. This used to be the short line — the brand
    // name and the tagline joined by an en dash — which spent a search snippet
    // restating what the title above it already says, and borrowed the shape of
    // the `School of Gaming – Sogverse` lockup for something that is not one.
    // The longer sentence is the one that tells a stranger what we actually run,
    // which is the job of both a snippet and a link preview, so both get it.
    description,
    keywords: ["gaming", "education", "learning", "children", "games"],
    openGraph: {
      type: "website",
      siteName: "School of Gaming",
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userWithProfile = await getUserWithProfile();
  const locale = await getLocale();
  const cookieStore = await cookies();
  const initialTimezone = resolveTimezone(
    cookieStore.get(TIMEZONE_COOKIE_NAME)?.value,
  );
  // Captured once per request and passed to NowProvider as the seed for the
  // first client render — keeps SSR HTML and the first hydration render in
  // lockstep. Client-side tick takes over after mount.
  const initialNow = new Date();
  // The `?ref=` code for this visit, already sanitised (and, on any request that
  // did not carry one, already deleted) by the proxy — a layout cannot receive
  // `searchParams`, and `useSearchParams()` in a root-level client provider
  // would put the whole app under a Suspense boundary whose *fallback* is what
  // gets prerendered. This `headers()` call is free: the layout is fully dynamic
  // already (it reads cookies and loads the user's profile) with no PPR or
  // component caching enabled, so it adds no cost and no Suspense requirement.
  const requestHeaders = await headers();
  const initialReferralCode = requestHeaders.get(REFERRAL_CODE_HEADER);
  // What this browser *asked* for, read straight from Accept-Language and
  // deliberately bypassing both the `locale` cookie and `profiles.locale` —
  // those carry the answer the user has already given us, and this is the
  // question. Analytics compares the two (see `trackLocaleChange`), so folding
  // them together here would delete the only signal we're after — which is also
  // why this uses `toDetectedLocale` and not `detectLocaleFromHeader`: no match
  // has to stay distinguishable from a match on English, so it becomes `"none"`
  // here rather than collapsing into the default locale.
  const detectedLocale = toDetectedLocale(
    requestHeaders.get("accept-language"),
  );
  // Strip server-only namespaces (email, metadata, calendarFeed) from the
  // client bundle. Server components access full messages via
  // getTranslations() directly; `calendarFeed` is written into an `.ics`
  // document by a route handler and reaches no screen this app renders.
  const {
    email: _email,
    metadata: _metadata,
    calendarFeed: _calendarFeed,
    ...clientMessages
  } = (await getMessages()) as Record<string, unknown>;

  // Every next/font variable class goes on <html> — that is, on `:root` — never
  // on <body>. globals.css declares its font tokens inside `@theme`, which emits
  // them at `:root`, so a face variable defined one element lower is invisible
  // there: `--font-sans: var(--font-poppins)` would compute to the
  // guaranteed-invalid value and take the whole `font-family` declaration down
  // with it, leaving the UA stack. An earlier Inter attempt was wired exactly
  // that way and silently never applied for as long as it shipped. The utility
  // classes (`font-display`, `font-cursive`) survived that mistake only because
  // `@theme inline` inlines their `var()` at the use site, where <body> is an
  // ancestor — which is precisely why the failure was invisible.
  return (
    <html
      lang={locale}
      className={`${poppins.variable} ${spaceMono.variable} ${pressStart2P.variable} ${dancingScript.variable}`}
    >
      <body className="antialiased bg-background text-foreground">
        <Providers
          initialUser={userWithProfile?.user ?? null}
          initialProfile={userWithProfile?.profile}
          initialLocale={locale}
          initialTimezone={initialTimezone}
          initialNow={initialNow}
          initialReferralCode={initialReferralCode}
          detectedLocale={detectedLocale}
          messages={clientMessages}
        >
          {/* Header rendering is owned by each route group's layout — that's
              how a group can vary what sits around the header (the (voice)
              group renders the standard one with no footer, the (preview)
              group renders no chrome at all). Headers are `position: sticky
              top-0` (via `<SiteHeaderShell>`, sized by `--header-height`), so
              they reserve their own space in normal flow and no wrapper needs
              an offset to clear them. The document is the single scroll
              container; no inner element should set h-screen overflow-auto. */}
          {children}
        </Providers>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
