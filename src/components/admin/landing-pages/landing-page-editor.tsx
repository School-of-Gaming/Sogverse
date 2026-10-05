"use client";

import { useId, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UnsavedChangesGuard } from "@/components/ui/unsaved-changes-guard";
import { useLanguageNames } from "@/hooks/use-language-names";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import {
  LOCALE_CONFIG,
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import {
  landingWriteFailure,
  type AdminLandingPage,
  type LandingPageDraft,
  type LandingPageInput,
} from "@/services/landing-pages";
import {
  emptyLandingPageForm,
  fixedSlugLocales,
  incompleteLocales,
  isBlankLandingPageForm,
  landingPageFormFromDraft,
  landingPageInputFromForm,
  landingPageStatus,
  landingPublishState,
  landingSaveBlocker,
  liveLocalesTakenDown,
  sameAsSaved,
  type LandingPageForm,
  type LandingPublishState,
  type LandingSaveBlocker,
} from "./landing-page-form";
import { LandingPageStatusChip } from "./landing-page-status-chip";
import { LandingStructurePane } from "./landing-structure-pane";
import { LandingVersionsPane } from "./landing-versions-pane";

/**
 * The writes the editor makes. Each is a backend action and so the caller's,
 * and each **throws** on refusal, so the editor can say why.
 */
export interface LandingPageEditorActions {
  /**
   * Save the working copy whole. For a new page it resolves as the page
   * leaves for the new page's own editor; for a saved one, once the page has
   * been read again.
   */
  save: (input: LandingPageInput) => Promise<void>;
  /** Make the saved working copy live. */
  publish: () => Promise<void>;
  /** Take the page off the site. */
  unpublish: () => Promise<void>;
}

export type LandingPageEditorProps = { onCancel?: () => void } & (
  | { page: null; actions: Pick<LandingPageEditorActions, "save"> }
  | { page: AdminLandingPage; actions: LandingPageEditorActions }
);

/**
 * **The page a landing page is built, written and published on**, a new one
 * and a saved one alike — the Library article editor's shape: where the page
 * stands at the top, the structure and the words beneath, and every action in
 * one row under them, beside the reasons any of them is held back.
 *
 * **The form is seeded once per page, never per read.** Every landing page
 * write — and every image catalogue change — refetches the page, and so does
 * the window regaining focus; the form is keyed on the page's id and seeds its
 * state at mount, so a refetch refreshes what the page says *about* the saved
 * copy and never what the admin is typing. The one deliberate re-seed is right
 * after the admin's own save, and only when nothing has been typed since:
 * the save stores links canonical (a pasted address becomes the page it leads
 * to), so the form takes back what was stored, and shows it.
 *
 * **Publishing and previewing act on the saved copy, and only when nothing is
 * unsaved**, as in the Library. Beside Publish the editor names what holds it
 * back, which languages a publish would leave out, and which live languages it
 * would take off the site — the case a section added to a live page creates,
 * since every live language lacks the new section's words until they are
 * written.
 *
 * **Exactly one amber button, at most**, and leaving with unsaved changes asks
 * first, until a save lands.
 */
export function LandingPageEditor(props: LandingPageEditorProps) {
  return <EditorForm key={props.page?.draft.id ?? "new"} {...props} />;
}

function EditorForm(props: LandingPageEditorProps) {
  const { page, onCancel } = props;
  const t = useTranslations("admin.landingPages");
  const languageName = useLanguageNames();
  const uiLocale = resolveLocale(useLocale());

  const [form, setForm] = useState<LandingPageForm>(() =>
    page === null ? emptyLandingPageForm(uiLocale) : landingPageFormFromDraft(page.draft, uiLocale),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false);
  // Each rich text value an editor was seeded with, mapped to the editor's own
  // serialisation of it — how an untouched field comes back out of the editor.
  const [editorMarkdown, setEditorMarkdown] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  // The re-seed after a save: the copy it was saved over, and what it sent.
  const [reseed, setReseed] = useState<{ after: string; sent: string } | null>(null);
  // Bumped by a re-seed, so every rich editor remounts on the stored words.
  const [generation, setGeneration] = useState(0);

  if (reseed !== null && page !== null && page.draft.updatedAt !== reseed.after) {
    // The read after the save has landed. Taken only if nothing was typed
    // while the save was in the air; otherwise the form keeps the typing.
    setReseed(null);
    if (JSON.stringify(landingPageInputFromForm(form)) === reseed.sent) {
      const stored = landingPageFormFromDraft(page.draft, uiLocale);
      setForm({
        ...stored,
        activeLocale: form.activeLocale,
        // The pictures met so far keep their labels.
        pictures: { ...stored.pictures, ...form.pictures },
      });
      setGeneration((current) => current + 1);
    }
  }

  const recordEditorMarkdown = ({ value, markdown }: { value: string; markdown: string }) =>
    setEditorMarkdown((current) =>
      current.get(value) === markdown ? current : new Map(current).set(value, markdown),
    );

  const fixedSlugs = fixedSlugLocales(page);
  const dirty = page === null || !sameAsSaved(form, page.draft, editorMarkdown);
  const unsaved = page === null ? !saving && !isBlankLandingPageForm(form) : dirty;

  const isPublished = page !== null && page.publication !== null;
  const publishState: LandingPublishState | null =
    page === null
      ? null
      : landingPublishState({
          form,
          dirty,
          isPublished,
          hasUnpublishedChanges: page.hasUnpublishedChanges,
        });
  const takenDown = page === null ? [] : liveLocalesTakenDown(form, page);
  const leftOut = incompleteLocales(form).filter((locale) => !takenDown.includes(locale));
  const reasonsId = useId();
  const saveDisabled = saving || !dirty;
  const publishDisabled = publishing || publishState?.kind !== "ready";

  const language = (locale: SupportedLocale) => languageName(locale, LOCALE_CONFIG[locale].label);

  function blockerMessage(blocker: LandingSaveBlocker): string {
    switch (blocker.kind) {
      case "noVersion":
        return t("errors.titleRequired");
      case "untitled":
        return t("errors.versionTitleRequired", { language: language(blocker.locale) });
      case "badSlug":
        return t("errors.versionSlugShape", { language: language(blocker.locale) });
      case "needsPicture":
      case "needsAddress":
      case "badAddress":
        return t(`errors.${blocker.kind}`, { number: blocker.number });
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const blocker = landingSaveBlocker(form, fixedSlugs);
    if (blocker !== null) {
      setSaveError(blockerMessage(blocker));
      return;
    }
    setSaveError(null);
    // Set before the first render after the click: a second press while the
    // first is in flight would create a second page.
    setSaving(true);
    const input = landingPageInputFromForm(form);
    try {
      await props.actions.save(input);
      // A new page's editor is leaving; only a saved one stays to edit on.
      if (page !== null) {
        setReseed({ after: page.draft.updatedAt, sent: JSON.stringify(input) });
        setSaving(false);
      }
    } catch (failure) {
      setSaving(false);
      setSaveError(
        describeFailure(failure, t("errors.saveFailed"), (reason) =>
          t("errors.saveFailedWithReason", { reason }),
        ),
      );
    }
  }

  async function handlePublish(publish: () => Promise<void>) {
    setPublishError(null);
    setPublishing(true);
    try {
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

      {page !== null && (
        <div className="space-y-1">
          <PublishingStatus page={page} />
          <LastSaved draft={page.draft} />
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:items-start">
          <Card>
            <CardContent className="p-6">
              <LandingStructurePane form={form} setForm={setForm} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <LandingVersionsPane
                key={generation}
                form={form}
                setForm={setForm}
                fixedSlugs={fixedSlugs}
                onSeeded={recordEditorMarkdown}
              />
            </CardContent>
          </Card>
        </div>

        {/* Every action in one row, negative first in the DOM and the
            affirmative last — the Library editor's row. What holds Publish
            back sits between Unpublish and the buttons, in whatever width
            they leave; the row aligns to the top, so a reason arriving never
            moves a button. */}
        <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-start sm:justify-end">
          {props.page !== null && isPublished && (
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
              leftOut={leftOut}
              takenDown={takenDown}
            />
          )}
          <div className="flex shrink-0 flex-col-reverse gap-3 sm:flex-row">
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel}>
                {t("actions.cancel")}
              </Button>
            )}
            {props.page !== null &&
              // An anchor cannot be disabled, so while the form holds unsaved
              // changes the preview is a disabled button in the link's place.
              (dirty ? (
                <Button type="button" variant="outline" disabled>
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  {t("preview")}
                </Button>
              ) : (
                // In the language of the tab in front of the admin.
                <Link
                  href={ROUTES.landingPagePreview(props.page.draft.id)}
                  locale={form.activeLocale}
                  target="_blank"
                  rel="noopener"
                  className={buttonVariants({ variant: "outline" })}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  {t("preview")}
                </Link>
              ))}
            {props.page !== null && isPublished && (
              // The id address resolves in every language, showing that
              // language's version or the reader's fallback.
              <Link
                href={ROUTES.landingPage(props.page.draft.id)}
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
                {page === null ? t("newPage.submit") : t("actions.save")}
              </Button>
              {props.page !== null && (
                <Button
                  type="button"
                  disabled={publishDisabled}
                  {...affirmative(!publishDisabled)}
                  aria-describedby={reasonsId}
                  onClick={() => void handlePublish(props.actions.publish)}
                >
                  {publishing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {isPublished ? t("publishChanges") : t("publish")}
                </Button>
              )}
            </div>
          </div>
        </div>
        {/* Last, so a refusal adds a line below everything. */}
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

      {props.page !== null && (
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
 * Save or Publish, filled while it can be pressed and outlined while it
 * cannot; the filled one carries a clear border so a swap moves nothing.
 */
function affirmative(enabled: boolean) {
  return enabled
    ? { variant: "default" as const, className: "border border-transparent" }
    : { variant: "outline" as const };
}

/** Where the page stands with readers: the list's chip, and the date of what they see. */
function PublishingStatus({ page }: { page: AdminLandingPage }) {
  const t = useTranslations("admin.landingPages");
  const locale = useLocale();
  const timeZone = useTimezone();

  const status = landingPageStatus({
    isPublished: page.publication !== null,
    hasUnpublishedChanges: page.hasUnpublishedChanges,
  });

  let fact: string | null = null;
  if (page.publication !== null) {
    const date = formatDate(page.publication.publishedAt, locale, {
      dateStyle: "long",
      timeZone,
    });
    fact =
      status === "changed"
        ? t("statusPanel.changedLine", { date })
        : t("statusPanel.publishedLine", { date });
  }

  return (
    <section aria-label={t("statusPanel.label")} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <LandingPageStatusChip status={status} />
      {fact && <p className="text-sm text-muted-foreground">{fact}</p>}
    </section>
  );
}

/**
 * When the working copy was last saved, by which admin and — when the save
 * came through an AI app — which app, so an edit an app made is never taken
 * for one made here.
 */
function LastSaved({ draft }: { draft: LandingPageDraft }) {
  const t = useTranslations("admin.landingPages");
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
    line = t("statusPanel.savedByViaUnnamedLine", { date, name: draft.lastSavedBy });
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
 * What holds Publish back, set against the buttons it explains: no complete
 * language at all, the languages a publish would leave out, and the live
 * languages it would take off the site.
 */
function PublishReasons({
  id,
  publishState,
  leftOut,
  takenDown,
}: {
  id: string;
  publishState: LandingPublishState;
  leftOut: readonly SupportedLocale[];
  takenDown: readonly SupportedLocale[];
}) {
  const t = useTranslations("admin.landingPages");
  const format = useFormatter();
  const languageName = useLanguageNames();
  const list = (locales: readonly SupportedLocale[]) =>
    format.list(
      locales.map((locale) => languageName(locale, LOCALE_CONFIG[locale].label)),
      { type: "conjunction" },
    );
  const wouldPublish = publishState.kind === "ready" || publishState.kind === "unsaved";

  return (
    <div id={id} className="flex min-w-0 flex-1 flex-col items-end gap-1 text-right sm:py-2.5">
      {publishState.kind === "incomplete" && (
        <StatusLine status="info">{t("readiness.noCompleteLanguage")}</StatusLine>
      )}
      {wouldPublish && takenDown.length > 0 && (
        <StatusLine status="warning">
          {t("readiness.takenDown", { languages: list(takenDown), count: takenDown.length })}
        </StatusLine>
      )}
      {wouldPublish && leftOut.length > 0 && (
        <StatusLine status="info">
          {t("readiness.leftOut", { languages: list(leftOut), count: leftOut.length })}
        </StatusLine>
      )}
    </div>
  );
}

/** A refusal in the admin's words: the database's or the link check's own sentence where it wrote one. */
function describeFailure(
  failure: unknown,
  generic: string,
  withReason: (reason: string) => string,
): string {
  const reason = landingWriteFailure(failure);
  return reason.kind === "reason" ? withReason(reason.reason) : generic;
}
