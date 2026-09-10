import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import {
  Crimson_Pro,
  Dancing_Script,
  Poppins,
  Space_Mono,
} from "next/font/google";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Providers } from "@/providers";
import { getUserWithProfile } from "@/lib/supabase/server";
import { resolveTimezone, TIMEZONE_COOKIE_NAME } from "@/lib/timezone";
import { UTM_HEADER, parseUtmHeader } from "@/lib/utm";
import { BRAND_LOCKUP, toDetectedLocale } from "@/lib/constants";
import { isSupportedLocale, resolveLocale } from "@/lib/constants/locales";
import { ogCardImage } from "@/lib/og/card-metadata";
import { getServerConsent } from "@/lib/consent.server";
import {
  AnalyticsScripts,
  ConsentBanner,
  MarketingPixels,
} from "@/components/consent";
import "../globals.css";

// The face contract, honoured on the consumer's side.
//
// @sog/ui names the faces and the semantic tokens that point at them
// (`packages/sog-ui/src/tokens/typography.ts` — weights, styles, subsets and
// the variable each token reads are all stated there); Sogverse loads the files and
// defines those variables. next/font reads its options statically, so the values
// below cannot be imported from the token source, and
// tests/unit/theme/face-contract.test.ts asserts this file names every one of
// them instead. Every face in `FACES` is loaded here, whether or not a surface
// renders it yet: the contract is the whole list, not the used part of it.
const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-poppins",
});

// The editorial voice, placed on the About page's pull quote — the library owns
// where it may go (quotes and pull-quotes, never UI or body copy) and that is
// two of those placements at once. Loaded in both styles, alone among the four:
// the quote is italic, and a serif left to the browser's own slant is a skew of
// the upright alphabet rather than the italic one, which is a different
// alphabet.
//
// `preload: false` because that one placement is not first-paint-critical on
// any route: preloading would have every page in the app emit preload links for
// the serif's files, for a face only the About page's quote ever draws. It is
// fetched when that quote is rendered.
const crimsonPro = Crimson_Pro({
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-crimson-pro",
  preload: false,
});

// The site's one monospace, and the machine face: a room code, a password, an
// id, a log, a placeholder no customer should see. The library owns that rule —
// and owns the decision that it is never a voice, a heading or a name — while
// Sogverse loads the face and spends it through `font-mono`, which real
// surfaces reach for on first paint, so it preloads.
const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-space-mono",
});

// The hand-written face a signature renders in. `latin-ext` is not optional:
// the names it draws are Finnish ones, and without that subset every ä and ö
// falls back to the body font mid-name.
const dancingScript = Dancing_Script({
  weight: "600",
  subsets: ["latin", "latin-ext"],
  variable: "--font-dancing-script",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
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
  // The site-wide card, at this URL's locale. It is emitted here rather than by
  // a file convention: `opengraph-image.tsx` has no locale to render at and
  // outranks config metadata, so the URL it emits could not be overridden. See
  // `@/lib/og/cards`. One object for both blocks, because Next replaces a
  // child's `twitter` wholesale and the two must not drift apart.
  const card = await ogCardImage("site", locale);

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
    // **Klingon is `noindex`, not a robots.txt disallow.** `/tlh/…` is real,
    // crawlable URL-space that is excluded from the sitemap and from every
    // `hreflang` set, which search engines treat as orphaned duplicates — so it
    // says so itself. Disallow would be the wrong tool for the reason the
    // Roblox pages already document: a disallowed URL is never fetched, so the
    // tag is never read, and the URL can still be indexed bare.
    ...(locale === "tlh" && { robots: { index: false } }),
    openGraph: {
      type: "website",
      siteName: "School of Gaming",
      title,
      description,
      locale,
      images: [card],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [card],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  // **The URL is the authority.** The segment is validated here rather than
  // trusted: anything that is not a locale we ship has no page behind it, and a
  // 404 is the honest answer — falling back to English would make `/xx/shop` a
  // second, uncanonical URL for the English shop.
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const userWithProfile = await getUserWithProfile();
  const cookieStore = await cookies();
  const initialTimezone = resolveTimezone(
    cookieStore.get(TIMEZONE_COOKIE_NAME)?.value,
  );
  // Captured once per request and passed to NowProvider as the seed for the
  // first client render — keeps SSR HTML and the first hydration render in
  // lockstep. Client-side tick takes over after mount.
  const initialNow = new Date();
  // The UTM attribution for this visit, already sanitised (and, on any request
  // that did not carry one, already deleted) by the proxy — a layout cannot
  // receive `searchParams`, and `useSearchParams()` in a root-level client
  // provider would put the whole app under a Suspense boundary whose *fallback*
  // is what gets prerendered. This `headers()` call is free: the layout is fully
  // dynamic already (it reads cookies and loads the user's profile) with no PPR
  // or component caching enabled, so it adds no cost and no Suspense
  // requirement. The parse re-sanitises every field, so the values reaching the
  // provider came through our own sanitiser whatever the header said.
  const requestHeaders = await headers();
  const initialUtm = parseUtmHeader(requestHeaders.get(UTM_HEADER));
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
  // What this visitor has agreed to run, read from the same cookie the browser
  // provider writes. Resolved on the server so the SSR HTML and the first
  // client render carry the same set of optional scripts — a client-only read
  // would mount (or unmount) a third-party script at hydration.
  const initialConsent = await getServerConsent();
  // The proxy's per-request CSP nonce. Production `script-src` is
  // `'nonce-…' 'strict-dynamic'`, so this is what lets the pixels' inline
  // snippets run at all; every other script on the page is nonced by Next's
  // own SSR pipeline, which reads the same header. Empty string on the
  // impossible path where the header is missing: that yields an un-nonced
  // script the policy blocks, which is the safe direction to fail in.
  const nonce = requestHeaders.get("x-nonce") ?? "";
  // Strip server-only namespaces (email, metadata) from the client bundle.
  // Server components access full messages via getTranslations() directly.
  const { email: _email, metadata: _metadata, ...clientMessages } =
    (await getMessages()) as Record<string, unknown>;

  // Every next/font variable class goes on <html> — that is, on `:root` — never
  // on <body>. The theme declares its font tokens inside `@theme`, which emits
  // them at `:root`, so a face variable defined one element lower is invisible
  // there: `--font-sans: var(--font-poppins), system-ui, sans-serif` computes
  // with the first entry invalid and falls through to the UA stack while the
  // page still looks styled, which is the failure mode that hides best. An
  // earlier Inter attempt was wired exactly that way and silently never applied
  // for as long as it shipped.
  return (
    <html
      lang={locale}
      className={`${poppins.variable} ${crimsonPro.variable} ${spaceMono.variable} ${dancingScript.variable}`}
    >
      <body className="antialiased bg-background text-foreground">
        <Providers
          initialUser={userWithProfile?.user ?? null}
          initialProfile={userWithProfile?.profile}
          initialLocale={locale}
          initialTimezone={initialTimezone}
          initialNow={initialNow}
          initialUtm={initialUtm}
          initialConsent={initialConsent}
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
          {/* Everything downstream of the consent question, and all of it
              inside `Providers` because each piece reads the consent context
              (and the banner also translates its own words).

              In the layout tree rather than a portal, deliberately: dialogs
              portal into `document.body` at runtime and share the banner's
              `z-50`, so a banner appended after them would paint over an open
              dialog. As a sibling of `children` it is always earlier in the
              body than any portal, which is what keeps the stacking right
              without either side hardcoding a higher number.

              The banner is `position: fixed`, so it overlays the page and
              nothing already painted moves when it appears or goes. */}
          <ConsentBanner />
          <AnalyticsScripts />
          <MarketingPixels nonce={nonce} />
        </Providers>
      </body>
    </html>
  );
}
