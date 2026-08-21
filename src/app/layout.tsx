import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Press_Start_2P } from "next/font/google";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Providers } from "@/providers";
import { getUserWithProfile } from "@/lib/supabase/server";
import { resolveTimezone, TIMEZONE_COOKIE_NAME } from "@/lib/timezone";
import { REFERRAL_CODE_HEADER } from "@/lib/referral";
import { BRAND_LOCKUP } from "@/lib/constants";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { LayoutShiftTripwire } from "@/components/dev/layout-shift-tripwire";
import "./globals.css";

const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start-2p",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  // Both names, brand first — and not a translated string. It was one in every
  // locale file and identical in all five, which is what a mark being copied
  // rather than translated looks like; locales localise the copy around it. The
  // sub-page template below and `og:site_name` still say Sogverse alone, which
  // is an open information-architecture question rather than an oversight — see
  // the brand-vs-platform rule in the root CLAUDE.md.
  const title = BRAND_LOCKUP;
  const description = t("description");

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL!),
    title: {
      default: title,
      template: "%s | Sogverse",
    },
    description: t("shortDescription"),
    keywords: ["gaming", "education", "learning", "kids", "games"],
    openGraph: {
      type: "website",
      siteName: "Sogverse",
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
        className={`${pressStart2P.variable} antialiased bg-background text-foreground`}
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
        {/* Diagnostic for the intermittent ~20-40px post-load shift — logs
            browser-attributed layout shifts and scroll-residue landings to
            the console. Dev builds only; remove when convicted (TODO.md). */}
        {process.env.NODE_ENV === "development" && <LayoutShiftTripwire />}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
