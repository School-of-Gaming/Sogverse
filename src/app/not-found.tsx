import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";

// Site-wide 404, rendered by `notFound()` and by unmatched URLs. It lives at
// the app root (not inside a route group) so it catches not-found from
// anywhere, and renders inside RootLayout's providers but outside any group
// layout — hence its own minimal chrome rather than the public Header/Footer.
//
// Providing this file is also what stops Next's built-in not-found fallback
// from re-injecting its own <html>/<body> on the client; that injection
// collided with the next-themes theme <script>, surfacing as a React "script
// tag while rendering" console error on every 404.
export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
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
      <Link href={ROUTES.home} className={buttonVariants()}>
        {t("home")}
      </Link>
    </main>
  );
}
