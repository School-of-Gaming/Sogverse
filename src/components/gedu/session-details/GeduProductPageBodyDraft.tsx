"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { PadletLink } from "@/components/ui/padlet-link";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import {
  CollapsibleRegion,
  SessionFeed,
  SessionFeedAlertBadge,
  countEntriesNeedingAttention,
  type SessionFeedEntry,
  type SessionFeedGamer,
  type SessionRecordDraft,
} from "@/components/gedu/session-feed";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { cn } from "@/lib/utils";
import { computeVoiceState } from "@/lib/voice-window";
import { useNow, useTimezone } from "@/providers";
import type { GeduAssignedProduct, GeduAssignedProductGroup } from "@/types";
import {
  CopyAllEmailsButton,
  GroupCardHeader,
  deduplicateEmails,
} from "./AssignedGroupCard";
import { SessionDetailsBackLink } from "./BackLink";
import { GamerRosterRow } from "./GamerRosterRow";
import { PeerGroupCard } from "./PeerGroupCard";

/**
 * **Draft** redesign of the gedu's product page, with the session feed as its
 * spine. Rendered today only by a full-page preview scene; at promotion it
 * becomes the body of `/gedu/clubs|camps|events/[id]` and the live shell swaps
 * fixtures for the product query. It deliberately takes everything as props —
 * no query, no clock of its own beyond the shared providers — which is what
 * lets one body serve both shells.
 *
 * What changes versus the page it replaces:
 *
 * - **The feed is the page.** Today the assigned-group card is the centre of
 *   gravity and there is no history at all; here the group's identity is a thin
 *   band and the reverse-chronological feed underneath it is the main column.
 *   Reading last week is the job, so it is what the page is made of.
 * - **The roster moves into a disclosure above the feed.** It is the one piece
 *   of the old card with nowhere obvious to go: eight rows of children, ages
 *   and parent emails would push the newest session most of a screen down, and
 *   the roster is reference data a gedu consults occasionally (emailing a
 *   parent) rather than every visit. Collapsed, it costs one line and stays
 *   exactly where it was; expanding grows downward, so nothing already on
 *   screen moves. The alternative placements were both worse: below the feed
 *   makes it unfindable behind a term of scrolling, and a side column collapses
 *   into a stack on the phones gedus actually use between sessions.
 * - **The outstanding-work count sits on the Sessions heading**, the same
 *   number the dashboard's product card shows, so the badge a gedu clicked from
 *   the dashboard is still there when they land.
 */
interface GeduProductPageBodyDraftProps {
  data: GeduAssignedProduct;
  /** Newest first: the upcoming session, then the term running backwards. */
  entries: readonly SessionFeedEntry[];
  /** Attendance roster for the feed — same children as the group roster. */
  feedRoster: readonly SessionFeedGamer[];
  /** Zone the schedule was authored in; the feed renders in the viewer's. */
  sourceTimeZone: string;
  editingEntryId: string | null;
  onEditEntry: (entryId: string | null) => void;
  onSaveEntry: (entryId: string, draft: SessionRecordDraft) => void;
}

export function GeduProductPageBodyDraft({
  data,
  entries,
  feedRoster,
  sourceTimeZone,
  editingEntryId,
  onEditEntry,
  onSaveEntry,
}: GeduProductPageBodyDraftProps) {
  const t = useTranslations("gedu.sessionDetails");
  const locale = useLocale();
  const uiLocale = resolveLocale(locale);
  const timeZone = useTimezone();
  const now = useNow();

  const productName =
    resolveTranslation(data.product.translations, uiLocale)?.name ?? "";

  const { assignedGroup, peerGroups } = useMemo(() => {
    const assigned = data.groups.find((g) => g.id === data.my_group_id) ?? null;
    const peers = data.groups.filter((g) => g.id !== data.my_group_id);
    return { assignedGroup: assigned, peerGroups: peers };
  }, [data.groups, data.my_group_id]);

  const voiceState = useMemo(
    () => computeVoiceState({ product: data.product, now, locale, timeZone }),
    [data.product, now, locale, timeZone],
  );

  const needingAttention = countEntriesNeedingAttention(entries);

  return (
    // Narrower than the page it replaces: the feed is a reading column, and a
    // term of write-ups at the old width runs to unreadable line lengths.
    <div className="container mx-auto max-w-3xl px-4 py-6 sm:py-10">
      <SessionDetailsBackLink />

      <div className="mt-6 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t(`typeLabel.${data.product.product_type}`)}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {productName}
            </h1>
          </div>
          {data.product.padlet_url && (
            <PadletLink href={data.product.padlet_url} />
          )}
        </header>

        {assignedGroup ? (
          <>
            <AssignedGroupBand
              group={assignedGroup}
              isRemote={data.product.is_remote}
              voiceIsOpen={voiceState.voiceIsOpen}
              opensDate={voiceState.opensDate}
              opensTime={voiceState.opensTime}
            />

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("sessionsHeading")}
                </h2>
                <SessionFeedAlertBadge count={needingAttention} />
              </div>
              <SessionFeed
                entries={entries}
                roster={feedRoster}
                sourceTimeZone={sourceTimeZone}
                editingEntryId={editingEntryId}
                onEditEntry={onEditEntry}
                onSaveEntry={onSaveEntry}
              />
            </section>
          </>
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              {t("noAssignedGroup")}
            </CardContent>
          </Card>
        )}

        {peerGroups.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t("otherGroupsHeading")}
            </h2>
            <div className="space-y-4">
              {peerGroups.map((g) => (
                <PeerGroupCard
                  key={g.id}
                  group={g}
                  isRemote={data.product.is_remote}
                  voiceIsOpen={voiceState.voiceIsOpen}
                  opensDate={voiceState.opensDate}
                  opensTime={voiceState.opensTime}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * Who this group is, in one band above the feed: name, gamer count, the gedus
 * teaching it, the Join button, and the roster behind a disclosure. Everything
 * the old assigned-group card carried, compressed to the height the feed can
 * afford to give it.
 */
function AssignedGroupBand({
  group,
  isRemote,
  voiceIsOpen,
  opensDate,
  opensTime,
}: {
  group: GeduAssignedProductGroup;
  isRemote: boolean;
  voiceIsOpen: boolean;
  opensDate: string;
  opensTime: string;
}) {
  const t = useTranslations("gedu.sessionDetails");
  const voiceHref = isRemote ? ROUTES.voice.groupSession(group.id) : "#";

  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-4 p-5 sm:p-6">
        <GroupCardHeader
          name={group.name || t("untitledGroup")}
          gamerCount={group.gamer_count}
          showAssignedBadge
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          {group.gedus.length > 0 && (
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {group.gedus.map((g) => (
                <span
                  key={g.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-1 text-xs"
                >
                  <Avatar className="h-5 w-5">
                    <Identicon id={g.id} size={20} />
                  </Avatar>
                  <span className="leading-none">{g.first_name}</span>
                </span>
              ))}
            </div>
          )}
          <JoinVoiceButton
            voiceIsOpen={voiceIsOpen}
            voiceHref={voiceHref}
            opensDate={opensDate}
            opensTime={opensTime}
          />
        </div>

        <RosterDisclosure roster={group.roster ?? []} />
      </CardContent>
    </Card>
  );
}

/**
 * The roster, collapsed by default.
 *
 * The toggle row never moves — the list grows beneath it — so a second click
 * lands where the first one did, and the feed below is pushed down only when
 * the gedu asked for it.
 */
function RosterDisclosure({
  roster,
}: {
  roster: readonly GeduAssignedProductRosterRow[];
}) {
  const t = useTranslations("gedu.sessionDetails");
  const [open, setOpen] = useState(false);

  const emails = useMemo(
    () => deduplicateEmails(roster.map((r) => r.parent_email)),
    [roster],
  );

  if (roster.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("emptyRoster")}</p>
    );
  }

  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-sm text-left text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          {t("rosterDisclosureLabel")}
          <span className="font-normal tabular-nums text-muted-foreground">
            {t("gamerCount", { count: roster.length })}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      <CollapsibleRegion open={open}>
        <div className="space-y-2 pt-3">
          {emails.length > 0 && <CopyAllEmailsButton emails={emails} />}
          {/* Two-column header — "Gamer" anchors the left half of each row,
              "Parent email" the right. On mobile the rows stack and the
              header is replaced by a single section label. */}
          <div className="hidden items-center justify-between px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:flex">
            <span>{t("rosterGamerHeader")}</span>
            <span>{t("rosterParentEmailHeader")}</span>
          </div>
          <ul className="space-y-1.5">
            {roster.map((g) => (
              <GamerRosterRow key={g.gamer_id} gamer={g} />
            ))}
          </ul>
        </div>
      </CollapsibleRegion>
    </div>
  );
}

type GeduAssignedProductRosterRow = NonNullable<
  GeduAssignedProductGroup["roster"]
>[number];
