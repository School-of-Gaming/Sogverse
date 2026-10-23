"use client";

import { Heading } from "@sog/ui";
import { Clock, Languages, PanelsTopLeft, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { formatDate } from "@/lib/date-format";
import { useTimezone } from "@/providers";
import type { AdminGuide } from "@/services/guides/guides.contracts";
import { formatFileSize } from "@/lib/file-size";

/** The tab's create control, beside its description in the hub. */
export function NewGuideAction() {
  const t = useTranslations("admin.guides");

  return (
    <Link href={ROUTES.admin.guideNew} className={buttonVariants({ className: "gap-1.5" })}>
      <Plus className="h-4 w-4" />
      {t("newGuide")}
    </Link>
  );
}

/**
 * The Guides tab: every guide in the store, most recently saved first, each
 * with its label, the languages it has a file in and each file's size, when
 * it was saved and where it is used.
 *
 * **Guides are never deleted** — once created they stay.
 *
 * **Presentational**: the rows arrive as props, with the read's status beside
 * them, because "no guides yet", "the read has not answered" and "the read
 * failed" all arrive as no rows, and only the first may print an empty state.
 *
 * **No loading affordance.** The read is one walk over a store an office
 * writes by hand, and lands in a frame or two; until it does, nothing renders
 * under the hub's description.
 */
export function AdminGuidesPage({
  guides,
  status,
}: {
  /** Most recently saved first — the order the read delivers. */
  guides: readonly AdminGuide[];
  status: "pending" | "error" | "success";
}) {
  const t = useTranslations("admin.guides");

  return (
    <div className="space-y-6">
      {/* A failed refetch under a painted list keeps the rows it had, so the
          line is only for a page that has nothing to show. */}
      {status === "error" && guides.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>{t("listLoadError")}</AlertDescription>
        </Alert>
      )}

      {status === "success" && guides.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">{t("empty")}</CardContent>
        </Card>
      )}

      {guides.length > 0 && (
        <section className="space-y-3">
          <Heading level={2} step="section">{t("allHeading")}</Heading>
          <ul className="space-y-2">
            {guides.map((guide) => (
              <li key={guide.id}>
                <GuideRow guide={guide} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * One guide: its label, its languages with each file's size, when it was last
 * saved, and how many landing pages place it.
 *
 * **The whole card opens the guide**, through the stretched-link shape the
 * testimonial rows use: the label is the anchor and its `::after` covers the
 * card. There is no Delete: a guide is never deleted.
 */
function GuideRow({ guide }: { guide: AdminGuide }) {
  const t = useTranslations("admin.guides");
  const locale = useLocale();
  const timeZone = useTimezone();

  return (
    <div className="group relative flex items-center gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-hover">
      <div className="min-w-0 flex-1">
        <Link
          href={ROUTES.admin.guide(guide.id)}
          className="line-clamp-2 font-medium after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-act"
        >
          {guide.label}
        </Link>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Languages className="h-3 w-3" aria-hidden />
            <span className="sr-only">{t("languagesLabel")}</span>
            {guide.files.map((file) => (
              <span key={file.locale}>
                <span className="uppercase">{file.locale}</span>{" "}
                {formatFileSize(file.byteSize, locale)}
              </span>
            ))}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden />
            <time dateTime={guide.updatedAt}>
              {t("saved", {
                date: formatDate(guide.updatedAt, locale, { dateStyle: "medium", timeZone }),
              })}
            </time>
          </span>
          {guide.usages.length > 0 && (
            <span className="inline-flex items-center gap-1 text-foreground">
              <PanelsTopLeft className="h-3 w-3" aria-hidden />
              {t("onLandingPages", { count: guide.usages.length })}
            </span>
          )}
        </div>
      </div>

      <NavChevron />
    </div>
  );
}
