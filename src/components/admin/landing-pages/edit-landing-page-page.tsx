"use client";

import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  useAdminLandingPage,
  usePublishLandingPage,
  useSaveLandingPage,
  useUnpublishLandingPage,
} from "@/services/landing-pages";
import { LandingPageEditor } from "./landing-page-editor";
import { LandingPagePageShell } from "./landing-page-page-shell";

/**
 * `/admin/landing-pages/[id]` — one page's editor, where it is also published,
 * and from which its preview opens.
 *
 * Every write resolves only once the page has been read again (the mutations
 * await their invalidation), so the status and the publishing controls
 * already describe the new state when a button comes back. The editor seeds
 * its form once per page, so that read never touches what is being typed.
 *
 * Nothing is rendered in the editor's place until the read answers: one row
 * by primary key, into a page whose heading and back link are already
 * painted.
 */
export function EditLandingPagePage({ pageId }: { pageId: string }) {
  const t = useTranslations("admin.landingPages");
  const { data: page, isError, isSuccess } = useAdminLandingPage(pageId);
  const savePage = useSaveLandingPage();
  const publishPage = usePublishLandingPage();
  const unpublishPage = useUnpublishLandingPage();

  return (
    <LandingPagePageShell title={t("editPage.title")}>
      {page && (
        <LandingPageEditor
          page={page}
          actions={{
            save: async (input) => {
              await savePage.mutateAsync({ id: page.draft.id, input });
            },
            publish: () => publishPage.mutateAsync(page.draft.id),
            unpublish: () => unpublishPage.mutateAsync(page.draft.id),
          }}
        />
      )}

      {/* A failed refetch under an open editor keeps the page it had. */}
      {isError && !page && (
        <Alert variant="destructive">
          <AlertDescription>{t("loadError")}</AlertDescription>
        </Alert>
      )}

      {isSuccess && page === null && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("notFound")}
          </CardContent>
        </Card>
      )}
    </LandingPagePageShell>
  );
}
