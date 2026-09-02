import type { Metadata } from "next";
import {
  Crimson_Pro,
  Dancing_Script,
  Poppins,
  Space_Mono,
} from "next/font/google";
import "./globals.css";

/**
 * The reference implementation of the face contract.
 *
 * The package owns the semantic names (`--font-sans`, `--font-serif`,
 * `--font-brand-mono`, `--font-cursive`); a consumer loads the files and defines
 * the variables those names point at. The literals below must match the
 * `variable` fields in `src/tokens/typography.ts` — next/font reads its options
 * statically, so they cannot be imported from there, and
 * `tests/unit/sog-ui/typography.test.ts` asserts this file names every one of
 * them instead.
 *
 * Poppins is not a variable font on Google Fonts, so each weight is a separate
 * file and has to be asked for by name; a weight not listed here is synthesised
 * by the browser rather than drawn. `latin-ext` is not optional — the product
 * ships Finnish, Swedish and French.
 */
const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-poppins",
});

const crimsonPro = Crimson_Pro({
  weight: ["400", "600"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-crimson-pro",
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-space-mono",
});

const dancingScript = Dancing_Script({
  weight: "600",
  subsets: ["latin", "latin-ext"],
  variable: "--font-dancing-script",
});

export const metadata: Metadata = {
  title: "SOG-UI",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Every face variable goes on <html> — that is, on `:root` — never on <body>.
  // The theme block emits its font tokens at `:root`, so a variable defined one
  // element lower is invisible there and the tokens collapse to their fallbacks
  // while `font-*` utilities keep working, which is exactly why the mistake is
  // invisible when it happens.
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${crimsonPro.variable} ${spaceMono.variable} ${dancingScript.variable}`}
    >
      <body className="bg-background text-foreground font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
