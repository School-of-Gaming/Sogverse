import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { Compass } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";

// The **translated** 404: what every in-app `notFound()` renders, and what an
// unmatched URL under a real locale prefix (`/fi/nothing-here`) falls back to.
// It sits at the top of the `[locale]` tree rather than inside a route group,
// so it catches not-found from anywhere in the app, and it renders inside the
// `[locale]` layout's document and providers but outside any group layout —
// hence its own minimal chrome rather than the public Header/Footer.
//
// Its sibling at `src/app/not-found.tsx` is the other half: the root 404 for a
// URL that matched no locale segment at all, which never reaches this tree.
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
