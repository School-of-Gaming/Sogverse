"use client";

import { useId, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { landingPageHref } from "@/components/landing-pages/landing-page-address";
import { useLanguageNames } from "@/hooks/use-language-names";
import { getPathname, Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { LOCALE_CONFIG, resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  describeMissingWords,
  type MissingWordsDescription,
} from "@/lib/landing-pages/describe-missing";
import type { LandingSectionType } from "@/lib/landing-pages/sections";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import {
  landingPublishForecast,
  landingWriteFailure,
  type AdminLandingPage,
  type LandingPageDraft,
  type LandingPageDraftVersion,
  type LandingPublishForecast,
} from "@/services/landing-pages";
import { LandingPageStatusChip, landingPageStatus } from "./landing-page-status-chip";

/**
 * The two writes the status page makes. Each is a backend action and so the
 * caller's; each **throws** on refusal, so the page can say why, and resolves
 * only once the page has been read again, so the status already describes the
 * new state when its dialog closes.
 */
export interface LandingPageStatusActions {
  publish: () => Promise<void>;
  unpublish: () => Promise<void>;
}

/**
 * **One landing page's status**, read-only apart from publishing: landing
 * pages are written through the MCP server alone, by an AI app acting as the
 * admin, and this is where the admin sees what that has produced and decides
 * what readers see.
 *
 * Top to bottom: where the page stands with readers and who last saved it
 * (and through which AI app); the publishing row; then one card per written
 * language — complete or what it still needs, its address and whether that
 * is fixed, its preview of the saved working copy and, while it is live, its
 * live page.
 *
 * **Publish says what it would do before it does it**: the confirm lists the
 * languages going live, those left out as incomplete, the live ones taken
 * down, and the addresses a first publish of a language makes permanent —
 * the one forecast the MCP tools hand an AI app.
 */
export function LandingPageStatusPage({
  page,
  actions,
}: {
  page: AdminLandingPage;
  actions: LandingPageStatusActions;
}) {
  const t = useTranslations("admin.landingPages");
  const uiLocale = resolveLocale(useLocale());
  const version = resolveTranslation(page.draft.versions, uiLocale);
  const liveLocales = new Set(page.publication?.versions.map((v) => v.locale) ?? []);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-xl font-semibold">{version?.title ?? ""}</h2>
          <LandingPageStatusChip
            status={landingPageStatus({
              isPublished: page.publication !== null,
              hasUnpublishedChanges: page.hasUnpublishedChanges,
            })}
          />
        </div>
        <PublishedLine page={page} />
        <LastSaved draft={page.draft} />
        <p className="text-sm text-muted-foreground">{t("statusPage.authoring")}</p>
      </div>

      <Publishing page={page} actions={actions} />

      <section aria-labelledby="landing-page-languages" className="space-y-3">
        <h2 id="landing-page-languages" className="text-lg font-semibold">
          {t("statusPage.languagesHeading")}
        </h2>
        {page.draft.versions.map((v) => (
          <LanguageCard
            key={v.locale}
            pageId={page.draft.id}
            version={v}
            sections={page.draft.sections}
            publication={liveLocales.has(v.locale) ? page.publication : null}
          />
        ))}
      </section>
    </div>
  );
}

/** When readers last had a version published to them, or nothing while the page is not live. */
function PublishedLine({ page }: { page: AdminLandingPage }) {
  const t = useTranslations("admin.landingPages.statusPanel");
  const locale = useLocale();
  const timeZone = useTimezone();

  if (page.publication === null) return null;
  const date = formatDate(page.publication.publishedAt, locale, { dateStyle: "long", timeZone });
  return (
    <p className="text-sm text-muted-foreground">
      {page.hasUnpublishedChanges ? t("changedLine", { date }) : t("publishedLine", { date })}
    </p>
  );
}

/**
 * When the working copy was last saved, by which admin and — when the save
 * came through an AI app — which app.
 */
function LastSaved({ draft }: { draft: LandingPageDraft }) {
  const t = useTranslations("admin.landingPages.statusPanel");
  const locale = useLocale();
  const timeZone = useTimezone();

  const date = formatDate(draft.updatedAt, locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });

  let line: string;
  if (draft.lastSavedBy === null) {
    line = t("savedLine", { date });
  } else if (draft.lastSavedVia === null) {
    line = t("savedByLine", { date, name: draft.lastSavedBy });
  } else if (draft.lastSavedVia.name === null) {
    line = t("savedByViaUnnamedLine", { date, name: draft.lastSavedBy });
  } else {
    line = t("savedByViaLine", { date, name: draft.lastSavedBy, app: draft.lastSavedVia.name });
  }

  return <p className="text-sm text-muted-foreground">{line}</p>;
}

/**
 * The publishing row: what holds Publish back, when anything does, then
 * Unpublish (while live) and Publish — negative first in the DOM, the
 * affirmative last. Each opens a confirm that holds until its write and the
 * read after it have landed.
 */
function Publishing({
  page,
  actions,
}: {
  page: AdminLandingPage;
  actions: LandingPageStatusActions;
}) {
  const t = useTranslations("admin.landingPages");
  const [confirming, setConfirming] = useState<"publish" | "unpublish" | null>(null);

  const forecast = landingPublishForecast(page);
  const isPublished = page.publication !== null;
  const upToDate = isPublished && !page.hasUnpublishedChanges;
  const publishDisabled = !forecast.canPublish || upToDate;

  let reason: string | null = null;
  if (!forecast.canPublish) reason = t("statusPage.readiness.noCompleteLanguage");
  else if (upToDate) reason = t("statusPage.readiness.upToDate");

  const describe =
    (failed: string, failedWithReason: "publishFailedWithReason" | "unpublishFailedWithReason") =>
    (failure: unknown) => {
      const refusal = landingWriteFailure(failure);
      return refusal.kind === "reason"
        ? t(`errors.${failedWithReason}`, { reason: refusal.reason })
        : failed;
    };

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            {reason !== null && <StatusLine status="info">{reason}</StatusLine>}
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-3 sm:flex-row">
            {isPublished && (
              <Button type="button" variant="outline" onClick={() => setConfirming("unpublish")}>
                {t("unpublish")}
              </Button>
            )}
            <Button
              type="button"
              disabled={publishDisabled}
              {...affirmative(!publishDisabled)}
              onClick={() => setConfirming("publish")}
            >
              {isPublished ? t("publishChanges") : t("publish")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirming === "publish"}
        onOpenChange={(open) => setConfirming(open ? "publish" : null)}
        title={isPublished ? t("publishConfirm.changesTitle") : t("publishConfirm.title")}
        confirmLabel={isPublished ? t("publishChanges") : t("publish")}
        cancelLabel={t("actions.cancel")}
        confirmVariant="default"
        holdWhileCommitting
        onConfirm={actions.publish}
        describeError={describe(t("errors.publishFailed"), "publishFailedWithReason")}
      >
        <PublishForecast forecast={forecast} />
      </ConfirmDialog>

      <ConfirmDialog
        open={confirming === "unpublish"}
        onOpenChange={(open) => setConfirming(open ? "unpublish" : null)}
        title={t("unpublishConfirm.title")}
        description={t("unpublishConfirm.description")}
        confirmLabel={t("unpublishConfirm.confirm")}
        cancelLabel={t("actions.cancel")}
        confirmVariant="destructive"
        holdWhileCommitting
        onConfirm={actions.unpublish}
        describeError={describe(t("errors.unpublishFailed"), "unpublishFailedWithReason")}
      />
    </>
  );
}

/**
 * Publish, filled while it can be pressed and outlined while it cannot; the
 * filled one carries a clear border so a swap moves nothing.
 */
function affirmative(enabled: boolean) {
  return enabled
    ? { variant: "default" as const, className: "border border-transparent" }
    : { variant: "outline" as const };
}

/**
 * What the publish about to be confirmed would do: the languages going live,
 * those left out as incomplete, the live ones it takes down, and the
 * addresses it makes permanent. A language taken down is named once, there,
 * rather than also among those left out.
 */
function PublishForecast({ forecast }: { forecast: LandingPublishForecast }) {
  const t = useTranslations("admin.landingPages.publishConfirm");
  const format = useFormatter();
  const languageName = useLanguageNames();
  const language = (locale: SupportedLocale) => languageName(locale, LOCALE_CONFIG[locale].label);
  const list = (locales: readonly SupportedLocale[]) =>
    format.list(locales.map(language), { type: "conjunction" });

  const leftOut = forecast.wouldLeaveOut.filter(
    (locale) => !forecast.wouldTakeDown.includes(locale),
  );

  return (
    <div className="space-y-2 text-sm">
      <StatusLine status="success">
        {t("goesLive", { languages: list(forecast.wouldPutLive) })}
      </StatusLine>
      {forecast.wouldTakeDown.length > 0 && (
        <StatusLine status="warning">
          {t("takenDown", {
            languages: list(forecast.wouldTakeDown),
            count: forecast.wouldTakeDown.length,
          })}
        </StatusLine>
      )}
      {leftOut.length > 0 && (
        <StatusLine status="info">
          {t("leftOut", { languages: list(leftOut), count: leftOut.length })}
        </StatusLine>
      )}
      {forecast.slugsBecomingPermanent.length > 0 && (
        <div className="space-y-1">
          <StatusLine status="warning">
            {t("permanent", { count: forecast.slugsBecomingPermanent.length })}
          </StatusLine>
          <ul className="space-y-1 pl-6">
            {forecast.slugsBecomingPermanent.map((permanent) => {
              const values = {
                language: language(permanent.locale),
                address: slugPath(permanent.slug, permanent.locale),
              };
              return (
                <li key={permanent.locale}>
                  {permanent.derivedFromTitle
                    ? t("permanentFromTitle", values)
                    : t("permanentWritten", values)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Where a version with this slug is read once its language is live. */
function slugPath(slug: string, locale: SupportedLocale): string {
  return getPathname({ href: ROUTES.landingPage(slug), locale });
}

/**
 * One written language: complete or what it still needs, its address and
 * whether that is fixed, its preview and — while it is live — its live page.
 */
function LanguageCard({
  pageId,
  version,
  sections,
  publication,
}: {
  pageId: string;
  version: LandingPageDraftVersion;
  sections: LandingPageDraft["sections"];
  /** The live copy, when this language is in it. */
  publication: AdminLandingPage["publication"];
}) {
  const t = useTranslations("admin.landingPages");
  const languageName = useLanguageNames();
  const describeMissing = useMissingWords();
  const complete = version.missing.length === 0;
  const headingId = useId();

  return (
    <Card>
      <CardContent className="space-y-3 p-6" role="region" aria-labelledby={headingId}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={headingId} className="font-semibold">
              {languageName(version.locale, LOCALE_CONFIG[version.locale].label)}
            </h3>
            <p className="truncate text-sm text-muted-foreground">{version.title}</p>
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-3 sm:flex-row">
            {/* Opens in the version's own language. */}
            <Link
              href={ROUTES.landingPagePreview(pageId)}
              locale={version.locale}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ variant: "outline" })}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              {t("preview")}
            </Link>
            {publication !== null && (
              <Link
                href={landingPageHref(publication, version.locale)}
                locale={version.locale}
                target="_blank"
                rel="noopener"
                className={buttonVariants({ variant: "outline" })}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                {t("viewLive")}
              </Link>
            )}
          </div>
        </div>

        <div className="space-y-1">
          {complete ? (
            <StatusLine status="success">{t("statusPage.language.complete")}</StatusLine>
          ) : (
            <StatusLine status="warning">{t("statusPage.language.incomplete")}</StatusLine>
          )}
          <p className="text-sm text-muted-foreground">
            {publication !== null
              ? t("statusPage.language.live")
              : t("statusPage.language.notLive")}
          </p>
        </div>

        {!complete && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{t("statusPage.language.stillNeeded")}</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {version.missing.map((path) => (
                <li key={path}>{describeMissing(describeMissingWords(path, sections))}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-0.5 text-sm">
          <p>
            <span className="text-muted-foreground">{t("statusPage.language.address")} </span>
            {version.slug === ""
              ? t("statusPage.language.noAddress")
              : slugPath(version.slug, version.locale)}
          </p>
          {version.slug !== "" && (
            <p className="text-muted-foreground">
              {version.slugFixed
                ? t("statusPage.language.addressFixed")
                : t("statusPage.language.addressOpen")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type FieldKey =
  | "title"
  | "summary"
  | "slug"
  | "eyebrow"
  | "headline"
  | "subline"
  | "heading"
  | "body"
  | "caption"
  | "intro"
  | "buttonLabel"
  | "imageAlt"
  | "alt"
  | "question"
  | "answer";

/** The field names a missing-words path can end in, each with its label's key. */
const FIELD_KEYS: Readonly<Partial<Record<string, FieldKey>>> = {
  title: "title",
  summary: "summary",
  slug: "slug",
  eyebrow: "eyebrow",
  headline: "headline",
  subline: "subline",
  heading: "heading",
  body: "body",
  caption: "caption",
  intro: "intro",
  buttonLabel: "buttonLabel",
  imageAlt: "imageAlt",
  alt: "alt",
  question: "question",
  answer: "answer",
};

/** What one item of a section of each type is called, by its number. */
const ITEM_KEYS: {
  readonly [Type in LandingSectionType]: "image" | "points" | "steps" | "faq" | null;
} = {
  hero: null,
  text: null,
  image: "image",
  points: "points",
  steps: "steps",
  faq: "faq",
  cta: null,
};

/**
 * A missing-words description in the admin's own language, built from its
 * structured fields — section and item numbered from one, the section by its
 * type's name — never from its English sentence.
 */
function useMissingWords(): (missing: MissingWordsDescription) => string {
  const t = useTranslations("admin.landingPages");

  return (missing) => {
    const fieldKey = FIELD_KEYS[missing.field];
    const field = fieldKey === undefined ? missing.field : t(`fields.${fieldKey}`);

    if (missing.sectionNumber === undefined || missing.sectionType === undefined) {
      return missing.path.startsWith("sections.")
        ? t("statusPage.missing.goneSection", { field })
        : field;
    }

    const section = {
      number: missing.sectionNumber,
      type: t(`sectionTypes.${missing.sectionType}`),
    };
    const itemKey = ITEM_KEYS[missing.sectionType];
    if (missing.itemNumber !== undefined && itemKey !== null) {
      return t("statusPage.missing.inItem", {
        ...section,
        item: t(`items.${itemKey}`, { number: missing.itemNumber }),
        field,
      });
    }
    return t("statusPage.missing.inSection", { ...section, field });
  };
}
