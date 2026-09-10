import type { ReactNode } from "react";

/**
 * A pass-through root layout — the document itself is owned by
 * `[locale]/layout.tsx`, which is the only layer that knows what to put in
 * `<html lang>`.
 *
 * Next requires *a* root layout, and every page in the app lives under
 * `[locale]`, so this one exists to hand its children straight on. The single
 * thing it still owns is the fallback document for `not-found.tsx` beside it,
 * which catches URLs matching no locale (`/xx/whatever`) and therefore renders
 * its own `<html>`/`<body>` rather than inheriting one.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
