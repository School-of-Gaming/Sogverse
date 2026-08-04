"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { PersonChipList } from "@/components/ui/person-chip";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import {
  formatProductSchedule,
  renderScheduleLinesForDetail,
} from "@/components/public/products/format-product-schedule";
import { ROUTES } from "@/lib/constants";
import { computeVoiceState } from "@/lib/voice-window";
import { useNow, useTimezone } from "@/providers";
import type { SessionAudience } from "@/types";
import { FamilySessionFeed } from "./FamilySessionFeed";
import type {
  FamilyProductGedu,
  FamilyProductVenue,
  FamilySessionEntry,
} from "./types";

/**
 * The **family product page**: one enrollment, one child, everything that has
 * happened in it and everything still to come. It is the family-facing
 * counterpart of the gedu's workspace and is built from the same feed
 * primitives, but it is a different kind of page and reads like one.
 *
 * The shape, and why:
 *
 * - **It is gamer-scoped, and the masthead says so.** "Minecraft Monday Club,
 *   for Alex" — not "Minecraft Monday Club" with a child picker on it. A parent
 *   with two children in the same club has two of these pages, because
 *   everything the page carries is per-child: attendance today, and planned
 *   absences, per-gamer notes and a line to the gedu tomorrow. A product-scoped
 *   page would have grown a selector the moment the second of those landed, and
 *   every one of those features would have had to answer "which child?" twice.
 * - **Single column, capped for reading, mobile-first.** Families meet this
 *   product on a phone between other things. There is deliberately **no
 *   reference rail**: the gedu's rail exists because a gedu is at a desk with
 *   material they reach for mid-session, and everything that was in it — the
 *   roster, the peer groups, the parent emails — is exactly what a family may
 *   never see. A one-column page is not a degraded two-column one here; there is
 *   nothing to put beside the feed.
 * - **The masthead answers "when and where", the notes card answers "what
 *   should I know", the feed answers "what happened".** In that order, because
 *   that is the order a parent opening this page on a Monday afternoon wants
 *   them: the join button or the address first, the standing context once, and
 *   the story underneath for as long as they care to scroll.
 * - **Remote products carry a Join; in-person ones carry an address and no Join
 *   at all** — not a locked one. A locked button is a promise that it will
 *   unlock, and a camp in a library never will. A remote product whose run has
 *   *ended* also renders no Join, for the same reason: there is no next session
 *   for it to open for.
 * - **Nothing on this page is editable and nothing on it is owed.** No
 *   completeness ladder, no amber states, no editors. Those are the gedu's
 *   workflow, and a family shown warnings about paperwork they cannot do would
 *   be reading the platform's problems instead of their child's club.
 *
 * **What is structurally absent, and stays that way:** staff notes of any scope,
 * the group roster, any other child's name or attendance, parent emails, the
 * peer groups, and the gedu material link. None of them is filtered out here —
 * none of them has a prop to arrive in. See the types module for why that is the
 * shape the privacy line takes.
 *
 * One body serves both audiences. The gamer's copy is the parent's minus the
 * attendance marks and the "for Alex" attribution (it is their own page; the
 * identity line carries their group instead), with the empty states in their own
 * voice. That is three small conditionals against two near-identical forks, and
 * the fork is how the two drift.
 */
export interface FamilyProductPageBodyProps {
  /**
   * Whose copy of the page this is. `"customer"` is the parent's, `"gamer"` is
   * the child's own — see the component note for what differs.
   */
  audience: SessionAudience;
  /** The product's name in the viewer's locale, already resolved. */
  productName: string;
  /**
   * The schedule half of the product row: what the page needs to say when the
   * sessions are and whether a room is open right now. Deliberately only the
   * schedule — the product's description, price and staff details are all
   * somewhere else, and none of them belongs on a page about one enrollment.
   */
  schedule: FamilyProductSchedule;
  /**
   * Whether the product runs in a voice room rather than a building. The
   * question is `is_remote`, never "does it have a venue": a remote
   * municipality club carries a location — the town it is run for — so a caller
   * testing for one would print an address for a club that meets online.
   */
  isRemote: boolean;
  /** The child this page is about. */
  gamer: { id: string; firstName: string };
  /** The group they are in. Shown to the gamer as their identity line. */
  groupName: string;
  /** Who teaches this group — first names only, as identicon chips. */
  gedus: readonly FamilyProductGedu[];
  /** The group's standing note for families, plain text. `null` = none. */
  groupPublicNote: string | null;
  /** The venue and its family-facing detail, or `null` for a remote product. */
  venue: FamilyProductVenue | null;
  /** Where the Join navigates when the window is open. */
  voiceHref: string;
  /**
   * Intercept the Join instead of navigating. The parent's live page passes the
   * switch-to-gamer handler (the parent is signed in as themselves; the room is
   * gated by the child's enrollment); the gamer's passes nothing and gets the
   * plain link. A preview scene passes a no-op, which is what makes it inert.
   */
  onJoinClick?: () => void;
  /**
   * This child's sessions, newest first — future horizon at the head, then the
   * term running backwards. Rendered in the order given.
   */
  entries: readonly FamilySessionEntry[];
  /** The zone the schedule was authored in; the feed renders in the viewer's. */
  sourceTimeZone: string;
}

/**
 * The schedule-bearing half of a product row. Structural rather than a nominal
 * product type, so the live page's query shape and a fixture satisfy it alike.
 */
export interface FamilyProductSchedule {
  product_type: "consumer_club" | "municipality_club" | "camp" | "event";
  /** IANA zone the slots were authored in. */
  timezone: string;
  start_date: string | null;
  end_date: string | null;
  schedule_slots: {
    weekday: number;
    start_time: string;
    duration_minutes: number;
  }[];
}

export function FamilyProductPageBody({
  audience,
  productName,
  schedule,
  isRemote,
  gamer,
  groupName,
  gedus,
  groupPublicNote,
  venue,
  voiceHref,
  onJoinClick,
  entries,
  sourceTimeZone,
}: FamilyProductPageBodyProps) {
  const t = useTranslations("familyProduct");
  const locale = useLocale();
  const timeZone = useTimezone();
  const now = useNow();

  const isParent = audience === "customer";

  const scheduleLines = useMemo(
    () =>
      renderScheduleLinesForDetail(
        formatProductSchedule({ product: schedule, locale, timeZone, now }),
      ),
    [schedule, locale, timeZone, now],
  );

  const voiceState = useMemo(
    () => computeVoiceState({ product: schedule, now, locale, timeZone }),
    [schedule, now, locale, timeZone],
  );

  // A room only exists on a remote product, and only while the product still
  // has a session to come. A finished remote club has neither a Join nor a
  // locked button: locked promises an unlock that will never happen.
  const showJoin = isRemote && voiceState.hasUpcomingSession;

  const groupNote = nonEmpty(groupPublicNote);
  const venueNote = nonEmpty(venue?.publicNote ?? null);

  return (
    // No horizontal padding of its own — the dashboard layout this body renders
    // inside already spends a gutter on every side, and a second one is most of
    // a phone screen. Capped at a reading width rather than the workspace width
    // the gedu page uses: there is one column here and nothing to fill the rest
    // of a desktop with.
    <div className="mx-auto max-w-3xl py-6 sm:py-10">
      <Link
        href={isParent ? ROUTES.customer.dashboard : ROUTES.gamer.dashboard}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t("back")}
      </Link>

      <header className="mt-5 border-b border-border pb-5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t(`typeLabel.${schedule.product_type}`)}
        </span>

        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {productName}
        </h1>

        {/* The identity line, and the one place the two audiences genuinely
            need different words. A parent is looking at one of several pages
            and has to know whose it is; a gamer is on their own page, where
            "for you" would be noise — so theirs names the group instead, which
            is the only other identity this page has. */}
        {isParent ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Avatar className="h-6 w-6">
              <Identicon id={gamer.id} size={24} />
            </Avatar>
            <span>{t("forGamer", { name: gamer.firstName })}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            {groupName}
          </p>
        )}

        {/* Icon plus a screen-reader label rather than a visible one: on a
            360px viewport a "When" label above two schedule lines costs a line
            of its own to say what the lines already say. */}
        <div className="mt-3 flex items-start gap-2 text-sm">
          <CalendarDays
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0 space-y-0.5">
            <span className="sr-only">{t("scheduleLabel")}: </span>
            {scheduleLines.map((line) => (
              <p key={line} className="tabular-nums">
                {line}
              </p>
            ))}
          </div>
        </div>

        {venue !== null && (
          <div className="mt-2 flex items-start gap-2 text-sm">
            <MapPin
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="min-w-0">
              <span className="sr-only">{t("venueLabel")}: </span>
              <p className="font-medium">{venue.name}</p>
              {venue.address !== null && (
                <p className="text-muted-foreground">{venue.address}</p>
              )}
            </div>
          </div>
        )}

        {showJoin && (
          <div className="mt-4 flex">
            <JoinVoiceButton
              voiceIsOpen={voiceState.voiceIsOpen}
              voiceHref={voiceHref}
              opensDate={voiceState.opensDate}
              opensTime={voiceState.opensTime}
              onJoinClick={onJoinClick}
              size="default"
            />
          </div>
        )}
      </header>

      {/* Who is teaching this child, first names and faces, directly under the
          masthead. It is the page's trust signal and it belongs above the
          notes and the feed for that reason: "who has my kid for ninety
          minutes" is answered before anything else on the page is read. */}
      {gedus.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t(isParent ? "gedusLabelCustomer" : "gedusLabelGamer")}
          </span>
          <PersonChipList
            people={gedus.map((g) => ({ id: g.id, name: g.firstName }))}
          />
        </div>
      )}

      {/* Standing context: what is always true here, read once, before the
          sessions. Rendered only when there is something to say — an empty
          "About this group" card on a page whose real content is underneath it
          would push the feed down a screen to hold nothing. */}
      {(groupNote !== null || venueNote !== null) && (
        <Card className="mt-5">
          <CardContent className="space-y-4 p-4 sm:p-5">
            {groupNote !== null && (
              <NoteBlock heading={t("aboutHeading")} body={groupNote} />
            )}
            {venueNote !== null && venue !== null && (
              <NoteBlock
                heading={t("venueNoteHeading", { site: venue.name })}
                body={venueNote}
              />
            )}
          </CardContent>
        </Card>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("feedHeading")}
        </h2>
        <FamilySessionFeed
          entries={entries}
          sourceTimeZone={sourceTimeZone}
          showAttendance={isParent}
          audience={audience}
        />
      </section>
    </div>
  );
}

/**
 * One standing note: a micro-heading and the paragraph under it.
 *
 * Plain text, not markdown, because that is what the field is — the standing
 * notes are stored as plain text on both scopes, and rendering them through the
 * markdown renderer would quietly promise a formatting the writer's editor
 * cannot produce. `whitespace-pre-line` keeps the paragraph breaks somebody
 * typed.
 */
/** A nullable stored field that actually has something in it. */
function nonEmpty(value: string | null): string | null {
  return value !== null && value.length > 0 ? value : null;
}

function NoteBlock({ heading, body }: { heading: string; body: string }) {
  return (
    <div>
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {heading}
      </h3>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed">
        {body}
      </p>
    </div>
  );
}
