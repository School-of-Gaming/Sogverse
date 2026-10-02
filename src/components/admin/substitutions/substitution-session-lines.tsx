"use client";

import { useTranslations } from "next-intl";
import { ArrowUpRight, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { PersonChip } from "@/components/ui/person-chip";
import type { AppHref } from "@/lib/constants/routes";
import { cn } from "@/lib/utils";
import { PRODUCT_TYPE_PRESENTATION } from "@/components/admin/dashboard/product-type-presentation";
import { SubstitutionSessionFacts } from "@/components/session-substitution/SubstitutionSessionFacts";
import type { SubstitutionSession } from "./admin-substitutions-data";

/**
 * The pieces both cards on this page share — which session, when, how soon and
 * the rest of what it is, who is away and why, and the way to the group's own
 * page — so the open queue and the sessions with a substitute state one
 * session in the same words.
 */

/**
 * The session: what it is, then the shared session facts beneath.
 *
 * **The heading names it; the facts describe it.** The product type glyph, the
 * product and the group are how an admin tells this session from the others
 * that day, and they are this page's own wording. Everything else — the clock
 * face, how soon, online or where, the topic and the language — is the compact
 * run every substitution surface describes a session with, so the office reads
 * a session in the words the volunteer who offered on it read, and the card
 * states each fact once.
 *
 * **No date.** It is the day heading's, above the card. A request the schedule
 * no longer projects therefore states no time either; that orphan is the case
 * the page exists to tolerate, and a card that guessed a time for it would be
 * inventing one.
 *
 * **How soon it is, is the card's own sentence.** The lists are sorted by it,
 * so the reader is scanning a run of deadlines and the deadline has to be
 * legible without arithmetic over a date and a clock face. The warning tint on
 * it is the caller's to ask for, and only the open queue does: it marks a
 * session still to staff, which a session with a substitute is not.
 */
export function SubstitutionSessionHeading({
  session,
  urgent,
  now,
}: {
  session: SubstitutionSession;
  /** Whether the phrase wears the warning tint of a session still to staff. */
  urgent: boolean;
  /** The page's pinned clock — what the relative phrase is measured against. */
  now: Date;
}) {
  const tType = useTranslations("admin.products.types");

  const { facts } = session;
  const presentation = PRODUCT_TYPE_PRESENTATION[facts.productType];
  const TypeIcon = presentation.icon;

  return (
    <div className="space-y-1">
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
          {facts.productName}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3 shrink-0" aria-hidden />
          {session.groupName}
        </span>
      </div>
      <SubstitutionSessionFacts
        facts={facts}
        variant="compact"
        date={false}
        timeZone={session.viewerTimeZone}
        howSoon={{ now, urgent }}
      />
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
