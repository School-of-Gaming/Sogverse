"use client";

import { Heading } from "@sog/ui";
import { useLocale, useTranslations } from "next-intl";
import { AdminEditorPageShell } from "@/components/admin/admin-editor-page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { resolveLocale } from "@/lib/constants/locales";
import { formatDate } from "@/lib/date-format";
import { resolveRequiredTranslation } from "@/lib/i18n/resolve-translation";
import { useTimezone } from "@/providers";
import type {
  AdminTestimonial,
  TestimonialSaver,
  TestimonialUsage,
} from "@/services/testimonials/testimonials.contracts";
import {
  useAdminTestimonial,
  useSaveTestimonial,
} from "@/services/testimonials/testimonials.queries";
import { TestimonialEditor } from "./testimonial-editor";

/**
 * `/admin/testimonials/[id]` — one testimonial's editor, where it is used,
 * and who created and last saved it.
 *
 * **Where it is used sits above the editor**, so editing the words of a
 * testimonial the site shows is a visible decision: a save changes them on
 * every live landing page placing it at once — none of them waits for a
 * publish.
 *
 * A save resolves only once the testimonial has been read again, so the page
 * already describes the saved copy when the button comes back. Nothing is
 * rendered in the editor's place until the read answers: one row by primary
 * key, into a page whose heading and back link are already painted.
 */
export function EditTestimonialPage({ testimonialId }: { testimonialId: string }) {
  const t = useTranslations("admin.testimonials");
  const { data: testimonial, isError, isSuccess } = useAdminTestimonial(testimonialId);
  const saveTestimonial = useSaveTestimonial();

  return (
    <AdminEditorPageShell
      backHref={ROUTES.admin.testimonials}
      backLabel={t("backToList")}
      title={t("editPage.title")}
    >
      {testimonial && (
        <>
          <TestimonialUsageCard usages={testimonial.usages} />
          <TestimonialEditor
            testimonial={testimonial}
            save={async (input) => {
              await saveTestimonial.mutateAsync({ id: testimonial.id, input });
            }}
          />
          <TestimonialRecord testimonial={testimonial} />
        </>
      )}

      {/* A failed refetch under an open editor keeps the testimonial it had,
          so the line is only for a page that has nothing to show. */}
      {isError && !testimonial && (
        <Alert variant="destructive">
          <AlertDescription>{t("loadError")}</AlertDescription>
        </Alert>
      )}

      {isSuccess && testimonial === null && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("notFound")}
          </CardContent>
        </Card>
      )}
    </AdminEditorPageShell>
  );
}

/**
 * Every landing page the testimonial is shown on, each a link to its status
 * page in admin, the way a site's page lists the products connected to it,
 * saying whether readers see it there now, the next publish puts it there, or
 * both.
 */
export function TestimonialUsageCard({ usages }: { usages: readonly TestimonialUsage[] }) {
  const t = useTranslations("admin.testimonials");
  const uiLocale = resolveLocale(useLocale());

  const line = (usage: TestimonialUsage) => {
    const state =
      usage.inLiveCopy && usage.inWorkingCopy
        ? "both"
        : usage.inLiveCopy
          ? "liveOnly"
          : "workingOnly";
    return (
      <li key={usage.pageId} className="space-y-0.5">
        <Link
          href={ROUTES.admin.landingPage(usage.pageId)}
          className="text-act underline-offset-4 hover:underline"
        >
          {t("usage.landingPage", {
            title: resolveRequiredTranslation(usage.titles, uiLocale).title,
          })}
        </Link>
        <p className="text-muted-foreground">{t(`usage.landingPageState.${state}`)}</p>
      </li>
    );
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <Heading level={2} step="card-title">{t("usage.heading")}</Heading>
        {usages.length > 0 && (
          <p className="text-sm text-muted-foreground">{t("usage.editNote")}</p>
        )}
      </CardHeader>
      <CardContent>
        {usages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("usage.none")}</p>
        ) : (
          <ul className="space-y-2 text-sm">{usages.map(line)}</ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Who created the testimonial and who last saved it, when, and through which AI app. */
function TestimonialRecord({ testimonial }: { testimonial: AdminTestimonial }) {
  const t = useTranslations("admin.testimonials.record");
  const locale = useLocale();
  const timeZone = useTimezone();

  const line = (kind: "created" | "saved", at: string, saver: TestimonialSaver) => {
    const date = formatDate(at, locale, { dateStyle: "medium", timeStyle: "short", timeZone });
    if (saver.by === null) return t(kind, { date });
    if (saver.via === null) return t(`${kind}By`, { date, name: saver.by });
    if (saver.via.name === null) return t(`${kind}ByViaUnnamed`, { date, name: saver.by });
    return t(`${kind}ByVia`, { date, name: saver.by, app: saver.via.name });
  };

  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      <p>{line("created", testimonial.createdAt, testimonial.created)}</p>
      <p>{line("saved", testimonial.updatedAt, testimonial.lastSaved)}</p>
    </div>
  );
}
