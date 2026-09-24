"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ArrowUpRight, Clock, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { PersonChip } from "@/components/ui/person-chip";
import type { AppHref } from "@/lib/constants/routes";
import { cn } from "@/lib/utils";
import { PRODUCT_TYPE_PRESENTATION } from "@/components/admin/dashboard/product-type-presentation";
import type { SubstitutionSession } from "./admin-substitutions-data";

/**
 * The pieces both cards on this page share — which session and how soon, who
 * is away and why, and the way to the group's own page — so the open queue and
 * the sessions with a substitute state one session in the same words.
 */

/**
 * The session: product type glyph, product, group, clock face and how soon.
 *
 * **How soon it is, is the card's own sentence.** The lists are sorted by it,
 * so the reader is scanning a run of deadlines and the deadline has to be
 * legible without arithmetic over a date and a clock face. It is said in words
 * — "tomorrow", "in 3 hours" — because a relative phrase is the one form that
 * needs no zone at all, which is precisely what the date-in-the-product's-zone
 * heading above the card and the clock face in the viewer's zone beside the
 * phrase cannot claim.
 */
export function SubstitutionSessionHeading({
  session,
  now,
}: {
  session: SubstitutionSession;
  /** The page's pinned clock — what the relative phrase is measured against. */
  now: Date;
}) {
  const tType = useTranslations("admin.products.types");
  const format = useFormatter();

  const presentation = PRODUCT_TYPE_PRESENTATION[session.productType];
  const TypeIcon = presentation.icon;

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      {/* The eyebrow is the tinted type glyph the admin surfaces speak in —
          the dashboard's attention cards, its schedule chips and its key all
          wear it, and the rail at the side of that page is what explains it. */}
      <TypeIcon
        className={cn("h-4 w-4 shrink-0 translate-y-0.5", presentation.text)}
        aria-label={tType(`${presentation.i18nKey}.label`)}
      />
      {/* Wraps rather than truncates, as it does on an attention card: a
          product's name is how an admin knows which of five Minecraft clubs
          this is. */}
      <span className="text-sm font-medium leading-snug">
        {session.productName}
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Users className="h-3 w-3 shrink-0" aria-hidden />
        {session.groupName}
      </span>
      {/* The clock face, where the schedule still projects one — in the
          schedule chips' own tabular numerals, because the admin surfaces
          state the same sessions in several places and a reader comparing them
          is comparing numbers. The date is the day heading's, above the card.
          A request the schedule no longer projects states no time; that orphan
          is the case the page exists to tolerate, and a card that guessed a
          time for it would be inventing one. */}
      {session.sessionTime !== null && (
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {session.sessionTime}
        </span>
      )}
      {session.startsAt !== null && (
        <span
          className={cn(
            "flex items-center gap-1 text-xs",
            session.urgent ? "font-medium text-warning" : "text-muted-foreground",
          )}
        >
          <Clock className="h-3 w-3 shrink-0" aria-hidden />
          {format.relativeTime(session.startsAt, now)}
        </span>
      )}
    </div>
  );
}

/**
 * Who is away: the absent gedu, the role they hold, the reason and the note.
 *
 * Carried at the density the reason beside it reads at, because it is the half
 * an admin is least entitled to dwell on: the reason is health-related data
 * about a contractor, shown because the office has to plan around it and
 * nowhere else on the platform.
 */
export function SubstitutionAwayLine({
  session,
}: {
  session: SubstitutionSession;
}) {
  const t = useTranslations("admin.substitutions");
  const tRole = useTranslations("admin.geduRole");

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="text-muted-foreground">{t("away")}</span>
      <PersonChip
        id={session.requesterId}
        name={session.requesterName ?? t("unnamed")}
        size="compact"
      />
      <span className="text-muted-foreground">
        {tRole(session.role)}
        {session.reason !== null && ` · ${t(`reason.${session.reason}`)}`}
      </span>
      {/* The note is the absent gedu's own words, capped at 500 characters by
          the writer and plain text end to end. It wraps rather than being
          clamped: an admin planning around somebody's absence is entitled to
          the whole of the sentence they wrote. */}
      {session.reasonNote !== null && (
        <span className="w-full text-muted-foreground">{session.reasonNote}</span>
      )}
    </div>
  );
}

/**
 * The way to the group's own admin page, where a seated sub is changed or
 * cleared with the whole session's staffing in view — which this page does not
 * do itself.
 */
export function OpenGroupLink({ href }: { href: AppHref }) {
  const t = useTranslations("admin.substitutions");

  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        "h-7 gap-1 px-2 text-xs",
      )}
    >
      {t("openGroup")}
      <ArrowUpRight className="h-3 w-3" aria-hidden />
    </Link>
  );
}
