"use client";

import { Heading } from "@sog/ui";
import { Clock, Languages, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type { AdminTestimonial } from "@/services/testimonials";

/** The tab's create control, beside its description in the hub. */
export function NewTestimonialAction() {
  const t = useTranslations("admin.testimonials");

  return (
    <Link href={ROUTES.admin.testimonialNew} className={buttonVariants({ className: "gap-1.5" })}>
      <Plus className="h-4 w-4" />
      {t("newTestimonial")}
    </Link>
  );
}

/**
 * The Testimonials tab: every testimonial in the store, most recently saved
 * first, each with its quote in the admin's own language, whom it is from,
 * its languages and when it was saved.
 *
 * **Testimonials are never deleted** — once created they stay.
 *
 * **Presentational**: the rows arrive as props. The read's
 * status is separate from the rows because "no testimonials yet", "the read
 * has not answered" and "the read failed" all arrive as no rows, and only the
 * first may print an empty state.
 *
 * **No loading affordance.** The read is one walk over a store an office
 * writes by hand, and lands in a frame or two; until it does, nothing renders
 * under the hub's description.
 */
export function AdminTestimonialsPage({
  testimonials,
  status,
}: {
  /** Most recently saved first — the order the read delivers. */
  testimonials: readonly AdminTestimonial[];
  status: "pending" | "error" | "success";
}) {
  const t = useTranslations("admin.testimonials");

  return (
    <div className="space-y-6">
      {/* A failed refetch under a painted list keeps the rows it had, so the
          line is only for a page that has nothing to show. */}
      {status === "error" && testimonials.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>{t("listLoadError")}</AlertDescription>
        </Alert>
      )}

      {status === "success" && testimonials.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      )}

      {testimonials.length > 0 && (
        <section className="space-y-3">
          <Heading level={2} step="section">{t("allHeading")}</Heading>
          <ul className="space-y-2">
            {testimonials.map((testimonial) => (
              <li key={testimonial.id}>
                <TestimonialRow testimonial={testimonial} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * One testimonial: its quote, in the admin's own language and the page's
 * marks, whom it is from, its languages and when it was last saved.
 *
 * **The whole card opens the editor**, through the stretched-link shape the
 * spotlight rows use: the quote is the anchor and its `::after` covers the
 * card. There is no Delete: a testimonial is never deleted.
 */
function TestimonialRow({ testimonial }: { testimonial: AdminTestimonial }) {
  const t = useTranslations("admin.testimonials");
  const q = useTranslations("testimonial");
  const locale = useLocale();
  const timeZone = useTimezone();
  const version = resolveTranslation(testimonial.versions, resolveLocale(locale));

  return (
    <div className="group relative flex items-center gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-hover">
      <div className="min-w-0 flex-1">
        <Link
          href={ROUTES.admin.testimonial(testimonial.id)}
          className="line-clamp-2 font-serif italic after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-act"
        >
          {version === null ? "" : q("quoted", { quote: version.quote })}
        </Link>
        <p className="mt-1 text-sm font-medium text-muted-foreground">{version?.from}</p>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Languages className="h-3 w-3" aria-hidden />
            <span className="sr-only">{t("languagesLabel")}</span>
            {testimonial.versions.map((version) => (
              <span key={version.locale} className="uppercase">
                {version.locale}
              </span>
            ))}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden />
            <time dateTime={testimonial.updatedAt}>
              {t("saved", {
                date: formatDate(testimonial.updatedAt, locale, {
                  dateStyle: "medium",
                  timeZone,
                }),
              })}
            </time>
          </span>
        </div>
      </div>

      <NavChevron />
    </div>
  );
}
