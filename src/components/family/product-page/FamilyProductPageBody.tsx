"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  CalendarDays,
  MapPin,
  RefreshCwOff,
  type LucideIcon,
} from "lucide-react";
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
import { cn, formatDate } from "@/lib/utils";
import { computeVoiceState } from "@/lib/voice-window";
import { useNow, useTimezone } from "@/providers";
import type { SessionAudience } from "@/types";
import { FamilyProductBackLink } from "./BackLink";
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
 * - **It is participant-scoped, and the masthead says so.** "Minecraft Monday
 *   Club, for Alex" — not "Minecraft Monday Club" with a person picker on it. A
 *   parent with two children in the same club has two of these pages, because
 *   everything the page carries is per-participant: attendance today, and
 *   planned absences, per-participant notes and a line to the gedu tomorrow. A
 *   product-scoped page would have grown a selector the moment the second of
 *   those landed, and every one of those features would have had to answer
 *   "which of them?" twice. A parent holding a seat of their own gets a page
 *   like any other, and it is theirs: the attribution line reads "for you"
 *   rather than naming them at themselves.
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
 *   completeness states, no amber warnings, no editors. Those are the gedu's
 *   workflow, and a family shown warnings about paperwork they cannot do would
 *   be reading the platform's problems instead of their child's club.
 * - **The enrollment's own problems are the exception, and they are the
 *   parent's.** A failing card or a membership winding down is not platform
 *   paperwork — it is a fact about this family's place in this club, and a
 *   parent who tapped through from a badged dashboard card must not land on a
 *   page that reads as though nothing is wrong. One notice, under the masthead,
 *   destructive when something needs fixing and neutral when it is only the
 *   confirmation of something they asked for. The child's copy carries neither.
 *
 * **What is structurally absent, and stays that way:** staff notes of any scope,
 * the group roster, any other child's name or attendance, parent emails, the
 * peer groups, and the gedu material link. None of them is filtered out here —
 * none of them has a prop to arrive in. See the types module for why that is the
 * shape the privacy line takes.
 *
 * One body serves every audience. The gamer's copy is the parent's minus the
 * attendance marks, the "for Alex" attribution and the billing notices, with the
 * empty states in their own voice; the parent's own copy is the parent's copy
 * with the attribution and two of the notices moved into the second person. The
 * group name is on all of them, under the product name that is the page's
 * primary identity either way. That is a handful of small conditionals against
 * three near-identical forks, and the fork is how they drift.
 */
export interface FamilyProductPageBodyProps {
  /**
   * Whose copy of the page this is, and whose seat it is about.
   *
   * `"customer"` is a parent reading about their child, `"self"` is a parent
   * reading about a seat they hold themselves, `"gamer"` is the child's own —
   * see the component note for what differs. The first two are the same reader
   * and differ only in who the page is about; the third is a different reader
   * entirely, which is why the split is one value rather than a boolean beside
   * the audience.
   */
  audience: FamilyProductPageAudience;
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
  /**
   * Whoever holds the seat this page is about — the child on a parent's or a
   * child's copy, the reader themselves on a self seat. The id seeds the
   * identicon beside the attribution line, so it has to be the real UUID.
   */
  participant: { id: string; firstName: string };
  /**
   * The group they are in — a secondary identity line on both copies of the
   * page. A default name ("Group A") is expected and fine: it is still the
   * word a gedu will use on the phone.
   */
  groupName: string;
  /**
   * Whether the subscription behind this enrollment is failing (`past_due`).
   *
   * **The parent-side variants only** (their child's seat and their own), and
   * presentational: the page states the problem
   * and points at the dashboard's billing section rather than opening a portal
   * itself, so a card that badges a problem and the page it opens can never
   * disagree about whether there is one. A child's copy never renders it —
   * billing is not theirs to act on, and an alarm they cannot answer is worse
   * than silence.
   */
  paymentProblem?: boolean;
  /**
   * Set when the parent has cancelled this club's subscription. The
   * parent-side variants only, for the same reason as above.
   *
   * **This prop makes the state visible; it does not clamp anything, and it is
   * not meant to.** A cancelled enrollment shows nothing past its paid window
   * anywhere — the card's next session, the dashboard sort and this page's
   * future block all stop at the same instant — but that clamp belongs with
   * whoever resolves the occurrences, and this body resolves none: it renders
   * `entries` in the order it is given them. The data shell above passes the
   * same paid-through instant to the feed builder *and* to this prop, which is
   * what keeps the notice's date and the sessions beneath it describing one
   * window. Passing it to one and not the other is the failure to watch for —
   * the page would then say "last session on the 14th" over a feed listing the
   * 21st.
   */
  cancellation?: FamilyProductCancellation | null;
  /** Who teaches this group — first names only, as identicon chips. */
  gedus: readonly FamilyProductGedu[];
  /** The group's standing note for families, plain text. `null` = none. */
  groupPublicNote: string | null;
  /** The venue and its family-facing detail, or `null` for a remote product. */
  venue: FamilyProductVenue | null;
  /** Where the Join navigates when the window is open. */
  voiceHref: string;
  /**
   * Intercept the Join instead of navigating. The parent's page **about a
   * child** passes the switch-to-gamer handler (the parent is signed in as
   * themselves; the room is gated by the child's enrollment); the gamer's own
   * page and the parent's own seat pass nothing and get the plain link,
   * because in both of those the reader is already the person the room is
   * gated on. A preview scene passes a no-op, which is what makes it inert.
   */
  onJoinClick?: () => void;
  /**
   * This participant's sessions, newest first — future horizon at the head,
   * then the term running backwards. Rendered in the order given.
   */
  entries: readonly FamilySessionEntry[];
  /** The zone the schedule was authored in; the feed renders in the viewer's. */
  sourceTimeZone: string;
}

/**
 * Whose copy of the family product page this is.
 *
 * A superset of `SessionAudience` rather than a reuse of it, because the two
 * answer different questions. `SessionAudience` is *which role's route this
 * is*, which is what the back link and the empty-state voice key off and which
 * has exactly two values; this adds the one distinction the page's own copy
 * needs on top — whether the parent is reading about their child or about
 * themselves — which no route prefix can express, since both live under
 * `/parent`.
 */
export type FamilyProductPageAudience = SessionAudience | "self";

/**
 * The route-shaped half of the audience: which My SOG the reader came from.
 *
 * A parent's own seat is still a parent's page, so it goes back to `/parent`
 * and speaks in the parent's empty-state voice — the self variant changes who
 * the page is *about*, never whose it is.
 */
function routeAudience(
  audience: FamilyProductPageAudience,
): SessionAudience {
  return audience === "gamer" ? "gamer" : "customer";
}

/**
 * A subscription the parent has cancelled, as this page reads it.
 *
 * It is the participation-level half of what the dashboard's corner badge
 * carries — the badge additionally knows whether *that card* is the final
 * session, which is a per-occurrence fact and means nothing on a page about the
 * whole enrollment.
 */
export interface FamilyProductCancellation {
  /** The instant paid access ends. */
  accessUntil: Date;
  /**
   * Start of the final covered session, or `null` when the window closes with
   * nothing left on the schedule. The two cases get different sentences: naming
   * a last session is what a parent tracks, and an access date is what is left
   * to say when there is no session to name.
   */
  lastSessionStart: Date | null;
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
  participant,
  groupName,
  paymentProblem = false,
  cancellation = null,
  gedus,
  groupPublicNote,
  venue,
  voiceHref,
  onJoinClick,
  entries,
  sourceTimeZone,
}: FamilyProductPageBodyProps) {
  const t = useTranslations("familyProduct");
  const p = useTranslations("productType");
  const g = useTranslations("common");
  const locale = useLocale();
  const timeZone = useTimezone();
  const now = useNow();

  // Both parent-side audiences: the attribution line, the attendance marks and
  // the billing notices are all "is an adult reading this", which a child's
  // copy answers no to and a self seat answers yes to.
  const isParent = audience !== "gamer";
  /** The parent is the person in the seat — attribution moves to second person. */
  const isSelf = audience === "self";

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
      <FamilyProductBackLink audience={routeAudience(audience)} />

      <header className="mt-5 border-b border-border pb-5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {p(schedule.product_type)}
        </span>

        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          {productName}
        </h1>

        {/* The identity lines. The product name above is the page's primary
            identity on every copy; what differs is what a reader needs
            *beside* it. A parent is looking at one of several pages and has to
            know whose it is, so theirs leads with the person in the seat — and
            that line stays on their **own** seat too, reading "for you", for
            exactly the same reason: a parent with a club of their own and two
            children in others has three of these pages and needs to know which
            one this is. Naming them at themselves would have been the other
            way to answer that, and it reads as the page talking about a
            stranger who happens to share their name.
            A gamer is on their own page and has only ever one, so there is
            nothing to disambiguate and the line is dropped entirely.
            **Both then name the group.** It is the other identity this page
            has, it is what a gedu says on the phone ("Aino is in Builders A"),
            and a default like "Group A" is an acceptable answer — a line that
            says little is not the same as a line that misleads, and a parent
            who has never seen the name is exactly who needs to. It sits under
            the child rather than beside her: two facts on one line would have
            made an avatar, a name and a group read as one long sentence. */}
        {isParent && (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Avatar className="h-6 w-6">
              <Identicon id={participant.id} size={24} />
            </Avatar>
            <span>
              {isSelf
                ? t("forSelf")
                : t("forGamer", { name: participant.firstName })}
            </span>
          </p>
        )}
        <p
          className={cn(
            "text-sm font-medium text-muted-foreground",
            isParent ? "mt-1" : "mt-2",
          )}
        >
          {groupName}
        </p>

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

      {/* Directly under the masthead, above everything the page is otherwise
          about: a parent who tapped through from an alarmed card must not land
          on a page that acts as though nothing is wrong. One at a time and most
          actionable first — the two states are mutually exclusive in Stripe
          anyway (`past_due` and `canceling` cannot both hold), so the ordering
          is belt and braces rather than a real choice.

          Nothing here is a control. The card's corner badge owns the portal;
          this page states the fact and names where the fix lives, which keeps
          the page presentational and keeps one action in one place. */}
      {isParent && paymentProblem ? (
        <ProblemNotice tone="destructive" icon={AlertTriangle}>
          {isSelf
            ? t("paymentProblemNoticeSelf")
            : t("paymentProblemNotice", { name: participant.firstName })}
        </ProblemNotice>
      ) : isParent && cancellation !== null ? (
        <ProblemNotice tone="muted" icon={RefreshCwOff}>
          {/* The no-session sentence is shared across both parent variants and
              needs no self twin: it names nobody at all, because the only fact
              it has left is when access lapses. */}
          {cancellation.lastSessionStart === null
            ? t("cancellationNoticeNoSession", {
                date: noticeDate(cancellation.accessUntil, locale, timeZone),
              })
            : isSelf
              ? t("cancellationNoticeSelf", {
                  date: noticeDate(
                    cancellation.lastSessionStart,
                    locale,
                    timeZone,
                  ),
                })
              : t("cancellationNotice", {
                  name: participant.firstName,
                  date: noticeDate(
                    cancellation.lastSessionStart,
                    locale,
                    timeZone,
                  ),
                })}
        </ProblemNotice>
      ) : null}

      {/* Who is teaching this child, first names and faces, directly under the
          masthead. It is the page's trust signal and it belongs above the
          notes and the feed for that reason: "who has my kid for ninety
          minutes" is answered before anything else on the page is read.

          **The label is the bare plural, on both copies of the page and on the
          gedu's own.** It used to be possessive — "Your child's Gedus" for a
          parent — on a masthead three lines above that already says "for Aino",
          so the possessive was restating what the reader had just read. Naming
          the child in it would have been worse still: a possessive built around
          a name has to inflect the name in half the locales we ship, which is a
          translation trap for no gain at all. */}
      {gedus.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {g("gedus")}
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
          audience={routeAudience(audience)}
        />
      </section>
    </div>
  );
}

/** A nullable stored field that actually has something in it. */
function nonEmpty(value: string | null): string | null {
  return value !== null && value.length > 0 ? value : null;
}

/**
 * The date a notice names, in the viewer's zone.
 *
 * Both instants a notice can carry have a clock face behind them — a session
 * start, and the moment paid access lapses — so they convert like every other
 * instant on this page. The clock face itself is dropped: a parent tracks the
 * *day* their child's last session falls on, and printing 18:30 beside it
 * invites the question of whether the membership ends mid-session.
 */
function noticeDate(instant: Date, locale: string, timeZone: string): string {
  return formatDate(instant, locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  });
}

/**
 * One line about something wrong with the enrollment, under the masthead.
 *
 * **Two tones, and the difference between them is whether anybody has to do
 * anything.** A failing card is destructive: the club stops if it is not fixed,
 * and the page should say so in the colour the rest of the product uses for
 * exactly that. A cancellation is neutral and muted, because it is not a fault
 * at all — it is confirmation that something the parent themselves asked for has
 * been done, and dressing it in alarm colours would tell them they had made a
 * mistake.
 *
 * A line rather than a card: a card here would compete with the standing notes
 * card below it, which is a different kind of thing (what is always true) from
 * this (what is true right now and shouldn't be).
 */
function ProblemNotice({
  tone,
  icon: Icon,
  children,
}: {
  tone: "destructive" | "muted";
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "mt-5 flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm",
        tone === "destructive"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
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
