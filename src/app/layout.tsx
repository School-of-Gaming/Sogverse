import type { Metadata } from "next";
import { Inter, Press_Start_2P } from "next/font/google";
import { Providers } from "@/providers";
import { Header } from "@/components/layout";
import { getUserWithProfile } from "@/lib/supabase/server";
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

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${pressStart2P.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <Providers
          initialUser={userWithProfile?.user ?? null}
          initialProfile={userWithProfile?.profile ?? null}
        >
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
