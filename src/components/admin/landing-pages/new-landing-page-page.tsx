"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { useCreateLandingPage } from "@/services/landing-pages";
import { LandingPageEditor } from "./landing-page-editor";
import { LandingPagePageShell } from "./landing-page-page-shell";

/**
 * `/admin/landing-pages/new` — the data shell around a new page's editor.
 * Saving creates the working copy and moves to the page's own editor, with
 * `replace`, so Back from there returns to the list.
 */
export function NewLandingPagePage() {
  const t = useTranslations("admin.landingPages");
  const router = useRouter();
  const createPage = useCreateLandingPage();

  return (
    <LandingPagePageShell title={t("newPage.title")}>
      <LandingPageEditor
        page={null}
        onCancel={() => router.push(ROUTES.admin.landingPages)}
        actions={{
          save: async (input) => {
            const id = await createPage.mutateAsync(input);
            router.replace(ROUTES.admin.landingPage(id));
          },
        }}
      />
    </LandingPagePageShell>
  );
}
