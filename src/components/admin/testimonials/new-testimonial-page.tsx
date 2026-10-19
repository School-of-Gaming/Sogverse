"use client";

import { useTranslations } from "next-intl";
import { AdminEditorPageShell } from "@/components/admin/admin-editor-page-shell";
import { useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { useCreateTestimonial } from "@/services/testimonials/testimonials.queries";
import { TestimonialEditor } from "./testimonial-editor";

/**
 * `/admin/testimonials/new` — the data shell around a new testimonial's
 * editor. Saving creates it and returns to the list;
 * `replace` rather than `push`, so Back from there does not return to a blank
 * form for a testimonial that now exists.
 */
export function NewTestimonialPage() {
  const t = useTranslations("admin.testimonials");
  const router = useRouter();
  const createTestimonial = useCreateTestimonial();

  return (
    <AdminEditorPageShell
      backHref={ROUTES.admin.testimonials}
      backLabel={t("backToList")}
      title={t("newPage.title")}
    >
      <TestimonialEditor
        testimonial={null}
        onCancel={() => router.push(ROUTES.admin.testimonials)}
        save={async (input) => {
          await createTestimonial.mutateAsync(input);
          router.replace(ROUTES.admin.testimonials);
        }}
      />
    </AdminEditorPageShell>
  );
}
