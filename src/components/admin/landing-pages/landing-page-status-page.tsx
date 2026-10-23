"use client";

import { useId, useState } from "react";
import { Heading } from "@sog/ui";
import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { landingPageHref } from "@/components/landing-pages/landing-page-address";
import { draftShareCard } from "@/components/landing-pages/landing-share-card";
import { FramedImage } from "@/components/ui/framed-image";
import { useLanguageNames } from "@/hooks/use-language-names";
import { getPathname, Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { catalogueImageUrl } from "@/lib/images/catalogue-image-url";
import {
  formattingLocale,
  LOCALE_CONFIG,
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  describeMissingWords,
  type MissingWordsDescription,
} from "@/lib/landing-pages/describe-missing";
import type { LandingSectionType } from "@/lib/landing-pages/sections";
import { formatDate } from "@/lib/date-format";
import { useTimezone } from "@/providers";
import {
  landingWriteFailure,
  type AdminLandingPage,
  type LandingPageDraft,
  type LandingPageDraftVersion,
} from "@/services/landing-pages/landing-pages.contracts";
import {
  landingPublishForecast,
  type LandingPublishForecast,
} from "@/services/landing-pages/landing-pages.forecast";
import type {
  LandingProductPick,
  LandingProductsSectionPicks,
} from "@/services/landing-pages/landing-pages.product-picks";
import {
  landingTestimonialsSections,
  type LandingTestimonialsSection,
} from "@/services/landing-pages/landing-pages.testimonials";
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
 * (and through which AI app); the publishing row; the link preview each
 * language is shared with; when the page has testimonials sections, each one's
 * arrangement and the testimonials it places; when it has products sections,
 * which of their picked products readers are shown and why each other one is
 * not; then one card per written language — complete or what it still needs,
 * its address (and, when that differs from the live one, that the next
 * publish moves it), its preview of the saved working copy and, while it is
 * live, its live page — and after them one per live language no longer
 * written, which the next publish takes down.
 *
 * **Publish says what it would do before it does it**: the confirm lists the
 * languages going live, those left out as incomplete, the live ones taken
 * down, and the live addresses it changes, whose old links stop working —
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
  const { publication } = page;
  const liveLocales = new Set(publication?.versions.map((v) => v.locale) ?? []);
  const writtenLocales = new Set(page.draft.versions.map((v) => v.locale));
  // The card's address warning is the publish confirmation's, so the two
  // never disagree: a live language the publish would take down moves nowhere.
  const { slugsChanging } = landingPublishForecast(page);
  const testimonialSections = landingTestimonialsSections(page.draft.sections, page.testimonials);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Heading level={2} step="card-title">{version?.title ?? ""}</Heading>
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

      <ShareCard draft={page.draft} />

      {testimonialSections.length > 0 && (
        <PlacedTestimonials sections={testimonialSections} />
      )}

      {page.productPicks.length > 0 && <ProductPicks sections={page.productPicks} />}

      <section aria-labelledby="landing-page-languages" className="space-y-3">
        <Heading level={2} step="card-title" id="landing-page-languages">
          {t("statusPage.languagesHeading")}
        </Heading>
        {page.draft.versions.map((v) => (
          <LanguageCard
            key={v.locale}
            pageId={page.draft.id}
            version={v}
            sections={page.draft.sections}
            publication={liveLocales.has(v.locale) ? page.publication : null}
            movingFrom={
              // exact-locale: pairs each version with its own slug change
              slugsChanging.find((change) => change.locale === v.locale)?.from ?? null
            }
          />
        ))}
        {/* A live language its writer removed from the working copy stays
            live until the next publish, which takes it down. */}
        {publication !== null &&
          publication.versions
            .filter((live) => !writtenLocales.has(live.locale))
            .map((live) => (
              <RemovedLanguageCard
                key={live.locale}
                locale={live.locale}
                title={live.title}
                publication={publication}
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
 * those left out as incomplete, the live ones it takes down, and the live
 * addresses it changes. A language taken down is named once, there,
 * rather than also among those left out.
 */
function PublishForecast({ forecast }: { forecast: LandingPublishForecast }) {
  const t = useTranslations("admin.landingPages.publishConfirm");
  const conjunction = new Intl.ListFormat(formattingLocale(useLocale()), {
    type: "conjunction",
  });
  const languageName = useLanguageNames();
  const language = (locale: SupportedLocale) => languageName(locale, LOCALE_CONFIG[locale].label);
  const list = (locales: readonly SupportedLocale[]) =>
    conjunction.format(locales.map(language));

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
      {forecast.slugsChanging.length > 0 && (
        <div className="space-y-1">
          <StatusLine status="warning">
            {t("changing", { count: forecast.slugsChanging.length })}
          </StatusLine>
          <ul className="space-y-1 pl-6">
            {forecast.slugsChanging.map((change) => (
              <li key={change.locale}>
                {t("changingItem", {
                  language: language(change.locale),
                  from: slugPath(change.from, change.locale),
                  to: slugPath(change.to, change.locale),
                })}
              </li>
            ))}
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
 * Which link preview each saved language is shared with: its picture and its
 * title, each derived from the page or the language's own override, which an
 * admin's AI app sets. An override does not follow later edits to the page
 * title or the hero, so it is stated plainly here, where a stale one would be
 * noticed. The languages are rows of one card: facts about one page.
 */
function ShareCard({ draft }: { draft: LandingPageDraft }) {
  const t = useTranslations("admin.landingPages.statusPage.shareCard");
  const languageName = useLanguageNames();

  const cards = draft.versions.map((version) => ({
    locale: version.locale,
    card: draftShareCard(draft, version),
  }));
  const overridden = cards.some(
    ({ card }) => card.titleSource === "custom" || card.picture.source === "custom",
  );

  return (
    <section aria-labelledby="landing-page-share-card" className="space-y-3">
      <Heading level={2} step="card-title" id="landing-page-share-card">
        {t("heading")}
      </Heading>
      <Card>
        <CardContent className="space-y-4 p-6">
          <ul className="divide-y divide-border">
            {cards.map(({ locale, card }) => (
              <li
                key={locale}
                aria-label={languageName(locale, LOCALE_CONFIG[locale].label)}
                className="flex items-start gap-4 py-3 first:pt-0 last:pb-0"
              >
                {/* The site-wide card is no picture of the page's own, so it
                    paints the no-picture frame and says what stands in. */}
                <FramedImage
                  purpose="landing_image"
                  src={
                    card.picture.source === "site"
                      ? null
                      : catalogueImageUrl(card.picture.purpose, card.picture.path)
                  }
                  className="w-40 shrink-0 rounded-md"
                  sizes="160px"
                />
                <div className="min-w-0 space-y-0.5 text-sm">
                  <p className="text-muted-foreground">
                    {languageName(locale, LOCALE_CONFIG[locale].label)}
                  </p>
                  <p className="font-medium">{card.title}</p>
                  <p>{t(`picture.${card.picture.source}`)}</p>
                  <p>{t(`title.${card.titleSource}`)}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-sm">{t("description")}</p>
          {overridden && <p className="text-sm text-muted-foreground">{t("stale")}</p>}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * **Each testimonials section's arrangement and the testimonials it places**,
 * in reading order, each a short excerpt and whom it is from in the admin's
 * language, linking to its editor — where its words are changed, for every
 * page showing it at once. Read from the working copy's structure, which the
 * next publish puts live.
 */
function PlacedTestimonials({ sections }: { sections: readonly LandingTestimonialsSection[] }) {
  const t = useTranslations("admin.landingPages");
  const uiLocale = resolveLocale(useLocale());

  return (
    <section aria-labelledby="landing-page-testimonials" className="space-y-3">
      <div className="space-y-1">
        <Heading level={2} step="card-title" id="landing-page-testimonials">
          {t("statusPage.testimonials.heading")}
        </Heading>
        <p className="text-sm text-muted-foreground">{t("statusPage.testimonials.hint")}</p>
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {sections.map((section) => (
            <div key={section.sectionId} className="space-y-2 p-6 text-sm">
              <p className="font-medium">
                {t("statusPage.testimonials.section", {
                  number: section.sectionNumber,
                  type: t("sectionTypes.testimonials"),
                  arrangement: t(`statusPage.testimonials.arrangements.${section.arrangement}`),
                })}
              </p>
              <ol className="space-y-2">
                {section.testimonials.map(({ testimonialId, versions }) => {
                  const version = resolveTranslation(versions, uiLocale);
                  return (
                    <li key={testimonialId}>
                      {version === null ? (
                        <span className="text-muted-foreground">
                          {t("statusPage.testimonials.missing")}
                        </span>
                      ) : (
                        <Link
                          href={ROUTES.admin.testimonial(testimonialId)}
                          className="block rounded-md hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
                        >
                          <span className="line-clamp-2 font-serif italic">{version.quote}</span>
                          <span className="text-xs text-muted-foreground">{version.from}</span>
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * **Each products section's picks that readers are not shown, and why** — a
 * pick goes stale as terms end, and the page does not say so to a reader: it
 * simply leaves the card out, and leaves out a section with none listed. So
 * this is where the admin finds a pick to swap for next term's product, by
 * asking an AI app, as for every other change to the page.
 *
 * Read from the working copy's structure, which is what the next publish puts
 * live; the shown/not-shown answer is the listing's, the one the
 * public page draws by.
 */
function ProductPicks({ sections }: { sections: readonly LandingProductsSectionPicks[] }) {
  const t = useTranslations("admin.landingPages");

  return (
    <section aria-labelledby="landing-page-products" className="space-y-3">
      <Heading level={2} step="card-title" id="landing-page-products">
        {t("statusPage.products.heading")}
      </Heading>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {sections.map((section) => (
            <ProductPicksSection key={section.sectionId} section={section} />
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function ProductPicksSection({ section }: { section: LandingProductsSectionPicks }) {
  const t = useTranslations("admin.landingPages");
  const hidden = section.picks.filter((pick) => !pick.shown);
  const describe = usePickDescription();

  return (
    <div className="space-y-2 p-6 text-sm">
      <p className="font-medium">
        {t("statusPage.products.section", {
          number: section.sectionNumber,
          type: t("sectionTypes.products"),
        })}
      </p>
      {hidden.length === 0 ? (
        <StatusLine status="success">
          {t("statusPage.products.allShown", { count: section.picks.length })}
        </StatusLine>
      ) : (
        <>
          {section.shownCount === 0 ? (
            <StatusLine status="warning">{t("statusPage.products.noneShown")}</StatusLine>
          ) : (
            <StatusLine status="info">
              {t("statusPage.products.someHidden", {
                shown: section.shownCount,
                total: section.picks.length,
              })}
            </StatusLine>
          )}
          <ul className="list-disc space-y-0.5 pl-5">
            {hidden.map((pick) => (
              <li key={pick.productId}>{describe(pick)}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** A hidden pick as a line: its name in the admin's language, then why. */
function usePickDescription(): (pick: LandingProductPick) => string {
  const t = useTranslations("admin.landingPages.statusPage.products");
  const uiLocale = resolveLocale(useLocale());
  const conjunction = new Intl.ListFormat(formattingLocale(uiLocale), { type: "conjunction" });

  return (pick) =>
    t("hiddenItem", {
      name: resolveTranslation(pick.names, uiLocale)?.name ?? t("unnamed"),
      reasons: conjunction.format(pick.reasons.map((reason) => t(`reasons.${reason}`))),
    });
}

/**
 * One written language: complete or what it still needs, its address, its
 * preview and — while it is live — its live page. When the next publish would
 * move the language to a new address, the card warns that links to the old
 * one stop working.
 */
function LanguageCard({
  pageId,
  version,
  sections,
  publication,
  movingFrom,
}: {
  pageId: string;
  version: LandingPageDraftVersion;
  sections: LandingPageDraft["sections"];
  /** The live copy, when this language is in it. */
  publication: AdminLandingPage["publication"];
  /** The live slug the next publish moves this language from, if it does. */
  movingFrom: string | null;
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
            <Heading level={3} step="label" id={headingId}>
              {languageName(version.locale, LOCALE_CONFIG[version.locale].label)}
            </Heading>
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
          {movingFrom !== null && (
            <StatusLine status="warning">
              {t("statusPage.language.addressChanging", {
                address: slugPath(movingFrom, version.locale),
              })}
            </StatusLine>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A live language no longer written in the working copy — removed by its own
 * writer, and still live until the next publish takes it down (the publish
 * confirm names it among those taken down). Drawn as a language card, with its
 * live title and its live page, so the admin can still see what readers do.
 */
function RemovedLanguageCard({
  locale,
  title,
  publication,
}: {
  locale: SupportedLocale;
  /** Its live title. */
  title: string;
  /** The live copy, which this language is in. */
  publication: NonNullable<AdminLandingPage["publication"]>;
}) {
  const t = useTranslations("admin.landingPages");
  const languageName = useLanguageNames();
  const headingId = useId();

  return (
    <Card>
      <CardContent className="space-y-3 p-6" role="region" aria-labelledby={headingId}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Heading level={3} step="label" id={headingId}>
              {languageName(locale, LOCALE_CONFIG[locale].label)}
            </Heading>
            <p className="truncate text-sm text-muted-foreground">{title}</p>
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-3 sm:flex-row">
            <Link
              href={landingPageHref(publication, locale)}
              locale={locale}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ variant: "outline" })}
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
              {t("viewLive")}
            </Link>
          </div>
        </div>
        <StatusLine status="warning">{t("statusPage.language.removed")}</StatusLine>
      </CardContent>
    </Card>
  );
}

type FieldKey =
  | "title"
  | "summary"
  | "slug"
  | "headline"
  | "heading"
  | "body"
  | "buttonLabel"
  | "imageAlt"
  | "alt"
  | "question"
  | "answer";

/**
 * The field names a missing-words path can end in, each with its label's key:
 * the version's own fields and every field a section type requires.
 */
const FIELD_KEYS: Readonly<Partial<Record<string, FieldKey>>> = {
  title: "title",
  summary: "summary",
  slug: "slug",
  headline: "headline",
  heading: "heading",
  body: "body",
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
  testimonials: null,
  products: null,
  guide: null,
  faq: "faq",
  subscribe: null,
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
