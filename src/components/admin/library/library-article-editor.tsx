"use client";

import { useId, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UnsavedChangesGuard } from "@/components/ui/unsaved-changes-guard";
import {
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_MESSAGE_KEY,
  isLibraryCategory,
} from "@/components/library/categories";
import { ImagePicker } from "@/components/admin/products/image-picker";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type {
  AdminLibraryArticle,
  LibraryArticleInput,
} from "@/services/library";
import { ArticleBodyEditor } from "./article-body-editor";
import {
  LIBRARY_PUBLISH_FIELDS,
  emptyLibraryArticleForm,
  isBlankLibraryArticleForm,
  libraryArticleFormFromDraft,
  libraryArticleInputFromForm,
  libraryArticleStatus,
  libraryPublishState,
  libraryWriteFailure,
  sameAsSaved,
  type LibraryArticleForm,
  type LibraryPublishField,
  type LibraryPublishState,
} from "./library-article-form";
import { LibraryArticleStatusChip } from "./library-article-status-chip";

/**
 * The writes the editor makes. Each is a backend action and so the caller's.
 * Each **throws** on refusal, so the editor can say why.
 */
export interface LibraryArticleEditorActions {
  /**
   * Save the working copy. For a new article it resolves as the page leaves
   * for the new article's own editor, which is why the editor never hands the
   * button back on that path.
   */
  save: (input: LibraryArticleInput) => Promise<void>;
  /** Make the saved working copy live. */
  publish: () => Promise<void>;
  /** Take the article out of the Library. */
  unpublish: () => Promise<void>;
}

export type LibraryArticleEditorProps = EditorCommonProps &
  (
    | {
        /** A new article: nothing saved, so nothing to publish yet. */
        article: null;
        actions: Pick<LibraryArticleEditorActions, "save">;
      }
    | {
        /** The article as last read. */
        article: AdminLibraryArticle;
        actions: LibraryArticleEditorActions;
      }
  );

interface EditorCommonProps {
  /** Leave without saving — offered on a new article only. */
  onCancel?: () => void;
}

/**
 * **The page an article is written and published on**, a new one and a saved
 * one alike: where the article stands at the top, the form, and every action
 * in one row beneath it.
 *
 * **The form is seeded once per article, never per read.** Every Library
 * write refetches the article, and so does the window regaining focus; the
 * form is keyed on the article's id and seeds its state at mount, so a refetch
 * refreshes what the page says *about* the saved copy — its status, whether the
 * form differs from it — and never what the admin is typing.
 *
 * **Publishing and previewing act on the saved copy, and only when nothing is
 * unsaved.** A Publish that saved first would be two writes behind one press,
 * and a refusal of either would leave the admin to work out which had landed;
 * a Publish that ignored the form would put something other than what is on
 * screen in front of readers. So Publish waits for Save, and says so. Preview
 * opens the saved copy on a page of its own, in the public site's chrome, and
 * waits for Save the same way, so what it shows is what Publish would publish.
 *
 * **Typing never adds, removes or moves a control.** Which buttons there are
 * changes only with a publish or an unpublish; what typing changes is whether
 * they are enabled, and the reasons in the status row, whose room is reserved.
 *
 * **Leaving with unsaved changes asks first**, until a save lands.
 */
export function LibraryArticleEditor(props: LibraryArticleEditorProps) {
  return <EditorForm key={props.article?.draft.id ?? "new"} {...props} />;
}

function EditorForm(props: LibraryArticleEditorProps) {
  const { article, onCancel } = props;
  const t = useTranslations("admin.library");
  const tCategory = useTranslations("library.categories");

  const [form, setForm] = useState<LibraryArticleForm>(() =>
    article === null
      ? emptyLibraryArticleForm()
      : libraryArticleFormFromDraft(article.draft),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false);

  // Each body the rich editor has been seeded with, mapped to the editor's own
  // serialisation of it — how an untouched body comes back out of the editor.
  const [editorBodies, setEditorBodies] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const recordEditorBody = ({
    value,
    markdown,
  }: {
    value: string;
    markdown: string;
  }) =>
    setEditorBodies((current) =>
      current.get(value) === markdown
        ? current
        : new Map(current).set(value, markdown),
    );

  const dirty =
    article === null || !sameAsSaved(form, article.draft, editorBodies);
  // What leaving would lose. A new article's save leaves the page on purpose,
  // so from the press on there is nothing to ask about.
  const unsaved =
    article === null ? !saving && !isBlankLibraryArticleForm(form) : dirty;
  const set = <K extends keyof LibraryArticleForm>(
    field: K,
    value: LibraryArticleForm[K],
  ) => setForm((current) => ({ ...current, [field]: value }));

  const isPublished = article !== null && article.publication !== null;
  const publishState: LibraryPublishState | null =
    article === null
      ? null
      : libraryPublishState({
          form,
          dirty,
          isPublished,
          hasUnpublishedChanges: article.hasUnpublishedChanges,
        });
  // Why Publish (or the preview) is held back, read out with the button.
  const reasonsId = useId();
  const hasReasons = publishState?.kind === "incomplete" || dirty;

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (form.title.trim() === "") {
      setSaveError(t("errors.titleRequired"));
      return;
    }
    setSaveError(null);
    // Set before the first render after the click: a second press while the
    // first is in flight would create a second article.
    setSaving(true);
    try {
      await props.actions.save(libraryArticleInputFromForm(form));
      // A new article's page is leaving; only a saved one stays to edit on.
      if (article !== null) setSaving(false);
    } catch (failure) {
      setSaving(false);
      setSaveError(describeFailure(failure, t("errors.saveFailed"), (reason) =>
        t("errors.saveFailedWithReason", { reason }),
      ));
    }
  }

  async function handlePublish(publish: () => Promise<void>) {
    setPublishError(null);
    setPublishing(true);
    try {
      // Resolves once the refetch behind it has landed, so the status row is
      // already showing the new status when the button comes back.
      await publish();
    } catch (failure) {
      setPublishError(
        describeFailure(failure, t("errors.publishFailed"), (reason) =>
          t("errors.publishFailedWithReason", { reason }),
        ),
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      <UnsavedChangesGuard when={unsaved} />

      {props.article !== null && publishState !== null && (
        <PublishingStatus
          article={props.article}
          publishState={publishState}
          dirty={dirty}
          reasonsId={reasonsId}
        />
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardContent className="space-y-5 p-6">
            <Field label={t("fields.title")} htmlFor="library-article-title">
              <Input
                id="library-article-title"
                value={form.title}
                onChange={(event) => set("title", event.target.value)}
                autoComplete="off"
              />
            </Field>

            <Field
              label={t("fields.summary")}
              htmlFor="library-article-summary"
              hint={t("hints.summary")}
            >
              {({ hintId }) => (
                <Textarea
                  id="library-article-summary"
                  value={form.summary}
                  onChange={(event) => set("summary", event.target.value)}
                  aria-describedby={hintId}
                  rows={3}
                />
              )}
            </Field>

            <Field
              label={t("fields.category")}
              htmlFor="library-article-category"
            >
              {/* A native select, hand-styled like the app's other admin
                  selects: there is no select primitive yet. The empty option
                  is a real answer for a draft — a category is needed only to
                  publish. */}
              <select
                id="library-article-category"
                value={form.category ?? ""}
                onChange={(event) =>
                  set(
                    "category",
                    isLibraryCategory(event.target.value)
                      ? event.target.value
                      : null,
                  )
                }
                className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">{t("categoryPlaceholder")}</option>
                {LIBRARY_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {tCategory(LIBRARY_CATEGORY_MESSAGE_KEY[category])}
                  </option>
                ))}
              </select>
            </Field>

            <ImagePicker
              purpose="library_cover"
              label={t("fields.cover")}
              hint={t("hints.cover")}
              optional
              imageId={form.cover?.id ?? null}
              current={form.cover}
              onChange={(id, image) =>
                set("cover", id === null || image === null ? null : { id, ...image })
              }
            />

            <Field label={t("fields.body")} hint={t("hints.body")}>
              {({ hintId }) => (
                <ArticleBodyEditor
                  value={form.body}
                  onChange={(body) => set("body", body)}
                  onSeeded={recordEditorBody}
                  placeholder={t("bodyPlaceholder")}
                  ariaLabel={t("fields.body")}
                  describedBy={hintId}
                />
              )}
            </Field>
          </CardContent>
        </Card>

        {/* Every action in one row, negative first in the DOM and the
            affirmative last. Unpublish, the answer against publishing, is set
            apart at the far end from Publish; between them run the two ways
            to look at the article and then Save and Publish, in the order the
            work goes. Only a publish or an unpublish changes which buttons
            there are — typing changes whether they are enabled. */}
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("actions.cancel")}
            </Button>
          )}
          {props.article !== null && isPublished && (
            <Button
              type="button"
              variant="outline"
              className="sm:mr-auto"
              disabled={publishing}
              onClick={() => setConfirmingUnpublish(true)}
            >
              {t("unpublish")}
            </Button>
          )}
          {props.article !== null &&
            // An anchor cannot be disabled, so while the form holds unsaved
            // changes the preview is a disabled button in the link's place.
            (dirty ? (
              <Button
                type="button"
                variant="outline"
                disabled
                aria-describedby={reasonsId}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                {t("preview")}
              </Button>
            ) : (
              <Link
                href={ROUTES.libraryArticlePreview(props.article.draft.id)}
                target="_blank"
                rel="noopener"
                className={buttonVariants({ variant: "outline" })}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                {t("preview")}
              </Link>
            ))}
          {props.article !== null && isPublished && (
            <Link
              href={ROUTES.libraryArticle(props.article.draft.id)}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ variant: "outline" })}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              {t("viewLive")}
            </Link>
          )}
          <Button type="submit" disabled={saving || !dirty}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {article === null ? t("newPage.submit") : t("actions.save")}
          </Button>
          {props.article !== null && (
            <Button
              type="button"
              disabled={publishing || publishState?.kind !== "ready"}
              aria-describedby={hasReasons ? reasonsId : undefined}
              onClick={() => void handlePublish(props.actions.publish)}
            >
              {publishing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {isPublished ? t("publishChanges") : t("publish")}
            </Button>
          )}
        </div>
        {/* Last, so a refusal adds a line below everything rather than moving
            anything the admin was looking at. */}
        {publishError && (
          <StatusLine status="destructive" role="alert">
            {publishError}
          </StatusLine>
        )}
        {saveError && (
          <StatusLine status="destructive" role="alert">
            {saveError}
          </StatusLine>
        )}
      </form>

      {props.article !== null && (
        <ConfirmDialog
          open={confirmingUnpublish}
          onOpenChange={setConfirmingUnpublish}
          title={t("unpublishConfirm.title")}
          description={t("unpublishConfirm.description")}
          confirmLabel={t("unpublishConfirm.confirm")}
          cancelLabel={t("actions.cancel")}
          confirmVariant="destructive"
          holdWhileCommitting
          onConfirm={props.actions.unpublish}
          describeError={(failure) =>
            describeFailure(failure, t("errors.unpublishFailed"), (reason) =>
              t("errors.unpublishFailedWithReason", { reason }),
            )
          }
        />
      )}
    </div>
  );
}

/** How the reasons sit: side by side, wrapping where the row runs out. */
const REASONS_LAYOUT = "col-start-1 row-start-1 flex flex-wrap gap-x-4 gap-y-1";

/**
 * Where the article stands with readers, and why Publish is held back.
 *
 * The status is the Library list's own chip, so the list and the editor name a
 * state alike, and it names the **saved** state. Beside it, the fact that goes
 * with it: the date of the version readers see, whenever there is one. The
 * chip and its fact change only with a publish or an unpublish.
 *
 * **The reasons change while the admin types, so their room is reserved.**
 * Beneath the chip, they are drawn over invisible copies of the longest
 * reasons there can be — every field missing and the preview waiting for a
 * save, or publishing waiting for one — in the same grid cell, so the cell is
 * as tall as the worst case at whatever width and in whatever locale the page
 * is read, and a reason arriving or going never moves the form below.
 */
function PublishingStatus({
  article,
  publishState,
  dirty,
  reasonsId,
}: {
  article: AdminLibraryArticle;
  publishState: LibraryPublishState;
  dirty: boolean;
  reasonsId: string;
}) {
  const t = useTranslations("admin.library");
  const format = useFormatter();
  const locale = useLocale();
  const timeZone = useTimezone();

  const status = libraryArticleStatus({
    isPublished: article.publication !== null,
    hasUnpublishedChanges: article.hasUnpublishedChanges,
  });

  const missingName: Record<LibraryPublishField, string> = {
    title: t("missing.title"),
    summary: t("missing.summary"),
    category: t("missing.category"),
    body: t("missing.body"),
  };
  const missingLine = (fields: readonly LibraryPublishField[]) =>
    t("readiness.missing", {
      fields: format.list(
        fields.map((field) => missingName[field]),
        { type: "conjunction" },
      ),
    });

  // A draft has nothing readers see. A live article says since when; with
  // saved changes waiting, that date is of the version readers still see.
  let fact: string | null = null;
  if (article.publication !== null) {
    const date = formatDate(article.publication.publishedAt, locale, {
      dateStyle: "long",
      timeZone,
    });
    fact =
      status === "changed"
        ? t("statusPanel.changedLine", { date })
        : t("statusPanel.publishedLine", { date });
  }

  const reasons: string[] = [];
  if (publishState.kind === "incomplete") {
    reasons.push(missingLine(publishState.missing));
  }
  // One line for what the unsaved changes hold back: the preview always, and
  // Publish too once nothing but saving stands in its way.
  if (dirty) {
    reasons.push(
      publishState.kind === "unsaved"
        ? t("readiness.unsaved")
        : t("readiness.previewUnsaved"),
    );
  }
  const worstCases = [
    [missingLine(LIBRARY_PUBLISH_FIELDS), t("readiness.previewUnsaved")],
    [t("readiness.unsaved")],
  ];

  return (
    <section aria-label={t("statusPanel.label")} className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <LibraryArticleStatusChip status={status} />
        {fact && <p className="text-sm text-muted-foreground">{fact}</p>}
      </div>

      <div className="grid">
        {worstCases.map((lines) => (
          <div
            key={lines.join(" ")}
            aria-hidden
            className={cn(REASONS_LAYOUT, "invisible")}
          >
            {lines.map((line) => (
              <StatusLine key={line} status="info">
                {line}
              </StatusLine>
            ))}
          </div>
        ))}
        <div id={reasonsId} className={REASONS_LAYOUT}>
          {reasons.map((reason) => (
            <StatusLine key={reason} status="info">
              {reason}
            </StatusLine>
          ))}
        </div>
      </div>
    </section>
  );
}

/** A refusal in the admin's words: the database's own sentence where it wrote one. */
function describeFailure(
  failure: unknown,
  generic: string,
  withReason: (reason: string) => string,
): string {
  const reason = libraryWriteFailure(failure);
  return reason.kind === "reason" ? withReason(reason.reason) : generic;
}
