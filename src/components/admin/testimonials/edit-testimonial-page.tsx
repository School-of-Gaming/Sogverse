"use client";

import { Fragment } from "react";
import { Heading } from "@sog/ui";
import { useLocale, useTranslations } from "next-intl";
import { AdminEditorPageShell } from "@/components/admin/admin-editor-page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import {
  HOME_SPOT_SIZE,
  useAdminTestimonial,
  useSaveTestimonial,
  type AdminTestimonial,
  type TestimonialSaver,
  type TestimonialUsage,
} from "@/services/testimonials";
import { TestimonialEditor } from "./testimonial-editor";

/**
 * `/admin/testimonials/[id]` — one testimonial's editor, where it is used,
 * and who created and last saved it.
 *
 * **Where it is used sits above the editor**, so editing the words of a
 * testimonial the site shows is a visible decision: a save changes them on
 * the home page and About, and on every live landing page placing it, at
 * once — none of them waits for a publish.
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
 * Every place the testimonial is shown, each a link, the way a site's page
 * lists the products connected to it: a home spot to the public page — it
 * puts the testimonial on About too, so it lists both — and a landing page to
 * its status page in admin, saying whether readers see it there now, the next
 * publish puts it there, or both. One line per kind of place, by kind, so a
 * new kind of place stops this compiling until it has its own.
 */
export function TestimonialUsageCard({ usages }: { usages: readonly TestimonialUsage[] }) {
  const t = useTranslations("admin.testimonials");
  const uiLocale = resolveLocale(useLocale());

  const lines = (usage: TestimonialUsage) => {
    switch (usage.kind) {
      case "home":
        return (
          <Fragment key={`home-${usage.spot}`}>
            <li>
              <Link href={ROUTES.home} className="text-act underline-offset-4 hover:underline">
                {t("usage.home", {
                  spot: t(`home.spots.${usage.spot}`),
                  position: usage.position,
                  size: HOME_SPOT_SIZE[usage.spot],
                })}
              </Link>
            </li>
            <li>
              <Link
                href={{ pathname: ROUTES.about, hash: "parents" }}
                className="text-act underline-offset-4 hover:underline"
              >
                {t("usage.about")}
              </Link>
            </li>
          </Fragment>
        );
      case "landingPage": {
        const state =
          usage.inLiveCopy && usage.inWorkingCopy
            ? "both"
            : usage.inLiveCopy
              ? "liveOnly"
              : "workingOnly";
        return (
          <li key={`landing-${usage.pageId}`} className="space-y-0.5">
            <Link
              href={ROUTES.admin.landingPage(usage.pageId)}
              className="text-act underline-offset-4 hover:underline"
            >
              {t("usage.landingPage", {
                title: resolveTranslation(usage.titles, uiLocale)?.title ?? "",
              })}
            </Link>
            <p className="text-muted-foreground">{t(`usage.landingPageState.${state}`)}</p>
          </li>
        );
      }
    }
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
          <ul className="space-y-2 text-sm">{usages.map(lines)}</ul>
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
