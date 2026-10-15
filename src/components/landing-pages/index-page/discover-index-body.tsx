import { useTranslations } from "next-intl";
import { Compass } from "lucide-react";
import {
  actPhrase,
  PublicIndexHeader,
} from "@/components/public/public-index-header";
import { DiscoverPageCard, type DiscoverPageCardProps } from "./discover-page-card";

/**
 * **The landing pages' index — every live landing page, newest first.**
 *
 * Presentational and props-driven: the page's data shell hands it the cards,
 * every link already resolved. Deliberately plain, because the pages it lists
 * are reached through search and advertising rather than browsed here: the
 * shared public index header, then the grid — one column on a phone, two from
 * `sm`, three from `lg` — or, with nothing live, a line saying so in its
 * place.
 */
export function DiscoverIndexBody({
  pages,
}: {
  pages: readonly DiscoverPageCardProps[];
}) {
  const t = useTranslations("discover.index");

  return (
    <div className="container mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <PublicIndexHeader
        title={t.rich("title", { act: actPhrase })}
        intro={t("intro")}
      />

      {pages.length > 0 ? (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <li key={page.id}>
              <DiscoverPageCard {...page} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-8 flex flex-col items-center py-16 text-center">
          <Compass className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-4 font-medium">{t("empty")}</p>
        </div>
      )}
    </div>
  );
}
