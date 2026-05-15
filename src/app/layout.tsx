import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Inter, Press_Start_2P } from "next/font/google";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Providers } from "@/providers";
import { MouseflowConsent } from "@/components/layout";
import { getUserWithProfile } from "@/lib/supabase/server";
import { resolveTimezone, TIMEZONE_COOKIE_NAME } from "@/lib/timezone";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-press-start-2p",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  const title = t("title");
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
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;
  const locale = await getLocale();
  const cookieStore = await cookies();
  const initialTimezone = resolveTimezone(
    cookieStore.get(TIMEZONE_COOKIE_NAME)?.value,
  );
  // Captured once per request and passed to NowProvider as the seed for the
  // first client render — keeps SSR HTML and the first hydration render in
  // lockstep. Client-side tick takes over after mount.
  const initialNow = new Date();
  // Strip server-only namespaces (email, metadata) from the client bundle.
  // Server components access full messages via getTranslations() directly.
  const { email: _email, metadata: _metadata, ...clientMessages } =
    (await getMessages()) as Record<string, unknown>;

  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${pressStart2P.variable} antialiased bg-background text-foreground`}
      >
        <Providers
          initialUser={userWithProfile?.user ?? null}
          initialProfile={userWithProfile?.profile}
          initialLocale={locale}
          initialTimezone={initialTimezone}
          initialNow={initialNow}
          messages={clientMessages}
          nonce={nonce}
        >
          {/* Header rendering is owned by each route group's layout — that's
              how the (voice) group can replace the standard chrome with its
              own simplified header. Headers are `position: sticky top-0`
              (via `<SiteHeaderShell>`, sized by `--header-height`), so they
              reserve their own space in normal flow and no wrapper needs an
              offset to clear them. The document is the single scroll
              container; no inner element should set h-screen overflow-auto. */}
          {children}
          <MouseflowConsent nonce={nonce} />
        </Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}
