import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Press_Start_2P } from "next/font/google";
import { Providers } from "@/providers";
import { Header } from "@/components/layout";
import { getUserWithProfile } from "@/lib/supabase/server";
import { parseAcceptLanguage, DEFAULT_LOCALE } from "@/lib/locale";
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
    "School of Gaming Business Hub - Educational gaming for the next generation",
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

  return (
    <html lang="en" className="dark overflow-hidden" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${pressStart2P.variable} antialiased bg-background text-foreground`}
      >
        <Providers
          initialUser={userWithProfile?.user ?? null}
          initialProfile={userWithProfile?.profile ?? null}
          initialLocale={locale}
        >
          <div className="flex h-screen flex-col">
            <Header />
            <main className="flex-1 min-h-0 overflow-auto flex flex-col">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
