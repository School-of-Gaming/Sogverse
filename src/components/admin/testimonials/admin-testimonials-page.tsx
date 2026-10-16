"use client";

import { useState } from "react";
import { Heading } from "@sog/ui";
import { Clock, House, Languages, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NavChevron } from "@/components/ui/nav-chevron";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import {
  HOME_SPOT_SIZE,
  HOME_TESTIMONIAL_SPOTS,
  homePlacement,
  testimonialWriteFailure,
  type AdminTestimonial,
} from "@/services/testimonials";

/** The write the list makes. It resolves once the list has been read again, and throws on refusal. */
export interface AdminTestimonialsActions {
  remove: (id: string) => Promise<void>;
}

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
 * The Testimonials tab: the home spots and what fills them, then every
 * testimonial in the store, most recently saved first, each with its quote in
 * the admin's own language, whom it is from, its languages, when it was saved
 * and where it is used.
 *
 * **The home spots are read here and never set here.** Which testimonial
 * fills a home spot is a developer's decision, made in a migration: the home
 * and About pages are the site's front door. An admin edits the words of a
 * placed testimonial, which change wherever it is shown.
 *
 * **Presentational**: the rows and the write arrive as props. The read's
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
  actions,
}: {
  /** Most recently saved first — the order the read delivers. */
  testimonials: readonly AdminTestimonial[];
  status: "pending" | "error" | "success";
  actions: AdminTestimonialsActions;
}) {
  const t = useTranslations("admin.testimonials");
  const [deleting, setDeleting] = useState<AdminTestimonial | null>(null);

  return (
    <div className="space-y-6">
      {/* A failed refetch under a painted list keeps the rows it had, so the
          line is only for a page that has nothing to show. */}
      {status === "error" && testimonials.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>{t("listLoadError")}</AlertDescription>
        </Alert>
      )}

      {status === "success" && <HomeSpots testimonials={testimonials} />}

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
                <TestimonialRow
                  testimonial={testimonial}
                  onDelete={() => setDeleting(testimonial)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("deleteConfirm.title")}
        description={t("deleteConfirm.description")}
        confirmLabel={t("deleteConfirm.confirm")}
        cancelLabel={t("actions.cancel")}
        confirmVariant="destructive"
        holdWhileCommitting
        onConfirm={async () => {
          if (deleting !== null) await actions.remove(deleting.id);
        }}
        describeError={(failure) => {
          const reason = testimonialWriteFailure(failure);
          return reason.kind === "reason"
            ? t("errors.deleteFailedWithReason", { reason: reason.reason })
            : t("errors.deleteFailed");
        }}
      />
    </div>
  );
}

/** A testimonial's quote in the admin's own language, in the page's marks. */
function useQuoteLine(): (testimonial: AdminTestimonial) => { quote: string; from: string } {
  const q = useTranslations("testimonial");
  const uiLocale = resolveLocale(useLocale());
  return (testimonial) => {
    const version = resolveTranslation(testimonial.versions, uiLocale);
    return {
      quote: version === null ? "" : q("quoted", { quote: version.quote }),
      from: version?.from ?? "",
    };
  };
}

/**
 * The home spots in page order, each with what fills it in reading order and
 * how many it holds. About shows the same three groups.
 */
function HomeSpots({ testimonials }: { testimonials: readonly AdminTestimonial[] }) {
  const t = useTranslations("admin.testimonials");
  const quoteLine = useQuoteLine();

  return (
    <Card>
      <CardHeader className="space-y-1">
        <Heading level={2} step="card-title">{t("home.heading")}</Heading>
        <p className="text-sm text-muted-foreground">{t("home.hint")}</p>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-3">
        {HOME_TESTIMONIAL_SPOTS.map((spot) => {
          const filling = testimonials
            .flatMap((testimonial) => {
              const home = homePlacement(testimonial.usages);
              return home?.spot === spot ? [{ testimonial, position: home.position }] : [];
            })
            .sort((a, b) => a.position - b.position);
          return (
            <div key={spot} className="min-w-0 space-y-2">
              <Heading level={3} step="label">
                {t("home.spotHeading", {
                  spot: t(`home.spots.${spot}`),
                  filled: filling.length,
                  size: HOME_SPOT_SIZE[spot],
                })}
              </Heading>
              {filling.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("home.emptySpot")}</p>
              ) : (
                <ol className="space-y-2">
                  {filling.map(({ testimonial }) => {
                    const { quote, from } = quoteLine(testimonial);
                    return (
                      <li key={testimonial.id}>
                        <Link
                          href={ROUTES.admin.testimonial(testimonial.id)}
                          className="block rounded-md text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
                        >
                          <span className="line-clamp-2 font-serif italic">{quote}</span>
                          <span className="text-xs text-muted-foreground">{from}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/**
 * One testimonial: its quote and whom it is from, its languages, when it was
 * last saved, where it is shown, and the way to delete it.
 *
 * **The whole card opens the editor**, through the stretched-link shape the
 * spotlight rows use: the quote is the anchor and its `::after` covers the
 * card; Delete is lifted above it with `relative z-10`.
 *
 * **A testimonial shown somewhere cannot be deleted**, so its Delete is
 * disabled, the row saying where it is shown and the button's title why,
 * rather than refused after the press. The database refuses it all the same,
 * and the dialog quotes that refusal should the two ever disagree.
 */
function TestimonialRow({
  testimonial,
  onDelete,
}: {
  testimonial: AdminTestimonial;
  onDelete: () => void;
}) {
  const t = useTranslations("admin.testimonials");
  const locale = useLocale();
  const timeZone = useTimezone();
  const { quote, from } = useQuoteLine()(testimonial);
  const home = homePlacement(testimonial.usages);

  return (
    <div className="group relative flex items-center gap-4 rounded-lg border border-border p-4 transition-colors hover:bg-hover">
      <div className="min-w-0 flex-1">
        <Link
          href={ROUTES.admin.testimonial(testimonial.id)}
          className="line-clamp-2 font-serif italic after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-act"
        >
          {quote}
        </Link>
        <p className="mt-1 text-sm font-medium text-muted-foreground">{from}</p>
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
          {home && (
            <span className="inline-flex items-center gap-1 text-foreground">
              <House className="h-3 w-3" aria-hidden />
              {t("onHome", { spot: t(`home.spots.${home.spot}`) })}
            </span>
          )}
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="relative z-10 shrink-0"
        disabled={testimonial.usages.length > 0}
        title={testimonial.usages.length > 0 ? t("cannotDelete") : undefined}
        onClick={onDelete}
      >
        <Trash2 aria-hidden />
        {t("actions.delete")}
      </Button>
      <NavChevron />
    </div>
  );
}
