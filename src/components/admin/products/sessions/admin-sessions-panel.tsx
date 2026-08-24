"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { GroupNotesPanel } from "@/components/gedu/session-details/GroupNotesPanel";
import { SiteNotesPanel } from "@/components/gedu/session-details/SiteNotesPanel";
import type { GroupNotesDraft } from "@/components/gedu/session-details/GroupNotesPanel";
import type { SiteNotesDraft } from "@/components/gedu/session-details/SiteNotesPanel";
import {
  PartialSessionSaveError,
  SessionFeed,
  SessionReportSendError,
  type SessionEntryDraft,
  type SessionFeedGamer,
  type SessionReportSendFailure,
  type SessionReportSendResult,
} from "@/components/gedu/session-feed";
import { ApiError } from "@/lib/api/api-error";
import { buildGeduSessionFeed } from "@/lib/gedu-session-feed";
import { sessionEntryId } from "@/lib/session-occurrence";
import { cn } from "@/lib/utils";
import { useNow } from "@/providers";
import {
  useAdminEmailSessionReport,
  useAdminProductSessions,
  useAdminRecordAttendance,
  useAdminSetGroupNotes,
  useAdminSetSessionNotes,
  useAdminSetSiteNotes,
  type AdminProductSessions,
  type AdminSessionGroup,
} from "@/services/admin-sessions";
import {
  SESSION_REPORT_ALREADY_SENT_SQLSTATE,
  SESSION_REPORT_NO_REPORT_SQLSTATE,
} from "@/services/gedu-sessions";
import { SiteAddressField } from "./site-address-field";

/**
 * **What actually happened** on this product, group by group: the standing
 * notes, the venue's notes, and the whole session record — reports, staff
 * notes, registers, and the send that puts a write-up in front of a family.
 *
 * **It is the gedu's own components, not an admin-styled copy of them.** The
 * feed, the two note panels, the editors and the send button are imported
 * whole; an admin sees the gedu presentation with a group selector in front of
 * it. A parallel admin renderer would be a second skin over the same rows whose
 * only job would be to look like the first one, and it would rot the way every
 * parallel renderer rots — the day somebody changes what a card says about an
 * unsent report, one of the two surfaces would go on saying the old thing.
 * (The *family* feed stays separate for a reason that is not effort: a family
 * may not see a staff note, and the split is what makes that a compile-time
 * fact rather than a promise.) Admin components are deliberately outside the
 * family-privacy import zone, so reaching into the gedu tree from here is
 * allowed and intended.
 *
 * **The group selector is a segmented control, not navigation**, and it is
 * absent on a product with one group. A gedu has one group and needs no
 * chooser; an admin has all of them and needs to pick — but they are the same
 * kind of thing viewed one at a time, which is a selector.
 *
 * **The site notes sit beside the group's, in the same row and the same card
 * the gedu workspace puts them in.** They belong to the venue rather than to
 * the group, which is exactly what that panel's own caption says by name, and
 * keeping the pair together is the whole reason the gedu layout reads as it
 * does. The other candidate home — up beside the operational facts — would have
 * meant a card appearing between two settled ones when this read landed, pushing
 * the groups panel down the page under whoever was reading it.
 *
 * **Last on the page, deliberately.** This read is a term of sessions for every
 * group at once — the slow category — so the panel paints a structured skeleton
 * the moment it mounts. Putting it under everything else means the skeleton
 * giving way to the body displaces nothing: there is nothing below it to move.
 */
export function AdminProductSessionsPanel({
  productId,
}: {
  productId: string;
}) {
  const t = useTranslations("admin.products.sessions");
  const { data, isPending, isError } = useAdminProductSessions(productId);

  return (
    <section className="space-y-4">
      {/* Hardcoded copy, so it is readable from the first frame and lands in
          its final position — nothing below it survives the load. */}
      <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>

      {isPending ? (
        <SessionsSkeleton />
      ) : isError ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("loadFailed")}
          </CardContent>
        </Card>
      ) : data.groups.length === 0 ? (
        // Answered out here rather than inside the panel, so everything below
        // can be written against a group that certainly exists: a product with
        // no groups has no notes, no register and no history to show, and
        // "which group" is not a question it can be asked.
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("noGroups")}
          </CardContent>
        </Card>
      ) : (
        <LoadedSessions productId={productId} data={data} />
      )}
    </section>
  );
}

/**
 * The panel with its document in hand: pick a group, derive that group's feed,
 * and hand every save to the RPC behind it.
 *
 * Split from the shell above so everything below can be written against data
 * that is certainly there rather than around it — the shell has already
 * answered "loaded?" and "any groups at all?", so there is no branch in here
 * about whether a group exists.
 */
function LoadedSessions({
  productId,
  data,
}: {
  productId: string;
  /** Guaranteed by the shell to carry at least one group. */
  data: AdminProductSessions;
}) {
  const liveNow = useNow();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  /**
   * The clock the feed was built against while an editor is open, or `null`
   * while none is.
   *
   * **The feed's clock stops while somebody is typing into it**, for the same
   * reason it does on the gedu workspace: entry kind is derived from `now`, so
   * a tick can reclassify a session under the editor bound to it — a `future`
   * entry becomes `past` the instant its start slips by, the notes-only editor
   * is swapped for the record editor, and the draft in it is gone with no error
   * and nothing to retry. Freezing is the smallest thing that closes it, and
   * the catch-up reflow when the editor closes is the direct result of the
   * admin's own Save or Cancel.
   */
  const [feedNow, setFeedNow] = useState<Date | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [groupNotesEditing, setGroupNotesEditing] = useState(false);
  const [siteNotesEditing, setSiteNotesEditing] = useState(false);

  // The first group until somebody picks another, and back to the first if the
  // pick disappears from under them (a group deleted in the panel above while
  // this one was open).
  const selected: AdminSessionGroup =
    data.groups.find((group) => group.id === selectedGroupId) ?? data.groups[0];
  const groupId = selected.id;

  const setSessionNotes = useAdminSetSessionNotes(productId, groupId);
  const recordAttendance = useAdminRecordAttendance(productId, groupId);
  const emailSessionReport = useAdminEmailSessionReport(productId, groupId);
  const setGroupNotes = useAdminSetGroupNotes(productId, groupId);
  const setSiteNotes = useAdminSetSiteNotes(productId);

  const now = feedNow ?? liveNow;

  const entries = useMemo(
    () =>
      buildGeduSessionFeed({
        groupId: selected.id,
        timezone: data.product.timezone,
        slots: data.product.schedule_slots.map((slot) => ({
          weekday: slot.weekday,
          startTime: slot.start_time,
          durationMinutes: slot.duration_minutes,
        })),
        startDate: data.product.start_date,
        endDate: data.product.end_date,
        sessions: selected.sessions,
        now,
      }),
    [selected, data.product, now],
  );

  const feedRoster = useMemo<SessionFeedGamer[]>(
    () =>
      selected.roster.map((member) => ({
        id: member.participant_id,
        firstName: member.first_name,
      })),
    [selected],
  );

  /**
   * Switch groups, and put every piece of per-group state back to rest.
   *
   * An editor left open across the switch would be bound to an entry id from
   * the group that is no longer on screen, and a frozen clock carried into the
   * new group would build its feed against a stale instant.
   */
  const handleSelectGroup = (nextGroupId: string) => {
    setSelectedGroupId(nextGroupId);
    setEditingEntryId(null);
    setFeedNow(null);
    setGroupNotesEditing(false);
  };

  /**
   * Open or close an entry's editor, stopping and restarting the feed's clock
   * with it.
   *
   * The freeze is taken in the same handler as the open — not in an effect
   * after it — so there is no render in between on which the tick could land.
   * Opening a *different* entry while one is open re-reads the clock rather
   * than keeping the first freeze.
   */
  const handleEditEntry = (entryId: string | null) => {
    setFeedNow(entryId === null ? null : liveNow);
    setEditingEntryId(entryId);
  };

  /**
   * Persist one session's edit.
   *
   * The two written fields go in one call, because they are one row.
   * Attendance goes one call per changed mark, because that is what stops two
   * people marking different children in the same session from overwriting
   * each other — and only the marks that actually changed are sent.
   *
   * **The order is what makes the failure reporting honest, so it is fixed.**
   * Notes first, alone: refused there, no mark has been attempted and the save
   * really did nothing. Then the marks under `allSettled` rather than `all`,
   * because `all` rejects on the first refusal while the rest are still in the
   * air and would report total failure over a session that is now partly
   * written.
   */
  const handleSaveEntry = async (entryId: string, draft: SessionEntryDraft) => {
    const entry = entries.find((candidate) => candidate.id === entryId);
    if (entry === undefined) return;
    const sessionDate = sessionDateOf(entryId, selected.id);

    const currentReport = entry.kind === "no_record" ? null : entry.report;
    const currentNote = entry.kind === "no_record" ? null : entry.staffNote;

    const notesChanged =
      draft.report !== (currentReport ?? "") ||
      draft.staffNote !== (currentNote ?? "");

    if (notesChanged) {
      await setSessionNotes.mutateAsync({
        sessionDate,
        report: draft.report,
        geduNote: draft.staffNote,
      });
    }

    if (draft.kind !== "past") return;

    // A live entry carries marks too — it is a `future` entry whose register is
    // already open — so the diff has to read them. Treating them as `{}` would
    // resend every mark and, worse, silently swallow an *unmark*.
    const current =
      entry.kind === "past" || entry.kind === "future" ? entry.attendance : {};
    const changed = feedRoster.filter(
      (gamer) => draft.attendance[gamer.id] !== current[gamer.id],
    );

    const settled = await Promise.allSettled(
      changed.map((gamer) =>
        recordAttendance.mutateAsync({
          sessionDate,
          participantId: gamer.id,
          status: draft.attendance[gamer.id] ?? null,
        }),
      ),
    );

    const firstRejection = settled.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (firstRejection === undefined) return;

    const failed = changed.filter(
      (_, index) => settled[index].status === "rejected",
    );

    // "Partial" has to mean something actually landed, or the copy is its own
    // small lie.
    const somethingLanded =
      notesChanged || settled.some((result) => result.status === "fulfilled");
    if (!somethingLanded) throw firstRejection.reason;

    throw new PartialSessionSaveError(
      failed.map((gamer) => gamer.id),
      { cause: firstRejection.reason },
    );
  };

  /**
   * Email one session's report to the group's families.
   *
   * Nothing is decided here: who gets the mail and whether the send is allowed
   * at all are the route's, because the claim it makes first is both the
   * at-most-once guard and the authorization. The one translation this makes is
   * of the refusal — the card branches on which of three things happened and
   * must not know a SQLSTATE.
   */
  const handleSendReport = async (
    entryId: string,
  ): Promise<SessionReportSendResult> => {
    try {
      return await emailSessionReport.mutateAsync({
        sessionDate: sessionDateOf(entryId, selected.id),
      });
    } catch (error) {
      throw new SessionReportSendError(sendFailureOf(error), { cause: error });
    }
  };

  const handleSaveGroupNotes = async (draft: GroupNotesDraft) => {
    await setGroupNotes.mutateAsync({
      publicNote: draft.publicNote,
      geduNote: draft.staffNote,
    });
  };

  /**
   * Persist the venue's shared notes.
   *
   * The address is **not** sent, and there is no way from here to send one. It
   * belongs to the location record and is edited there; the RPC does not accept
   * one and preserves whatever is stored.
   */
  const handleSaveSiteNotes = async (draft: SiteNotesDraft) => {
    if (data.site === null) return;
    await setSiteNotes.mutateAsync({
      locationId: data.site.location_id,
      publicNote: draft.publicNote,
      geduNote: draft.staffNote,
    });
  };

  return (
    <div className="space-y-4">
      {data.groups.length > 1 && (
        <GroupSelector
          groups={data.groups}
          selectedId={selected.id}
          onSelect={handleSelectGroup}
        />
      )}

      {/* One card holding one panel per scope, exactly as the gedu workspace
          arranges them: the site panel is a bordered column beside the group's
          rather than a card of its own, because a card inside a card announces
          a change of kind and these are two instances of the same kind. */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div
            className={cn(
              "grid gap-5",
              data.site !== null && "lg:grid-cols-2 lg:gap-8",
            )}
          >
            <GroupNotesPanel
              // Keyed by group: the panel seeds its draft once at mount, so
              // without this a switch would carry one group's unsaved text into
              // another group's editor and save it there.
              key={selected.id}
              publicNote={selected.public_note}
              staffNote={selected.gedu_note}
              editing={groupNotesEditing}
              onEditingChange={setGroupNotesEditing}
              onSave={handleSaveGroupNotes}
            />
            {data.site !== null && (
              <div className="border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <SiteNotesPanel
                  siteName={data.site.name}
                  address={data.site.address}
                  publicNote={data.site.public_note}
                  staffNote={data.site.gedu_note}
                  editing={siteNotesEditing}
                  onEditingChange={setSiteNotesEditing}
                  onSave={handleSaveSiteNotes}
                />
                {/* The address is read-only inside the panel above, on both
                    surfaces. This is the admin-only way to change it, and it is
                    a separate control because the address has a different owner
                    from the two notes — see the component's own note. Hidden
                    while the notes editor is open, so the row carries one open
                    editor at a time rather than two competing Save buttons. */}
                {!siteNotesEditing && (
                  <SiteAddressField
                    productId={productId}
                    locationId={data.site.location_id}
                    address={data.site.address}
                  />
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <SessionFeed
        // Keyed by group so switching rebuilds the feed's own scroll and reveal
        // state rather than carrying one group's revealed history into another's.
        key={selected.id}
        entries={entries}
        // The very instant `entries` were built from — frozen while an editor
        // is open. Anything fresher would step around the freeze and reclassify
        // a card under somebody typing into it.
        now={now}
        roster={feedRoster}
        sourceTimeZone={data.product.timezone}
        editingEntryId={editingEntryId}
        onEditEntry={handleEditEntry}
        onSaveEntry={handleSaveEntry}
        onSendReport={handleSendReport}
      />
    </div>
  );
}

/**
 * Which group the panel below is about.
 *
 * A segmented control rather than a tab strip: the groups are one kind of thing
 * read one at a time, and nothing about the surrounding page changes with the
 * choice. It carries `role="tablist"` all the same, because that is the pattern
 * a screen reader already knows for "these buttons choose what the region under
 * them shows".
 */
function GroupSelector({
  groups,
  selectedId,
  onSelect,
}: {
  groups: readonly AdminSessionGroup[];
  selectedId: string;
  onSelect: (groupId: string) => void;
}) {
  const t = useTranslations("admin.products.sessions");

  return (
    <div
      role="tablist"
      aria-label={t("groupSelectorAria")}
      className="inline-flex flex-wrap gap-1 rounded-full border border-border p-1"
    >
      {groups.map((group) => {
        const active = group.id === selectedId;
        return (
          <button
            key={group.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(group.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {group.name || t("untitledGroup")}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The panel while its read is in the air.
 *
 * Ghosts shaped like what is coming — a selector pill row, the notes card, then
 * a run of session cards — rather than one solid block, and rendered
 * immediately rather than after a delay: this call is known to be slow before
 * it is made, so there is nothing to wait and find out.
 *
 * Nothing here survives into the loaded state, which is what makes the swap
 * free of the layout rule: the bars do not move, they are replaced.
 */
function SessionsSkeleton() {
  const t = useTranslations("admin.products.sessions");

  return (
    <div className="space-y-4">
      {/* The bars say nothing to a screen reader, so the wait is announced in
          words instead — the same pairing the gedu workspace's skeleton uses. */}
      <p role="status" className="sr-only">
        {t("loading")}
      </p>
      <div className="space-y-4" aria-hidden>
        <div className="h-10 w-56 animate-pulse rounded-full bg-muted" />
        <div className="h-40 animate-pulse rounded-lg border border-input bg-muted" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="h-24 animate-pulse rounded-lg border border-input bg-muted"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The product-local date an entry id names.
 *
 * Read back off the id rather than re-derived from the entry's instant, because
 * the id is what the row is keyed by in Postgres: the two agree by construction
 * this way and cannot drift if a snapshot's instant ever disagrees with the
 * date it was filed under.
 */
function sessionDateOf(entryId: string, groupId: string): string {
  return entryId.slice(sessionEntryId(groupId, "").length);
}

/**
 * Which of the card's three send messages a caught failure calls for.
 *
 * Keyed on the code the route attaches to the two refusals somebody can act on,
 * never on the status or the message: the two share a `409`, and the message is
 * English written for a log.
 */
function sendFailureOf(error: unknown): SessionReportSendFailure {
  if (!(error instanceof ApiError)) return "failed";
  if (error.code === SESSION_REPORT_ALREADY_SENT_SQLSTATE) return "already_sent";
  if (error.code === SESSION_REPORT_NO_REPORT_SQLSTATE) return "no_report";
  return "failed";
}
