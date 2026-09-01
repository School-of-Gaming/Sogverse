import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateOnly } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("attributions") };
}

/**
 * Every credit the product owes, in one place.
 *
 * This used to be a paragraph across the whole width of the footer, on every
 * page. Both licences below are satisfied by a linked credits page — CC BY 4.0
 * asks for attribution "in any reasonable manner based on the medium", and
 * Creative Commons' own guidance names a credits page as the reasonable form
 * for a web app; Licence Ouverte 2.0 asks only for the producer, the dataset
 * and the date of the version used. So the footer keeps a link and the credits
 * live here, where there is room to say what each source actually does for the
 * family reading it.
 *
 * What each licence needs, so a future edit doesn't quietly drop it:
 *
 * - **GeoNames, CC BY 4.0** — name the source, link the licence, and *say the
 *   work is modified*. Ours is: the ingestion filters rows out, excludes whole
 *   branches, re-levels others and renames them, so what we hold is not the
 *   dumps. That is why every locale's GeoNames copy says the list is "based on"
 *   GeoNames rather than "from" it, and spells out how it differs. Keep that
 *   sense if the wording is ever rewritten.
 * - **La Poste, Licence Ouverte 2.0** — name the producer and the dataset, and
 *   mention the date of the version in use. The date is the `publishedOn`
 *   field below; it is the publication date printed on the file the seed
 *   migration read, so it moves when the data is refreshed, not when this page
 *   is edited.
 * - **mc-heads.net** — no licence obliges anything. They ask for nothing and
 *   encourage the credit, so it is a thank-you and is worded as one.
 *
 * Off-site anchors are fine here: the no-off-site-links rule governs
 * staff-authored copy shown to families, not the app's own chrome, and a
 * credit that cannot reach the thing it credits is not a credit.
 *
 * **Not built on `PolicyPage`.** The legal pages are prose documents whose only
 * links are internal cross-references drawn from a deliberate allow-list; this
 * page is a list whose whole purpose is external links. Widening that allow-list
 * to admit arbitrary outbound URLs would be the wrong trade for one page, so
 * this one owns its (small) markup and matches the legal pages' visual register
 * instead.
 *
 * **Names and licence identifiers are literals, not message keys.** "GeoNames",
 * "Licence Ouverte 2.0" and the rest are marks and identifiers — the same
 * string in every language, and putting them in five catalogs invites a
 * well-meant translation of a licence name, which would misstate the terms.
 * They sit beside the URLs they belong to. Only the descriptions, the labels
 * and the page's own copy are translated.
 */
interface AttributedResource {
  /** Key under `attributions.entries` holding this resource's description. */
  key: "geonames" | "laPoste" | "mcHeads";
  /** The resource's own name — a proper noun, never translated. */
  name: string;
  source: { href: string; label: string };
  /** Omitted where no licence governs the use (a courtesy credit). */
  licence?: { href: string; label: string };
  /**
   * Publication date of the dataset version in use ("YYYY-MM-DD"), where the
   * credit is for data rather than a service. A bare calendar date, so it is
   * rendered UTC-pinned via `formatDateOnly`.
   */
  publishedOn?: string;
}

const RESOURCES: AttributedResource[] = [
  {
    key: "geonames",
    name: "GeoNames",
    source: { href: "https://www.geonames.org", label: "geonames.org" },
    licence: {
      href: "https://creativecommons.org/licenses/by/4.0/",
      label: "CC BY 4.0",
    },
    publishedOn: "2026-08-07",
  },
  {
    key: "laPoste",
    name: "La Poste — Base officielle des codes postaux",
    source: { href: "https://datanova.laposte.fr", label: "datanova.laposte.fr" },
    licence: {
      href: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
      label: "Licence Ouverte 2.0",
    },
    publishedOn: "2026-07-31",
  },
  {
    key: "mcHeads",
    name: "mc-heads.net",
    source: { href: "https://mc-heads.net", label: "mc-heads.net" },
  },
];

/**
 * An outbound credit link, marked as leaving the site. Every link on this page
 * opens a new tab, so both audiences have to be told: the arrow glyph for a
 * reader who can see it, and `newTabLabel` for one who cannot. The label is
 * passed in rather than read here so this stays a plain synchronous component.
 */
function OutboundLink({
  href,
  newTabLabel,
  children,
}: {
  href: string;
  newTabLabel: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="sr-only">{newTabLabel}</span>
    </a>
  );
}

export default async function AttributionsPage() {
  const t = await getTranslations("attributions");
  const locale = await getLocale();
  const newTabLabel = t("opensInNewTab");

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>

      <div className="mt-10 space-y-6">
        {RESOURCES.map((resource) => (
          <section
            key={resource.key}
            className="space-y-3 rounded-lg border border-border bg-card p-6"
          >
            <h2 className="text-xl font-semibold">{resource.name}</h2>
            <p className="text-muted-foreground">
              {t(`entries.${resource.key}`)}
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span>
                <span className="text-muted-foreground">
                  {t("sourceLabel")}{" "}
                </span>
                <OutboundLink
                  href={resource.source.href}
                  newTabLabel={newTabLabel}
                >
                  {resource.source.label}
                </OutboundLink>
              </span>
              {resource.licence && (
                <span>
                  <span className="text-muted-foreground">
                    {t("licenceLabel")}{" "}
                  </span>
                  <OutboundLink
                    href={resource.licence.href}
                    newTabLabel={newTabLabel}
                  >
                    {resource.licence.label}
                  </OutboundLink>
                </span>
              )}
              {resource.publishedOn && (
                <span className="text-muted-foreground">
                  {t("dataVersion", {
                    date: formatDateOnly(resource.publishedOn, locale, {
                      dateStyle: "long",
                    }),
                  })}
                </span>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
