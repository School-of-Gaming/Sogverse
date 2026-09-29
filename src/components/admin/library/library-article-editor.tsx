"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle, StatusLine } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_MESSAGE_KEY,
  isLibraryCategory,
} from "@/components/library/categories";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type {
  AdminLibraryArticle,
  LibraryArticleInput,
} from "@/services/library";
import { ArticleBodyEditor } from "./article-body-editor";
import {
  emptyLibraryArticleForm,
  libraryArticleFormFromDraft,
  libraryArticleInputFromForm,
  libraryArticleStatus,
  libraryPublishState,
  libraryWriteFailure,
  sameAsSaved,
  type LibraryArticleForm,
  type LibraryArticleStatus,
  type LibraryPublishField,
} from "./library-article-form";
import { LibraryCoverField } from "./library-cover-field";

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
 * one alike.
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
 */
export function LibraryArticleEditor(props: LibraryArticleEditorProps) {
  return <EditorForm key={props.article?.draft.id ?? "new"} {...props} />;
}

function EditorForm(props: LibraryArticleEditorProps) {
  const { article, actions, onCancel } = props;
  const t = useTranslations("admin.library");
  const tCategory = useTranslations("library.categories");

  const [form, setForm] = useState<LibraryArticleForm>(() =>
    article === null
      ? emptyLibraryArticleForm()
      : libraryArticleFormFromDraft(article.draft),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
  const set = <K extends keyof LibraryArticleForm>(
    field: K,
    value: LibraryArticleForm[K],
  ) => setForm((current) => ({ ...current, [field]: value }));

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
      await actions.save(libraryArticleInputFromForm(form));
      // A new article's page is leaving; only a saved one stays to edit on.
      if (article !== null) setSaving(false);
    } catch (failure) {
      setSaving(false);
      setSaveError(describeFailure(failure, t("errors.saveFailed"), (reason) =>
        t("errors.saveFailedWithReason", { reason }),
      ));
    }
  }

  return (
    <div className="space-y-6">
      {props.article !== null && (
        <PublishingPanel
          article={props.article}
          form={form}
          dirty={dirty}
          actions={props.actions}
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

            <LibraryCoverField
              cover={form.cover}
              onChange={(cover) => set("cover", cover)}
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

        {/* Negative first in the DOM, affirmative last. */}
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t("actions.cancel")}
            </Button>
          )}
          <Button type="submit" size="lg" disabled={saving || !dirty}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {article === null ? t("newPage.submit") : t("actions.save")}
          </Button>
        </div>
        {/* Last, so a refusal adds a line below everything rather than moving
            anything the admin was looking at. */}
        {saveError && (
          <StatusLine status="destructive" role="alert">
            {saveError}
          </StatusLine>
        )}
      </form>
    </div>
  );
}

/** The list chip's colours, so the list and the editor name a state alike. */
const STATUS_ALERT: Record<LibraryArticleStatus, "default" | "success" | "info"> = {
  draft: "default",
  published: "success",
  changed: "info",
};

/**
 * Where the article stands with readers, and the controls that change it.
 *
 * The status names the **saved** state: what readers see now, and whether
 * saved changes are waiting for them. Under it, Preview — the saved copy as a
 * parent would meet it if it were published now, in a new tab, and held back
 * while the form has unsaved changes — then the link to the public page while
 * the article is live, Unpublish behind a confirmation, and Publish — which
 * reads "Publish changes" once the article is live, and is disabled with its
 * reason in a line beneath while there is nothing it can publish yet.
 */
function PublishingPanel({
  article,
  form,
  dirty,
  actions,
}: {
  article: AdminLibraryArticle;
  form: LibraryArticleForm;
  dirty: boolean;
  actions: LibraryArticleEditorActions;
}) {
  const t = useTranslations("admin.library");
  const format = useFormatter();
  const locale = useLocale();
  const timeZone = useTimezone();
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false);

  const isPublished = article.publication !== null;
  const status = libraryArticleStatus({
    isPublished,
    hasUnpublishedChanges: article.hasUnpublishedChanges,
  });
  const publishState = libraryPublishState({
    form,
    dirty,
    isPublished,
    hasUnpublishedChanges: article.hasUnpublishedChanges,
  });

  const missingName: Record<LibraryPublishField, string> = {
    title: t("missing.title"),
    summary: t("missing.summary"),
    category: t("missing.category"),
    body: t("missing.body"),
  };

  // Keyed concretely, so the compiler checks every key it reads.
  const statusCopy: Record<LibraryArticleStatus, { title: string; body: string }> = {
    draft: {
      title: t("statusPanel.draftTitle"),
      body: t("statusPanel.draftBody"),
    },
    published: {
      title: t("statusPanel.publishedTitle"),
      body: t("statusPanel.publishedBody"),
    },
    changed: {
      title: t("statusPanel.changedTitle"),
      body:
        article.publication === null
          ? ""
          : t("statusPanel.changedBody", {
              date: formatDate(article.publication.publishedAt, locale, {
                dateStyle: "long",
                timeZone,
              }),
            }),
    },
  };

  async function handlePublish() {
    setPublishError(null);
    setPublishing(true);
    try {
      // Resolves once the refetch behind it has landed, so the panel below is
      // already showing the new status when the button comes back.
      await actions.publish();
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
    <section aria-label={t("statusPanel.label")} className="space-y-3">
      <Alert variant={STATUS_ALERT[status]}>
        <div className="min-w-0 space-y-1.5">
          <AlertTitle>{statusCopy[status].title}</AlertTitle>
          <AlertDescription>{statusCopy[status].body}</AlertDescription>
        </div>
      </Alert>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {/* An anchor cannot be disabled, so while the form holds unsaved
            changes the preview is a disabled button in the link's place. */}
        {dirty ? (
          <Button type="button" variant="outline" disabled>
            <ExternalLink className="h-4 w-4" aria-hidden />
            {t("preview")}
          </Button>
        ) : (
          <Link
            href={ROUTES.libraryArticlePreview(article.draft.id)}
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: "outline" })}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            {t("preview")}
          </Link>
        )}
        {isPublished && (
          <Link
            href={ROUTES.libraryArticle(article.draft.id)}
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: "outline" })}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            {t("viewLive")}
          </Link>
        )}
        {isPublished && (
          <Button
            type="button"
            variant="outline"
            disabled={publishing}
            onClick={() => setConfirmingUnpublish(true)}
          >
            {t("unpublish")}
          </Button>
        )}
        {publishState.kind !== "hidden" && (
          <Button
            type="button"
            disabled={publishing || publishState.kind !== "ready"}
            onClick={() => void handlePublish()}
          >
            {publishing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {isPublished ? t("publishChanges") : t("publish")}
          </Button>
        )}
      </div>

      {publishState.kind === "incomplete" && (
        <StatusLine status="info" className="sm:justify-end">
          {t("readiness.missing", {
            fields: format.list(
              publishState.missing.map((field) => missingName[field]),
              { type: "conjunction" },
            ),
          })}
        </StatusLine>
      )}
      {/* One line for what the unsaved changes hold back: the preview always,
          and Publish too once nothing but saving stands in its way. */}
      {dirty && (
        <StatusLine status="info" className="sm:justify-end">
          {publishState.kind === "unsaved"
            ? t("readiness.unsaved")
            : t("readiness.previewUnsaved")}
        </StatusLine>
      )}
      {publishError && (
        <StatusLine status="destructive" role="alert" className="sm:justify-end">
          {publishError}
        </StatusLine>
      )}

      <ConfirmDialog
        open={confirmingUnpublish}
        onOpenChange={setConfirmingUnpublish}
        title={t("unpublishConfirm.title")}
        description={t("unpublishConfirm.description")}
        confirmLabel={t("unpublishConfirm.confirm")}
        cancelLabel={t("actions.cancel")}
        confirmVariant="destructive"
        holdWhileCommitting
        onConfirm={actions.unpublish}
        describeError={(failure) =>
          describeFailure(failure, t("errors.unpublishFailed"), (reason) =>
            t("errors.unpublishFailedWithReason", { reason }),
          )
        }
      />
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
