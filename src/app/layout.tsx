import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Press_Start_2P } from "next/font/google";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Providers } from "@/providers";
import { MouseflowConsent } from "@/components/layout";
import { getUserWithProfile } from "@/lib/supabase/server";
import { getStripeProducts } from "@/lib/stripe/products";
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
  // Strip server-only namespaces (email, metadata) from the client bundle.
  // Server components access full messages via getTranslations() directly.
  const { email: _email, metadata: _metadata, ...clientMessages } =
    (await getMessages()) as Record<string, unknown>;
  // getStripeProducts() is backed by unstable_cache (persistent data cache, 5-min revalidation).
  // Callers always get the cached value instantly — Stripe is only contacted during background
  // revalidation, so this adds no latency and no runtime dependency on Stripe availability.
  const { baseRates } = await getStripeProducts();

  return (
    <html lang={locale} className="dark overflow-hidden" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${pressStart2P.variable} antialiased bg-background text-foreground`}
      >
        <Providers
          initialUser={userWithProfile?.user ?? null}
          initialProfile={userWithProfile?.profile}
          initialLocale={locale}
          messages={clientMessages}
          baseRates={baseRates}
          nonce={nonce}
        >
          {/* Header rendering is owned by each route group's layout — that's how
              the (voice) group can replace the standard chrome with its own
              simplified header. The pt-16 reserves space for whichever fixed
              header the active group renders. */}
          <main className="h-screen overflow-auto pt-16">
            {children}
          </main>
          <MouseflowConsent nonce={nonce} />
        </Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}
