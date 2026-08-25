"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { GroupNotesPanel } from "@/components/gedu/session-details/GroupNotesPanel";
import { createSessionEntrySaves } from "@/components/gedu/session-details/session-entry-saves";
import { SiteNotesPanel } from "@/components/gedu/session-details/SiteNotesPanel";
import type { GroupNotesDraft } from "@/components/gedu/session-details/GroupNotesPanel";
import type { SiteNotesDraft } from "@/components/gedu/session-details/SiteNotesPanel";
import {
  SessionFeed,
  type SessionFeedGamer,
} from "@/components/gedu/session-feed";
import { buildGeduSessionFeed } from "@/lib/gedu-session-feed";
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
import { useProductGroups } from "@/services/groups";
import type { ProductGroupsSnapshot } from "@/types";
import { GroupMembersCard } from "./group-members-card";
import { SiteAddressField } from "./site-address-field";

/**
 * **What actually happened** on this product, group by group: the standing
 * notes, the venue's notes, and the whole session record — reports, staff
 * notes, registers, and the send that puts a write-up in front of a family.
 *
 * **It is the gedu's own components, not an admin-styled copy of them.** The
 * feed, the two note panels, the editors and the send button are imported
 * whole — and so is what their Save and Send buttons *do*; an admin sees the
 * gedu presentation with a group selector in front of it. A parallel admin
 * renderer would be a second skin over the same rows whose only job would be to
 * look like the first one, and it would rot the way every parallel renderer
 * rots — the day somebody changes what a card says about an unsent report, one
 * of the two surfaces would go on saying the old thing.
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
 * **The group members card sits between the notes and the feed**, and it is the
 * admin's home for a per-member Gedu note. The panel is already group-scoped and
 * a note is keyed to `(group, member)`, so the scope the note needs is the scope
 * the selector already establishes — see the card's own note for why it is not
 * on the groups panel and not attached to the register.
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
  /**
   * The group members card's source — the same admin snapshot the groups panel
   * higher up this page already reads, under the same query key, so this is a
   * cache hit rather than a second round trip.
   *
   * **Folded into the pending gate below rather than rendered when it lands.**
   * The card sits above the session feed, and a card arriving late would push
   * the whole term of sessions down the page under whoever is reading it. This
   * read is the fast one of the pair; waiting for it costs nothing and makes the
   * body land whole. A failed one leaves `data` undefined, which the panel shows
   * as no card at all — settled before first paint either way.
   */
  const groups = useProductGroups(productId);

  return (
    <section className="space-y-4">
      {/* Hardcoded copy, so it is readable from the first frame and lands in
          its final position — nothing below it survives the load. */}
      <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>

      {isPending || groups.isPending ? (
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
        <LoadedSessions
          productId={productId}
          data={data}
          groupsSnapshot={groups.data}
        />
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
  groupsSnapshot,
}: {
  productId: string;
  /** Guaranteed by the shell to carry at least one group. */
  data: AdminProductSessions;
  /**
   * The admin groups snapshot, which is what carries each member's note — the
   * session document's own roster is deliberately just an id and a first name,
   * enough to key an attendance mark by. `undefined` only when that read failed,
   * and the shell has already settled it, so the members card is present or
   * absent from the first paint rather than appearing partway through.
   */
  groupsSnapshot: ProductGroupsSnapshot | undefined;
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

  /**
   * The selected group's seats as the groups snapshot describes them — the copy
   * that carries each member's note. `null` where that read failed, which is the
   * one case the members card is absent.
   *
   * Matched by group id rather than by position: the two documents are ordered
   * by the same key today, and a card handed another group's roster because one
   * of them was sorted differently tomorrow is exactly the kind of silent wrong
   * answer an index lookup produces.
   */
  const selectedGroupMembers =
    groupsSnapshot?.groups.find((group) => group.id === groupId)
      ?.participations ?? null;

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
   * Save and Send for one session card, bound to the selected group's entries
   * and this surface's product-keyed mutations.
   *
   * **The same implementation the gedu workspace runs**, imported rather than
   * reproduced: the attendance diff, the notes-before-marks ordering and the
   * partial-failure classification are rules about the record, not about who is
   * looking at it, and a second copy here would be free to drift from the one a
   * gedu saving the very same sheet gets.
   */
  const { saveEntry, sendReport } = createSessionEntrySaves({
    groupId,
    entries,
    roster: feedRoster,
    setSessionNotes,
    recordAttendance,
    emailSessionReport,
  });

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
                    locationId={data.site.location_id}
                    address={data.site.address}
                  />
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* The group's members, with the note button on every row. Keyed by group
          for the same reason the notes panel above is: the card owns which
          member's note is open, and a switch must not carry that across. */}
      {selectedGroupMembers !== null && (
        <GroupMembersCard
          // Prefixed: SessionFeed below is keyed by the same group id, and two
          // siblings must not share a key.
          key={`members-${selected.id}`}
          groupId={selected.id}
          members={selectedGroupMembers}
        />
      )}

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
        onSaveEntry={saveEntry}
        onSendReport={sendReport}
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
        {/* The members card, between the notes and the feed. */}
        <div className="h-32 animate-pulse rounded-lg border border-input bg-muted" />
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
