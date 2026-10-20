"use client";

import { useTranslations } from "next-intl";
import { AdminEditorPageShell } from "@/components/admin/admin-editor-page-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants/routes";
import {
  useAdminSpotlight,
  useSaveSpotlight,
} from "@/services/spotlights/spotlights.queries";
import { SpotlightEditor } from "./spotlight-editor";

/**
 * `/admin/spotlights/[id]` — one spotlight's editor.
 *
 * A save resolves only once the spotlight has been read again (the mutation
 * awaits its invalidation), so the page already describes the saved copy when
 * the button comes back. The editor seeds its form once per spotlight, so that
 * read never touches what is being typed.
 *
 * Nothing is rendered in the editor's place until the read answers: one row by
 * primary key, into a page whose heading and back link are already painted.
 */
export function EditSpotlightPage({ spotlightId }: { spotlightId: string }) {
  const t = useTranslations("admin.spotlights");
  const { data: spotlight, isError, isSuccess } = useAdminSpotlight(spotlightId);
  const saveSpotlight = useSaveSpotlight();

  return (
    <AdminEditorPageShell
      backHref={ROUTES.admin.spotlights}
      backLabel={t("backToList")}
      title={t("editPage.title")}
    >
      {spotlight && (
        <SpotlightEditor
          spotlight={spotlight}
          save={async (input) => {
            await saveSpotlight.mutateAsync({ id: spotlight.id, input });
          }}
        />
      )}

      {/* A failed refetch under an open editor keeps the spotlight it had, so
          the line is only for a page that has nothing to show. */}
      {isError && !spotlight && (
        <Alert variant="destructive">
          <AlertDescription>{t("loadError")}</AlertDescription>
        </Alert>
      )}

      {/* Only a read that answered with no row is a missing spotlight. */}
      {isSuccess && spotlight === null && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("notFound")}
          </CardContent>
        </Card>
      )}
    </AdminEditorPageShell>
  );
}
