"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { AdminEditorPageShell } from "@/components/admin/admin-editor-page-shell";
import { StatusLine } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UnsavedChangesGuard } from "@/components/ui/unsaved-changes-guard";
import { useLanguageNames } from "@/hooks/use-language-names";
import { useRouter } from "@/i18n/navigation";
import {
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { ROUTES } from "@/lib/constants/routes";
import { findOption } from "@/lib/type-guards";
import {
  GUIDE_LABEL_MAX_LENGTH,
  GUIDE_UPLOAD_MAX_BYTES,
} from "@/services/guides/guides.contracts";
import { useGuideInvalidation } from "@/services/guides/guides.queries";
import { formatFileSize } from "@/lib/file-size";
import { GuideUploadError, guideFilePickRefusal, uploadGuideFile } from "./guide-upload";
import { useDescribeGuideUploadFailure } from "./use-describe-upload-failure";

/** What creating a guide sends: its label and its first file. */
export interface NewGuideInput {
  label: string;
  locale: SupportedLocale;
  file: File;
}

/**
 * `/admin/guides/new` — the data shell around a new guide's form. Creating it
 * uploads its first file, since a guide is never empty, and goes on to the
 * guide's own page, where the other languages are added; `replace` rather than
 * `push`, so Back from there does not return to a blank form for a guide that
 * now exists.
 */
export function NewGuidePage() {
  const t = useTranslations("admin.guides");
  const router = useRouter();
  const invalidate = useGuideInvalidation();

  return (
    <AdminEditorPageShell
      backHref={ROUTES.admin.guides}
      backLabel={t("backToList")}
      title={t("newPage.title")}
    >
      <NewGuideForm
        onCancel={() => router.push(ROUTES.admin.guides)}
        create={async ({ label, locale, file }) => {
          const stored = await uploadGuideFile({ file, locale, target: { kind: "new", label } });
          await invalidate();
          router.replace(ROUTES.admin.guide(stored.guideId));
        }}
      />
    </AdminEditorPageShell>
  );
}

/**
 * The form a guide is created on: its label, the language of its first file,
 * and the file.
 *
 * **A file is checked as it is picked**: an empty one or one over the cap is
 * called out under the field at once, with the remedy, rather than after a
 * wait for the upload to be refused.
 */
export function NewGuideForm({
  create,
  onCancel,
}: {
  /**
   * Create the guide. Rejects on refusal, so the form can say why; resolves
   * as the page leaves, which is why the form never hands the button back on
   * that path.
   */
  create: (input: NewGuideInput) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations("admin.guides");
  const locale = useLocale();
  const languageName = useLanguageNames();
  const describeFailure = useDescribeGuideUploadFailure();
  const fileInput = useRef<HTMLInputElement>(null);

  const [label, setLabel] = useState("");
  const [fileLocale, setFileLocale] = useState<SupportedLocale>(() => resolveLocale(locale));
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickRefusal = file === null ? null : guideFilePickRefusal(file);
  const unsaved = !creating && (label.trim() !== "" || file !== null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = label.trim();
    const blocker =
      trimmed === ""
        ? t("errors.labelMissing")
        : trimmed.length > GUIDE_LABEL_MAX_LENGTH
          ? t("errors.labelTooLong", { max: GUIDE_LABEL_MAX_LENGTH })
          : file === null
            ? t("errors.noFile")
            : pickRefusal !== null
              ? describeFailure(new GuideUploadError({ kind: "refused", code: pickRefusal }), file)
              : null;
    if (blocker !== null || file === null) {
      setError(blocker);
      return;
    }
    setError(null);
    // Set before the first render after the click: a second press while the
    // first is in flight would create a second guide.
    setCreating(true);
    try {
      await create({ label: trimmed, locale: fileLocale, file });
    } catch (failure) {
      setCreating(false);
      setError(describeFailure(failure, file));
    }
  }

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard when={unsaved} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="space-y-5 p-6">
            <Field label={t("fields.label")} hint={t("hints.label")} htmlFor="guide-label">
              <Input
                id="guide-label"
                value={label}
                maxLength={GUIDE_LABEL_MAX_LENGTH}
                onChange={(event) => setLabel(event.target.value)}
                autoComplete="off"
              />
            </Field>

            {/* A native select: there is no select primitive in this app yet,
                and a fixed list of languages is what a select is for. */}
            <Field label={t("fields.language")} hint={t("hints.language")} htmlFor="guide-language">
              {({ hintId }) => (
                <select
                  id="guide-language"
                  value={fileLocale}
                  aria-describedby={hintId}
                  onChange={(event) => {
                    const next = findOption(SUPPORTED_LOCALES, event.target.value);
                    if (next) setFileLocale(next);
                  }}
                  className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm sm:w-64"
                >
                  {SUPPORTED_LOCALES.map((option) => (
                    <option key={option} value={option}>
                      {languageName(option, LOCALE_CONFIG[option].label)}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field
              label={t("fields.file")}
              hint={t("hints.file", { limit: formatFileSize(GUIDE_UPLOAD_MAX_BYTES, locale) })}
              htmlFor="guide-file"
            >
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInput}
                  id="guide-file"
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  onChange={(event) => {
                    const picked = event.target.files?.[0];
                    // Cleared at once, so picking the same file again still fires.
                    event.target.value = "";
                    if (picked !== undefined) {
                      setFile(picked);
                      setError(null);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  disabled={creating}
                  onClick={() => fileInput.current?.click()}
                >
                  <FileUp className="h-4 w-4" aria-hidden />
                  {t("file.upload")}
                </Button>
                {file !== null && (
                  <span className="flex min-w-0 items-baseline gap-2 text-sm">
                    <span className="truncate">{file.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatFileSize(file.size, locale)}
                    </span>
                  </span>
                )}
              </div>
            </Field>
            {/* Under the field as the file is picked, so the reason arrives
                with the file rather than after Create. */}
            {file !== null && pickRefusal !== null && (
              <StatusLine status="destructive" size="xs">
                {describeFailure(new GuideUploadError({ kind: "refused", code: pickRefusal }), file)}
              </StatusLine>
            )}
          </CardContent>
        </Card>

        {/* Negative first in the DOM, the affirmative last. */}
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("actions.cancel")}
          </Button>
          <Button type="submit" disabled={creating}>
            {creating && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {t("newPage.submit")}
          </Button>
        </div>
        {/* Last, so a refusal adds a line below everything rather than moving
            anything the admin was looking at. */}
        {error !== null && (
          <StatusLine status="destructive" role="alert">
            {error}
          </StatusLine>
        )}
      </form>
    </div>
  );
}
