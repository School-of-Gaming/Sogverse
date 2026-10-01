"use client";

import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { SCHEDULE_PART_SEPARATOR } from "@/lib/products/format-product-schedule";
import type {
  FeedbackDetail,
  FeedbackDetailStatement,
  FeedbackGamerEntry,
  PlatformComparison,
} from "./aggregate-feedback";
import { FeedbackDimensionRows } from "./feedback-dimension-rows";
import { formatShare } from "./feedback-format";
import { AnswerBreakdown, BelowAverage, Change, ShareText } from "./feedback-marks";
import { useFeedbackHref } from "./feedback-nav";
import { FeedbackHero } from "./feedback-overview-page";
import {
  defaultBackPlace,
  placeOfOrigin,
  type FeedbackHref,
  type FeedbackOrigin,
} from "./feedback-place";
import type { FeedbackRange } from "./feedback-range";
import { WhatGamersSaid } from "./feedback-responses";
import { FeedbackShell } from "./feedback-shell";
import { useFeedbackStatementLabels, useRatingWord } from "./use-feedback-labels";

/**
 * **One product, group, Gedu or gamer.** The same reading as the overview's,
 * narrowed to the one thing and set beside the platform: how positive, against
 * what, moving which way; each statement's answers in full; what sits under
 * it; and what gamers said, the responses worth reading first.
 *
 * A gamer is a child, and is read only against themselves over time: no
 * platform figure, no mark, no below-average line. A group's gamers are listed
 * by name with how often they answered, and nothing that ranks them.
 */
export function FeedbackDetailPage({
  range,
  detail,
  origin,
}: {
  range: FeedbackRange;
  detail: FeedbackDetail;
  origin: FeedbackOrigin | null;
}) {
  const t = useTranslations("admin.feedback.detail");
  const { scope } = detail;
  const kindLabel = t(`kinds.${scope.kind}`);
  const subtitle =
    scope.kind === "group" && detail.product !== null
      ? [kindLabel, detail.product.name].join(SCHEDULE_PART_SEPARATOR)
      : kindLabel;
  const outHref = adminPageOf(detail);
  const self: FeedbackOrigin = { kind: "detail", scope };

  return (
    <FeedbackShell
      range={range}
      place={{ view: "detail", scope, origin }}
      title={detail.name ?? kindLabel}
      subtitle={subtitle}
      back={origin === null ? defaultBackPlace(scope) : placeOfOrigin(origin)}
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
      {detail.responses.all.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <>
          <FeedbackHero
            headline={detail.headline}
            participation={detail.participation}
            unit={detail.bucketUnit}
            comparison={
              detail.headline.againstPlatform === null ? undefined : (
                <PlatformLine comparison={detail.headline.againstPlatform} />
              )
            }
          />
          <Statements detail={detail} />
          <Children detail={detail} origin={self} />
          <Section title={t("responsesHeading")}>
            <WhatGamersSaid responses={detail.responses} origin={self} />
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
  if (comparison.platform.positiveShare === null) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">
        {t("platform", { share: formatShare(comparison.platform.positiveShare, locale) })}
      </p>
      {comparison.belowPlatform && <BelowAverage statement={null} />}
    </div>
  );
}

function Statements({ detail }: { detail: FeedbackDetail }) {
  const t = useTranslations("admin.feedback.statements");
  const labels = useFeedbackStatementLabels(detail.source);

  return (
    <Section title={t("heading")}>
      <Card>
        <ul className="divide-y divide-border">
          {detail.statements.map((line) => (
            <StatementSpread
              key={line.key}
              line={line}
              label={labels[line.key] ?? line.key}
            />
          ))}
        </ul>
      </Card>
    </Section>
  );
}

/**
 * One statement: its wording and, first, the sentence an admin would say about
 * it — "19 of 23 said Yes or Definitely" — then the shares, the move and the
 * platform as text, and the five levels a row each.
 */
function StatementSpread({
  line,
  label,
}: {
  line: FeedbackDetailStatement;
  label: string;
}) {
  const t = useTranslations("admin.feedback.statements");
  const tDetail = useTranslations("admin.feedback.detail");
  const locale = useLocale();
  const ratingWord = useRatingWord();
  const { current } = line;
  const platform = line.againstPlatform?.platform.positiveShare ?? null;

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium">{label}</p>
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
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">
              {t("positive", { share: formatShare(current.positiveShare, locale) })}
            </span>
            <span className="tabular-nums">
              {t("low", { share: formatShare(current.lowShare, locale) })}
            </span>
            <Change points={line.changePoints} />
            {platform !== null && (
              <span className="tabular-nums">
                {tDetail("platform", { share: formatShare(platform, locale) })}
              </span>
            )}
          </p>
          <AnswerBreakdown figure={current} />
        </>
      )}
      {line.againstPlatform?.belowPlatform === true && <BelowAverage statement={null} />}
    </li>
  );
}

function Children({ detail, origin }: { detail: FeedbackDetail; origin: FeedbackOrigin }) {
  const t = useTranslations("admin.feedback.detail");
  const { children } = detail;
  // Group and Gedu rows exist only under a scope that is set against the platform.
  const platform = detail.headline.againstPlatform?.platform ?? null;
  return (
    <>
      {children.groups !== null && platform !== null && (
        <Section title={t("groupsHeading")}>
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
  const href = useFeedbackHref();
  return (
    <ul className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
      {gamers.map((gamer) => (
        <li key={gamer.id}>
          <Link
            href={href({ view: "detail", scope: { kind: "gamer", id: gamer.id }, origin })}
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

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
