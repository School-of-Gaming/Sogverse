import { getTranslations } from "next-intl/server";
import { Compass } from "lucide-react";
import "./globals.css";

// The **root** 404: the fallback for a URL that matched no locale segment at
// all (`/xx/whatever`), which is the one request shape that never reaches the
// `[locale]` tree. Its translated sibling under `[locale]/not-found.tsx` is
// what every in-app `notFound()` renders.
//
// It renders its own `<html>`/`<body>` because the root layout beside it is a
// pass-through — the document belongs to the `[locale]` layout, and this page
// is outside it. That also means no providers and no fonts here: it is a dead
// end for a URL nobody meant to publish, and its copy resolves through the
// request config's cookie/header fallback rather than a URL locale.
export default async function RootNotFound() {
  const t = await getTranslations("notFound");
  return (
    <html>
      <body className="antialiased bg-background text-foreground">
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
          <Compass className="h-12 w-12 text-muted-foreground" aria-hidden />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t("title")}
            </h1>
            <p className="max-w-prose text-sm text-muted-foreground sm:text-base">
              {t("description")}
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
