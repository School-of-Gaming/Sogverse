"use client";

import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
  useAdminLandingPage,
  usePublishLandingPage,
  useUnpublishLandingPage,
} from "@/services/landing-pages";
import { LandingPagePageShell } from "./landing-page-page-shell";
import { LandingPageStatusPage } from "./landing-page-status-page";

/**
 * `/admin/landing-pages/[id]` — the data shell around one page's status.
 *
 * Every write resolves only once the page has been read again (the mutations
 * await their invalidation), so the status already describes the new state
 * when a confirm closes.
 *
 * Nothing is rendered in the body's place until the read answers: one row by
 * primary key, into a page whose heading and back link are already painted.
 */
export function LandingPageStatusView({ pageId }: { pageId: string }) {
  const t = useTranslations("admin.landingPages");
  const { data: page, isError, isSuccess } = useAdminLandingPage(pageId);
  const publishPage = usePublishLandingPage();
  const unpublishPage = useUnpublishLandingPage();

  return (
    <LandingPagePageShell title={t("statusPage.title")}>
      {page && (
        <LandingPageStatusPage
          page={page}
          actions={{
            publish: () => publishPage.mutateAsync(page.draft.id),
            unpublish: () => unpublishPage.mutateAsync(page.draft.id),
          }}
        />
      )}

      {/* A failed refetch keeps the page it had. */}
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
