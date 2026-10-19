"use client";

import { useLocale, useTranslations } from "next-intl";
import { AdminEditorPageShell } from "@/components/admin/admin-editor-page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import {
  useAdminTestimonial,
  useSaveTestimonial,
  type AdminTestimonial,
  type TestimonialSaver,
} from "@/services/testimonials";
import { TestimonialEditor } from "./testimonial-editor";

/**
 * `/admin/testimonials/[id]` — one testimonial's editor, and who created and
 * last saved it.
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
