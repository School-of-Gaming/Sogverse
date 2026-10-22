"use client";

import { useState } from "react";
import { Heading } from "@sog/ui";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { AdminEditorPageShell } from "@/components/admin/admin-editor-page-shell";
import { Alert, AlertDescription, StatusLine } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UnsavedChangesGuard } from "@/components/ui/unsaved-changes-guard";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/constants/locales";
import { ROUTES } from "@/lib/constants/routes";
import { formatDate } from "@/lib/date-format";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { useTimezone } from "@/providers";
import {
  GUIDE_LABEL_MAX_LENGTH,
  guideWriteFailure,
  type AdminGuide,
  type GuideSaver,
  type GuideUsage,
} from "@/services/guides/guides.contracts";
import {
  useAdminGuide,
  useGuideInvalidation,
  useRemoveGuideFile,
  useSaveGuideLabel,
} from "@/services/guides/guides.queries";
import { GuideFilesCard } from "./guide-files-card";
import { uploadGuideFile } from "./guide-upload";

/**
 * `/admin/guides/[id]` — one guide: where it is used, its label, its file in
 * each language, and who created and last saved it.
 *
 * **Where it is used sits above everything else**, so replacing or removing a
 * file of a guide the site offers is a visible decision: either changes it on
 * every live landing page placing it at once — none of them waits for a
 * publish.
 *
 * Every write resolves only once the guide has been read again, so the page
 * already describes the stored guide when a button comes back. Nothing is
 * rendered in the guide's place until the read answers: one row by primary
 * key, into a page whose heading and back link are already painted.
 */
export function EditGuidePage({ guideId }: { guideId: string }) {
  const t = useTranslations("admin.guides");
  const { data: guide, isError, isSuccess } = useAdminGuide(guideId);
  const saveLabel = useSaveGuideLabel();
  const removeFile = useRemoveGuideFile();
  const invalidate = useGuideInvalidation();

  return (
    <AdminEditorPageShell
      backHref={ROUTES.admin.guides}
      backLabel={t("backToList")}
      title={t("editPage.title")}
    >
      {guide && (
        <>
          <GuideUsageCard usages={guide.usages} />
          <GuideLabelForm
            guide={guide}
            save={async (label) => {
              await saveLabel.mutateAsync({ id: guide.id, label });
            }}
          />
          <GuideFilesCard
            guide={guide}
            upload={async (locale, file) => {
              await uploadGuideFile({ file, locale, target: { kind: "existing", guideId: guide.id } });
              await invalidate();
            }}
            remove={async (locale) => {
              await removeFile.mutateAsync({ id: guide.id, locale });
            }}
          />
          <GuideRecord guide={guide} />
        </>
      )}

      {/* A failed refetch under an open guide keeps the guide it had, so the
          line is only for a page that has nothing to show. */}
      {isError && !guide && (
        <Alert variant="destructive">
          <AlertDescription>{t("loadError")}</AlertDescription>
        </Alert>
      )}

      {isSuccess && guide === null && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">{t("notFound")}</CardContent>
        </Card>
      )}
    </AdminEditorPageShell>
  );
}

/**
 * Every landing page the guide is offered on, each a link to its status page
 * in admin, saying whether readers can download it there now, the next
 * publish puts it there, or both.
 */
export function GuideUsageCard({ usages }: { usages: readonly GuideUsage[] }) {
  const t = useTranslations("admin.guides");
  const uiLocale = resolveLocale(useLocale());

  const line = (usage: GuideUsage) => {
    const state =
      usage.inLiveCopy && usage.inWorkingCopy ? "both" : usage.inLiveCopy ? "liveOnly" : "workingOnly";
    return (
      <li key={usage.pageId} className="space-y-0.5">
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
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <Heading level={2} step="card-title">{t("usage.heading")}</Heading>
        {usages.length > 0 && <p className="text-sm text-muted-foreground">{t("usage.editNote")}</p>}
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

/**
 * The guide's label and its Save. Seeded once per guide, keyed on its id, so
 * a refetch after any write never touches what is being typed; leaving with
 * an unsaved label asks first.
 */
function GuideLabelForm(props: { guide: AdminGuide; save: (label: string) => Promise<void> }) {
  return <LabelForm key={props.guide.id} {...props} />;
}

function LabelForm({ guide, save }: { guide: AdminGuide; save: (label: string) => Promise<void> }) {
  const t = useTranslations("admin.guides");
  const [label, setLabel] = useState(guide.label);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = label.trim();
  const dirty = trimmed !== guide.label;

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (trimmed === "") {
      setError(t("errors.labelMissing"));
      return;
    }
    setError(null);
    // Set before the first render after the click, and held until the guide
    // has been read again, so the button never re-enables on a stale label.
    setSaving(true);
    try {
      await save(trimmed);
    } catch (failure) {
      const reason = guideWriteFailure(failure);
      setError(
        reason.kind === "reason"
          ? t("errors.saveFailedWithReason", { reason: reason.reason })
          : t("errors.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <UnsavedChangesGuard when={dirty} />
      <Card>
        <CardContent className="space-y-4 p-6">
          <Field label={t("fields.label")} hint={t("hints.label")} htmlFor="guide-label">
            <Input
              id="guide-label"
              value={label}
              maxLength={GUIDE_LABEL_MAX_LENGTH}
              onChange={(event) => setLabel(event.target.value)}
              autoComplete="off"
            />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving || !dirty}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t("actions.save")}
            </Button>
          </div>
          {/* Last, so a refusal adds a line below the button rather than
              moving anything the admin was looking at. */}
          {error !== null && (
            <StatusLine status="destructive" role="alert">
              {error}
            </StatusLine>
          )}
        </CardContent>
      </Card>
    </form>
  );
}

/** Who created the guide and who last saved it, when, and through which AI app. */
function GuideRecord({ guide }: { guide: AdminGuide }) {
  const t = useTranslations("admin.guides.record");
  const locale = useLocale();
  const timeZone = useTimezone();

  const line = (kind: "created" | "saved", at: string, saver: GuideSaver) => {
    const date = formatDate(at, locale, { dateStyle: "medium", timeStyle: "short", timeZone });
    if (saver.by === null) return t(kind, { date });
    if (saver.via === null) return t(`${kind}By`, { date, name: saver.by });
    if (saver.via.name === null) return t(`${kind}ByViaUnnamed`, { date, name: saver.by });
    return t(`${kind}ByVia`, { date, name: saver.by, app: saver.via.name });
  };

  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      <p>{line("created", guide.createdAt, guide.created)}</p>
      <p>{line("saved", guide.updatedAt, guide.lastSaved)}</p>
    </div>
  );
}
