"use client";

import { useRef, useState } from "react";
import { ExternalLink, FileUp, Loader2, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { LocaleTabs } from "@/components/ui/locale-tabs";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { formatDate } from "@/lib/date-format";
import { resolveRequiredTranslation } from "@/lib/i18n/resolve-translation";
import { useTimezone } from "@/providers";
import {
  guideWriteFailure,
  type AdminGuide,
  type AdminGuideFile,
} from "@/services/guides/guides.contracts";
import { formatFileSize } from "@/lib/file-size";
import { adminGuideFilePath } from "./guide-upload";
import { useDescribeGuideUploadFailure } from "./use-describe-upload-failure";

export interface GuideFilesCardProps {
  guide: AdminGuide;
  /**
   * Store `file` as the guide's file in `locale`, replacing any it has.
   * Resolves once the guide has been read again; rejects with the refusal.
   */
  upload: (locale: SupportedLocale, file: File) => Promise<void>;
  /** Remove the guide's file in `locale`. Resolves once read again. */
  remove: (locale: SupportedLocale) => Promise<void>;
}

/**
 * A guide's files, one language tab each, on the shared tab bar.
 *
 * **Not a draft editor.** Each tab is a stored file, and every action on one
 * is written at once — an upload stores, a removal removes — so there is no
 * Save and nothing for the unsaved-changes guard to hold. The one local state
 * is a language added from the bar that has no file yet: it shows its tab
 * with an upload until a file is stored, and its close button just drops it.
 *
 * **A guide keeps at least one language.** The only file's Remove is disabled
 * with the reason beside it; the database refuses the removal besides, which
 * is what the confirm dialog shows if the bar's close button asks for it.
 *
 * Removing a file confirms first, holding the dialog until the guide is read
 * again, because the admin needs the outcome — a refusal, or the tab gone —
 * before they move on.
 */
export function GuideFilesCard({ guide, upload, remove }: GuideFilesCardProps) {
  const t = useTranslations("admin.guides");
  const languageName = useLanguageNames();
  const uiLocale = resolveLocale(useLocale());
  const fileInput = useRef<HTMLInputElement>(null);

  // The tab a reader in the admin's locale would be given.
  const opening = resolveRequiredTranslation(guide.files, uiLocale).locale;
  const [active, setActive] = useState<SupportedLocale>(opening);
  const [added, setAdded] = useState<SupportedLocale | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SupportedLocale | null>(null);
  const describeUploadFailure = useDescribeGuideUploadFailure();

  const stored = new Set<SupportedLocale>(guide.files.map((file) => file.locale));
  const pending = added !== null && !stored.has(added) ? added : null;
  const written = SUPPORTED_LOCALES.filter((l) => stored.has(l) || l === pending);
  // A tab whose file was just removed falls back to the opening pick.
  const shown = written.includes(active) ? active : opening;
  // exact-locale: the tab shows that one language's own file
  const file = guide.files.find((candidate) => candidate.locale === shown) ?? null;
  const onlyFile = file !== null && guide.files.length === 1;
  const name = (locale: SupportedLocale) => languageName(locale, LOCALE_CONFIG[locale].label);

  const select = (next: SupportedLocale) => {
    setActive(next);
    setError(null);
  };

  async function handlePicked(picked: File) {
    setError(null);
    // Set before the first render after the pick, and held until the guide
    // has been read again, so the button never re-enables on a stale tab.
    setUploading(true);
    try {
      await upload(shown, picked);
      setAdded(null);
    } catch (failure) {
      setError(describeUploadFailure(failure, picked));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <Field label={t("fields.files")} hint={t("hints.files")}>
          <LocaleTabs
            written={written}
            active={shown}
            onSelect={select}
            onAdd={(next) => {
              setAdded(next);
              select(next);
            }}
            onRemove={(gone) => {
              if (gone === pending) setAdded(null);
              else setRemoving(gone);
            }}
          />
        </Field>

        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const picked = event.target.files?.[0];
            // Cleared at once, so picking the same file again still fires.
            event.target.value = "";
            if (picked !== undefined) void handlePicked(picked);
          }}
        />

        {file === null ? (
          <p className="text-sm text-muted-foreground">{t("file.none", { language: name(shown) })}</p>
        ) : (
          <GuideFileFacts guideId={guide.id} file={file} />
        )}

        {/* Negative first in the DOM, the affirmative last. */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          {file !== null && (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              disabled={uploading || onlyFile}
              onClick={() => setRemoving(shown)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("file.remove")}
            </Button>
          )}
          <Button
            type="button"
            className="gap-1.5"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileUp className="h-4 w-4" aria-hidden />
            )}
            {file === null ? t("file.upload") : t("file.replace")}
          </Button>
        </div>
        {(onlyFile || file !== null) && (
          <p className="text-xs text-muted-foreground">
            {onlyFile ? t("file.lastFile") : t("file.replaceNote")}
          </p>
        )}
        {/* Last, so a refusal adds a line below everything rather than moving
            anything the admin was looking at. */}
        {error !== null && (
          <StatusLine status="destructive" role="alert">
            {error}
          </StatusLine>
        )}
      </CardContent>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={removing === null ? "" : t("removeDialog.title", { language: name(removing) })}
        description={
          removing === null ? "" : t("removeDialog.description", { language: name(removing) })
        }
        confirmLabel={t("removeDialog.confirm")}
        holdWhileCommitting
        onConfirm={async () => {
          if (removing !== null) await remove(removing);
        }}
        describeError={(failure) => {
          const reason = guideWriteFailure(failure);
          return reason.kind === "reason"
            ? t("errors.removeFailedWithReason", { reason: reason.reason })
            : t("errors.removeFailed");
        }}
      />
    </Card>
  );
}

/** One stored file: its name and size, a way to open it, and who uploaded it when. */
function GuideFileFacts({ guideId, file }: { guideId: string; file: AdminGuideFile }) {
  const t = useTranslations("admin.guides.file");
  const locale = useLocale();
  const timeZone = useTimezone();

  const date = formatDate(file.uploadedAt, locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
  const uploaded =
    file.uploaded.by === null
      ? t("uploaded", { date })
      : file.uploaded.via === null
        ? t("uploadedBy", { date, name: file.uploaded.by })
        : file.uploaded.via.name === null
          ? t("uploadedByViaUnnamed", { date, name: file.uploaded.by })
          : t("uploadedByVia", { date, name: file.uploaded.by, app: file.uploaded.via.name });

  return (
    <div className="space-y-1 text-sm">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="break-all font-medium">{file.fileName}</span>
        <span className="text-muted-foreground">{formatFileSize(file.byteSize, locale)}</span>
      </p>
      <p className="text-muted-foreground">{uploaded}</p>
      {/* A raw anchor: an API route serving the file's bytes, not a page, so
          the wrapped navigation module has no route for it. */}
      <a
        href={adminGuideFilePath(guideId, file.locale)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-act underline-offset-4 hover:underline"
      >
        {t("open")}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  );
}
