"use client";

import { useId, useState } from "react";
import { CircleCheck, CircleDashed, ExternalLink, Loader2, X } from "lucide-react";
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
import {
  articleAddress,
  type AddressableArticle,
} from "@/components/library/article-address";
import { useLanguageNames } from "@/hooks/use-language-names";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import {
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { localeTabAfterRemoving } from "@/lib/i18n/locale-tabs";
import { cn, findOption, formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import {
  isCompleteVersion,
  libraryWriteFailure,
  type AdminLibraryArticle,
  type LibraryArticleDraft,
  type LibraryArticleInput,
} from "@/services/library";
import { ArticleBodyEditor } from "./article-body-editor";
import {
  emptyLibraryArticleForm,
  formLocales,
  incompleteLocales,
  isBlankLibraryArticleForm,
  libraryArticleFormFromDraft,
  libraryArticleInputFromForm,
  libraryArticleStatus,
  libraryPublishState,
  librarySaveBlocker,
  sameAsSaved,
  versionOf,
  type LibraryArticleForm,
  type LibraryArticleVersionDraft,
  type LibraryPublishNeed,
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
        /**
         * Everything live — what "View live" judges the article's public
         * address against. Until it is read, the link opens the article by
         * its id, which always resolves.
         */
        published?: readonly AddressableArticle[];
      }
  );

interface EditorCommonProps {
  /** Leave without saving — offered on a new article only. */
  onCancel?: () => void;
}

/**
 * **The page an article is written and published on**, a new one and a saved
 * one alike: where the article stands at the top, the form, and every action
 * in one row beneath it, beside the reasons any of them is held back.
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
 * **The text is written per language, in tabs** — the team profile's: a tab
 * per language written, each marked complete or not, a remove control on each
 * while more than one remains, and an "add a language" select for the rest.
 * The category and the cover are the article's, once, beneath them.
 *
 * **Typing never adds, removes or moves a control.** Which buttons there are
 * changes only with a publish or an unpublish; what typing changes is whether
 * they are enabled, and the reasons beside them, which grow leftward into the
 * row's slack.
 *
 * **Exactly one amber button, at most.** Save and Publish are both the
 * page's affirmative, but only one of them can be pressed at a time; the one
 * that cannot is drawn outlined, so the filled one is always the next step.
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
  const languageName = useLanguageNames();
  const uiLocale = resolveLocale(useLocale());

  const [form, setForm] = useState<LibraryArticleForm>(() =>
    article === null
      ? emptyLibraryArticleForm(uiLocale)
      : libraryArticleFormFromDraft(article.draft, uiLocale),
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
  const hasReasons = publishState?.kind === "incomplete";
  const saveDisabled = saving || !dirty;
  const publishDisabled = publishing || publishState?.kind !== "ready";

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const blocker = librarySaveBlocker(form);
    if (blocker !== null) {
      setSaveError(
        blocker.kind === "noVersion"
          ? t("errors.titleRequired")
          : t("errors.versionTitleRequired", {
              language: languageName(
                blocker.locale,
                LOCALE_CONFIG[blocker.locale].label,
              ),
            }),
      );
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

      {props.article !== null && (
        <div className="space-y-1">
          <PublishingStatus article={props.article} />
          <LastSaved draft={props.article.draft} />
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardContent className="space-y-5 p-6">
            <ArticleVersionsSection
              form={form}
              setForm={setForm}
              onSeeded={recordEditorBody}
            />

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

          </CardContent>
        </Card>

        {/* Every action in one row, negative first in the DOM and the
            affirmative last. Unpublish, the answer against publishing, is set
            apart at the far end from Publish; between them run the reasons,
            the two ways to look at the article, and then Save and Publish, in
            the order the work goes. Only a publish or an unpublish changes
            which buttons there are — typing changes whether they are enabled.

            What is missing before Publish can act sits between Unpublish and
            the buttons, in whatever width they leave, wrapping inside it. The
            row never wraps and aligns to the top, so a reason arriving or
            growing a second line never moves a button. Unsaved changes need no
            sentence: Save is the one filled button, and Preview and Publish
            wait for it. */}
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-start sm:justify-end">
          {props.article !== null && isPublished && (
            <Button
              type="button"
              variant="outline"
              disabled={publishing}
              onClick={() => setConfirmingUnpublish(true)}
            >
              {t("unpublish")}
            </Button>
          )}
          {publishState !== null && (
            <PublishReasons
              id={reasonsId}
              publishState={publishState}
              leftOut={incompleteLocales(form)}
            />
          )}
          <div className="flex shrink-0 flex-col-reverse gap-3 sm:flex-row">
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel}>
                {t("actions.cancel")}
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
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  {t("preview")}
                </Button>
              ) : (
                // Opened in the language of the tab in front of the admin, so
                // the preview shows that version in that language's chrome.
                <Link
                  href={ROUTES.libraryArticlePreview(props.article.draft.id)}
                  locale={form.activeLocale}
                  target="_blank"
                  rel="noopener"
                  className={buttonVariants({ variant: "outline" })}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  {t("preview")}
                </Link>
              ))}
            {props.article !== null && isPublished && (
              // The live page in the language of the tab in front of the
              // admin, at the address a reader of that language shares.
              <Link
                href={ROUTES.libraryArticle(
                  props.published === undefined
                    ? props.article.draft.id
                    : articleAddress(
                        props.published,
                        props.article.draft,
                        form.activeLocale,
                      ),
                )}
                locale={form.activeLocale}
                target="_blank"
                rel="noopener"
                className={buttonVariants({ variant: "outline" })}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                {t("viewLive")}
              </Link>
            )}
            <div className="flex shrink-0 flex-col-reverse gap-3 sm:flex-row">
              <Button type="submit" disabled={saveDisabled} {...affirmative(!saveDisabled)}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {article === null ? t("newPage.submit") : t("actions.save")}
              </Button>
              {props.article !== null && (
                <Button
                  type="button"
                  disabled={publishDisabled}
                  {...affirmative(!publishDisabled)}
                  aria-describedby={hasReasons ? reasonsId : undefined}
                  onClick={() => void handlePublish(props.actions.publish)}
                >
                  {publishing && (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  )}
                  {isPublished ? t("publishChanges") : t("publish")}
                </Button>
              )}
            </div>
          </div>
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

/**
 * How Save or Publish is drawn: filled while it can be pressed, outlined while
 * it cannot. The two are never pressable together, so at most one amber button
 * is ever on screen. The filled one carries a clear border so the two are the
 * same size whichever is filled, and a swap moves nothing.
 */
function affirmative(enabled: boolean) {
  return enabled
    ? { variant: "default" as const, className: "border border-transparent" }
    : { variant: "outline" as const };
}

/**
 * Where the article stands with readers.
 *
 * The status is the Library list's own chip, so the list and the editor name a
 * state alike, and it names the **saved** state. Beside it, the fact that goes
 * with it: the date of the version readers see, whenever there is one. Both
 * change only with a publish or an unpublish.
 */
function PublishingStatus({ article }: { article: AdminLibraryArticle }) {
  const t = useTranslations("admin.library");
  const locale = useLocale();
  const timeZone = useTimezone();

  const status = libraryArticleStatus({
    isPublished: article.publication !== null,
    hasUnpublishedChanges: article.hasUnpublishedChanges,
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

  return (
    <section
      aria-label={t("statusPanel.label")}
      className="flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      <LibraryArticleStatusChip status={status} />
      {fact && <p className="text-sm text-muted-foreground">{fact}</p>}
    </section>
  );
}

/**
 * When the working copy was last saved, by which admin, and — when the save
 * came through an AI app connected to Sogverse — which app, so an edit an
 * app made is never mistaken for one made here. A save with no recorded saver
 * gives the time alone. The app's name is the one it registered, and an app
 * no longer registered is named only as an AI app.
 */
function LastSaved({ draft }: { draft: LibraryArticleDraft }) {
  const t = useTranslations("admin.library");
  const locale = useLocale();
  const timeZone = useTimezone();

  const date = formatDate(draft.updatedAt, locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });

  let line: string;
  if (draft.lastSavedBy === null) {
    line = t("statusPanel.savedLine", { date });
  } else if (draft.lastSavedVia === null) {
    line = t("statusPanel.savedByLine", { date, name: draft.lastSavedBy });
  } else if (draft.lastSavedVia.name === null) {
    line = t("statusPanel.savedByViaUnnamedLine", {
      date,
      name: draft.lastSavedBy,
    });
  } else {
    line = t("statusPanel.savedByViaLine", {
      date,
      name: draft.lastSavedBy,
      app: draft.lastSavedVia.name,
    });
  }

  return <p className="text-sm text-muted-foreground">{line}</p>;
}

/**
 * What an article still needs before Publish can act, set against the buttons
 * it explains — and, while it can be published, the languages a publish would
 * leave out because they are not complete yet. The box takes whatever width
 * the buttons leave and wraps inside it; the padding sets a first line level
 * with the buttons' labels.
 */
function PublishReasons({
  id,
  publishState,
  leftOut,
}: {
  id: string;
  publishState: LibraryPublishState;
  /** Languages written but incomplete, in locale order. */
  leftOut: readonly SupportedLocale[];
}) {
  const t = useTranslations("admin.library");
  const format = useFormatter();
  const languageName = useLanguageNames();

  const needName: Record<LibraryPublishNeed, string> = {
    category: t("missing.category"),
    completeVersion: t("missing.completeVersion"),
  };
  const languages = format.list(
    leftOut.map((locale) => languageName(locale, LOCALE_CONFIG[locale].label)),
    { type: "conjunction" },
  );

  return (
    <div
      id={id}
      className="flex min-w-0 flex-1 flex-col items-end gap-1 text-right sm:py-2.5"
    >
      {publishState.kind === "incomplete" && (
        <StatusLine status="info">
          {t("readiness.missing", {
            fields: format.list(
              publishState.missing.map((need) => needName[need]),
              { type: "conjunction" },
            ),
          })}
        </StatusLine>
      )}
      {/* Only beside a publish that would go ahead: with no complete
          language at all, the line above already says what to do. */}
      {publishState.kind !== "upToDate" &&
        !(
          publishState.kind === "incomplete" &&
          publishState.missing.includes("completeVersion")
        ) &&
        leftOut.length > 0 && (
        <StatusLine status="info">
          {t("readiness.leftOut", { languages, count: leftOut.length })}
        </StatusLine>
      )}
    </div>
  );
}

/**
 * **An article's text, one tab per language.** The team profile's tabs,
 * mirrored rather than shared, as that form mirrors the product form's: a tab
 * per language written, a remove control on each while more than one remains,
 * and an "add a language" select for the rest. Each tab says whether its
 * version is complete — a title, a summary and a body — because only a
 * complete one is published.
 *
 * The body editor reads its content once, at mount, so the locale is its key
 * and switching tabs remounts it on that language's draft.
 */
function ArticleVersionsSection({
  form,
  setForm,
  onSeeded,
}: {
  form: LibraryArticleForm;
  setForm: React.Dispatch<React.SetStateAction<LibraryArticleForm>>;
  onSeeded: (seed: { value: string; markdown: string }) => void;
}) {
  const t = useTranslations("admin.library");
  const languageName = useLanguageNames();
  const uiLocale = resolveLocale(useLocale());

  const locale = form.activeLocale;
  const addedLocales = formLocales(form);
  const addableLocales = SUPPORTED_LOCALES.filter(
    (l) => form.versions[l] === undefined,
  );
  const draft = versionOf(form, locale);

  function setActive(patch: Partial<LibraryArticleVersionDraft>) {
    setForm((prev) => ({
      ...prev,
      versions: {
        ...prev.versions,
        [prev.activeLocale]: { ...versionOf(prev, prev.activeLocale), ...patch },
      },
    }));
  }

  function addLocale(next: SupportedLocale) {
    setForm((prev) => ({
      ...prev,
      versions: { ...prev.versions, [next]: versionOf(prev, next) },
      activeLocale: next,
    }));
  }

  function removeLocale(gone: SupportedLocale) {
    setForm((prev) => {
      const next = { ...prev.versions };
      delete next[gone];
      return {
        ...prev,
        versions: next,
        activeLocale: localeTabAfterRemoving(
          next,
          prev.activeLocale,
          gone,
          uiLocale,
        ),
      };
    });
  }

  return (
    <div className="space-y-5">
      <Field label={t("fields.languages")} hint={t("hints.languages")}>
        <div className="flex flex-wrap items-center gap-1 border-b border-border">
          {addedLocales.map((l) => {
            const isActive = locale === l;
            const canRemove = addedLocales.length > 1;
            const name = languageName(l, LOCALE_CONFIG[l].label);
            const complete = isCompleteVersion(versionOf(form, l));
            const Mark = complete ? CircleCheck : CircleDashed;
            return (
              <span
                key={l}
                className={cn(
                  "inline-flex items-center gap-1 rounded-t-md border-b-2 border-border px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "text-act"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  aria-pressed={isActive}
                  className="inline-flex items-center gap-1.5"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, activeLocale: l }))
                  }
                >
                  {LOCALE_CONFIG[l].nativeLabel}
                  <Mark className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">
                    {complete ? t("versionComplete") : t("versionIncomplete")}
                  </span>
                </button>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => removeLocale(l)}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                    aria-label={t("removeLocale", { language: name })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
          {addableLocales.length > 0 && (
            <select
              value=""
              aria-label={t("addLocale")}
              onChange={(e) => {
                const next = findOption(addableLocales, e.target.value);
                if (next) addLocale(next);
              }}
              className="mb-1 ml-1 h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            >
              <option value="">{t("addLocale")}</option>
              {addableLocales.map((l) => (
                <option key={l} value={l}>
                  {languageName(l, LOCALE_CONFIG[l].label)}
                </option>
              ))}
            </select>
          )}
        </div>
      </Field>

      <Field label={t("fields.title")} htmlFor="library-article-title">
        <Input
          id="library-article-title"
          value={draft.title}
          lang={locale}
          onChange={(event) => setActive({ title: event.target.value })}
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
            value={draft.summary}
            lang={locale}
            onChange={(event) => setActive({ summary: event.target.value })}
            aria-describedby={hintId}
            rows={3}
          />
        )}
      </Field>

      <Field label={t("fields.body")} hint={t("hints.body")}>
        {({ hintId }) => (
          <div lang={locale}>
            <ArticleBodyEditor
              key={locale}
              value={draft.body}
              onChange={(body) => setActive({ body })}
              onSeeded={onSeeded}
              placeholder={t("bodyPlaceholder")}
              ariaLabel={t("fields.body")}
              describedBy={hintId}
            />
          </div>
        )}
      </Field>
    </div>
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
