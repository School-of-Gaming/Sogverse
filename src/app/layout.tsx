import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Press_Start_2P } from "next/font/google";
import { Providers } from "@/providers";
import { Header } from "@/components/layout";
import { getUserWithProfile } from "@/lib/supabase/server";
import { parseAcceptLanguage, DEFAULT_LOCALE } from "@/lib/locale";
import { getStripeProducts } from "@/lib/stripe/products";
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

export const metadata: Metadata = {
  title: {
    default: "Sogverse - School of Gaming",
    template: "%s | Sogverse",
  },
  description:
    "School of Gaming - Where screen time becomes quality time",
  keywords: ["gaming", "education", "learning", "kids", "games"],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userWithProfile = await getUserWithProfile();
  const headersList = await headers();
  const locale = parseAcceptLanguage(headersList.get("accept-language")) ?? DEFAULT_LOCALE;
  // getStripeProducts() is backed by unstable_cache (persistent data cache, 5-min revalidation).
  // Callers always get the cached value instantly — Stripe is only contacted during background
  // revalidation, so this adds no latency and no runtime dependency on Stripe availability.
  const { baseRates } = await getStripeProducts();

  return (
    <html lang="en" className="dark overflow-hidden" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${pressStart2P.variable} antialiased bg-background text-foreground`}
      >
        <Providers
          initialUser={userWithProfile?.user ?? null}
          initialProfile={userWithProfile?.profile}
          initialLocale={locale}
          baseRates={baseRates}
        >
          <Header />
          <main className="h-screen overflow-auto pt-16">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
