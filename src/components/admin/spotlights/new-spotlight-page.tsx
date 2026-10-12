"use client";

import { useTranslations } from "next-intl";
import { AdminEditorPageShell } from "@/components/admin/admin-editor-page-shell";
import { useRouter } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { useCreateSpotlight } from "@/services/spotlights";
import { SpotlightEditor } from "./spotlight-editor";

/**
 * `/admin/spotlights/new` — the data shell around a new spotlight's editor.
 *
 * Saving creates the spotlight, switched off, and returns to the list, which
 * is where it is switched on. `replace` rather than `push`, so Back from there
 * does not return to a blank form for a spotlight that now exists.
 */
export function NewSpotlightPage() {
  const t = useTranslations("admin.spotlights");
  const router = useRouter();
  const createSpotlight = useCreateSpotlight();

  return (
    <AdminEditorPageShell
      backHref={ROUTES.admin.spotlights}
      backLabel={t("backToList")}
      title={t("newPage.title")}
    >
      <SpotlightEditor
        spotlight={null}
        onCancel={() => router.push(ROUTES.admin.spotlights)}
        save={async (input) => {
          await createSpotlight.mutateAsync(input);
          router.replace(ROUTES.admin.spotlights);
        }}
      />
    </AdminEditorPageShell>
  );
}
