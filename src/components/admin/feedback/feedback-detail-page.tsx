"use client";

import { useMemo, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import type { FeedbackSource } from "@/services/session-feedback/admin-feedback.contracts";
import {
  buildFeedbackDetail,
  buildFeedbackTimeline,
  type FeedbackDetail,
  type FeedbackGamerEntry,
  type FeedbackRead,
  type FeedbackScope,
  type FeedbackStatementLine,
  type PlatformComparison,
} from "./aggregate-feedback";
import { FeedbackDimensionRows } from "./feedback-dimension-rows";
import { formatShare } from "./feedback-format";
import { AnswerBreakdown, BelowAverage, ShareText } from "./feedback-marks";
import { FeedbackHero } from "./feedback-overview-page";
import {
  defaultBackPlace,
  feedbackHref,
  placeOfOrigin,
  type FeedbackHref,
  type FeedbackOrigin,
} from "./feedback-place";
import { StatementHeader, WhatGamersSaid } from "./feedback-responses";
import { FeedbackShell } from "./feedback-shell";
import { useRatingWord } from "./use-feedback-labels";

/**
 * **One product, group, Gedu or gamer.** The same reading as the overview's,
 * narrowed to the one thing and set beside the platform: how positive, and
 * against what; each statement's answers in full; what sits under it; and what
 * gamers said, the responses worth reading first.
 *
 * A gamer is a child, and is read only against themselves over time: no
 * platform figure, no mark, no below-average line. A group's gamers — or a
 * single-group product's, the product being its one group — are listed by
 * name with how often they answered, and nothing that ranks them.
 */
export function FeedbackDetailPage({
  read,
  scope,
  origin,
}: {
  read: FeedbackRead;
  scope: FeedbackScope;
  origin: FeedbackOrigin | null;
}) {
  const t = useTranslations("admin.feedback.detail");
  const { dataset, source, history } = read;
  const detail = useMemo(
    () => buildFeedbackDetail(dataset, source, scope),
    [dataset, source, scope],
  );
  const timeline = useMemo(
    () => buildFeedbackTimeline(dataset, source, history, scope),
    [dataset, source, history, scope],
  );
  const kindLabel = t(`kinds.${scope.kind}`);
  const outHref = adminPageOf(detail);
  const self: FeedbackOrigin = { kind: "detail", scope };

  return (
    <FeedbackShell
      title={detail.name ?? kindLabel}
      subtitle={kindLabel}
      back={
        origin === null
          ? defaultBackPlace(scope, detail.product?.id ?? null)
          : placeOfOrigin(origin)
      }
      aside={
        outHref !== null && (
          <Link
            href={outHref}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {t(`open.${scope.kind}`)}
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        )
      }
    >
      <FeedbackHero
        headline={detail.headline}
        participation={detail.participation}
        timeline={timeline}
        scopeLabel={detail.name ?? kindLabel}
        comparison={
          detail.againstPlatform === null ? undefined : (
            <PlatformLine comparison={detail.againstPlatform} />
          )
        }
      />
      {detail.responses.all.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <>
          <Statements detail={detail} />
          <Children detail={detail} origin={self} />
          <Section title={t("responsesHeading")}>
            <WhatGamersSaid source={detail.source} responses={detail.responses} origin={self} />
          </Section>
        </>
      )}
    </FeedbackShell>
  );
}

/** The scope's own admin page, where there is one to open. */
function adminPageOf(detail: FeedbackDetail): FeedbackHref | null {
  const { scope, product } = detail;
  switch (scope.kind) {
    case "product":
      return product === null ? null : ROUTES.admin.product(product.type, product.id);
    case "group":
      return product === null ? null : ROUTES.admin.productGroup(product.type, product.id, scope.id);
    case "gedu":
    case "gamer":
      return ROUTES.admin.user(scope.id);
  }
}

/** "Platform 89%", and the warning when the scope is below it. */
function PlatformLine({ comparison }: { comparison: PlatformComparison }) {
  const t = useTranslations("admin.feedback.detail");
  const locale = useLocale();
  return (
    <>
      {comparison.platform.positiveShare !== null && (
        <p className="text-sm text-muted-foreground">
          {t("platform", { share: formatShare(comparison.platform.positiveShare, locale) })}
        </p>
      )}
      {comparison.belowPlatform && (
        <p>
          <BelowAverage statement={null} />
        </p>
      )}
    </>
  );
}

function Statements({ detail }: { detail: FeedbackDetail }) {
  const t = useTranslations("admin.feedback.statements");

  return (
    <Section title={t("heading")}>
      {/* A card per statement, as many to a row as the width holds. */}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3">
        {detail.statements.map((line) => (
          <StatementSpread key={line.key} source={detail.source} line={line} />
        ))}
      </ul>
    </Section>
  );
}

/**
 * One statement: headed by the same short name the responses table uses, then
 * the sentence an admin would say about it — "19 of 23 said Yes or
 * Definitely" — the shares as text, and the five levels a row each.
 */
function StatementSpread({
  source,
  line,
}: {
  source: FeedbackSource;
  line: FeedbackStatementLine;
}) {
  const t = useTranslations("admin.feedback.statements");
  const locale = useLocale();
  const ratingWord = useRatingWord();
  const current = line.figure;

  return (
    <li>
      <Card className="h-full space-y-2 px-4 py-3">
        <div className="space-y-1">
          <StatementHeader source={source} statementKey={line.key} alignEnd={false} heading />
          {current.positiveShare === null ? (
            <ShareText figure={current} className="text-sm text-muted-foreground" />
          ) : (
            <p className="text-sm">
              {t("saidPositive", {
                positive: current.positive,
                answers: current.answers,
                yes: ratingWord(4),
                definitely: ratingWord(5),
              })}
            </p>
          )}
        </div>
        {current.positiveShare !== null && (
          <>
            {/* Negative before positive, as the meter reads: No on the left, Definitely on the right. */}
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {t("negative", { share: formatShare(current.negativeShare, locale) })}
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {t("positive", { share: formatShare(current.positiveShare, locale) })}
              </span>
            </p>
            <AnswerBreakdown figure={current} />
          </>
        )}
      </Card>
    </li>
  );
}

function Children({ detail, origin }: { detail: FeedbackDetail; origin: FeedbackOrigin }) {
  const t = useTranslations("admin.feedback.detail");
  const { children } = detail;
  // Group and Gedu rows exist only under a scope that is set against the platform.
  const platform = detail.againstPlatform?.platform ?? null;
  return (
    <>
      {children.groups !== null && platform !== null && (
        // A Gedu's rows are the groups they taught, named as products where a product ran one.
        <Section title={t(detail.scope.kind === "gedu" ? "productsHeading" : "groupsHeading")}>
          <Card className="overflow-hidden">
            <FeedbackDimensionRows
              source={detail.source}
              rows={children.groups}
              platform={platform}
              origin={origin}
            />
          </Card>
        </Section>
      )}
      {children.gedus !== null && platform !== null && (
        <Section title={t("gedusHeading")}>
          <Card className="overflow-hidden">
            <FeedbackDimensionRows
              source={detail.source}
              rows={children.gedus}
              platform={platform}
              origin={origin}
            />
          </Card>
        </Section>
      )}
      {children.gamers !== null && (
        <Section title={t("gamersHeading")}>
          <Card className="overflow-hidden">
            <GamerList gamers={children.gamers} origin={origin} />
          </Card>
        </Section>
      )}
    </>
  );
}

/** A group's gamers, alphabetically, with how often each answered — never a score. */
function GamerList({ gamers, origin }: { gamers: FeedbackGamerEntry[]; origin: FeedbackOrigin }) {
  const t = useTranslations("admin.feedback");
  return (
    <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
      {gamers.map((gamer) => (
        <li key={gamer.id}>
          <Link
            href={feedbackHref({ view: "detail", scope: { kind: "gamer", id: gamer.id }, origin })}
            className="flex items-baseline justify-between gap-3 px-4 py-2 transition-colors hover:bg-hover"
          >
            <span className="truncate text-sm">{gamer.name}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {t("answers", { count: gamer.responses })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
