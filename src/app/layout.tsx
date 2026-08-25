import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Dancing_Script, Press_Start_2P } from "next/font/google";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Providers } from "@/providers";
import { getUserWithProfile } from "@/lib/supabase/server";
import { resolveTimezone, TIMEZONE_COOKIE_NAME } from "@/lib/timezone";
import { REFERRAL_CODE_HEADER } from "@/lib/referral";
import { BRAND_LOCKUP } from "@/lib/constants";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

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
    keywords: ["gaming", "education", "learning", "kids", "games"],
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
  const initialReferralCode = (await headers()).get(REFERRAL_CODE_HEADER);
  // Strip server-only namespaces (email, metadata) from the client bundle.
  // Server components access full messages via getTranslations() directly.
  const { email: _email, metadata: _metadata, ...clientMessages } =
    (await getMessages()) as Record<string, unknown>;

  return (
    <html lang={locale}>
      <body
        className={`${pressStart2P.variable} ${dancingScript.variable} antialiased bg-background text-foreground`}
      >
        <Providers
          initialUser={userWithProfile?.user ?? null}
          initialProfile={userWithProfile?.profile}
          initialLocale={locale}
          initialTimezone={initialTimezone}
          initialNow={initialNow}
          initialReferralCode={initialReferralCode}
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
