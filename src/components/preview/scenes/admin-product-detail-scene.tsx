"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ROUTES } from "@/lib/constants";
import {
  applyDraftToEntry,
  applyPlanDraftToEntry,
  isEditableEntry,
  isPlannableEntry,
  SessionReportSendError,
  type SessionEntryDraft,
  type SessionFeedEntry,
  type SessionReportSendResult,
} from "@/components/gedu/session-feed";
import type { GroupNotesDraft } from "@/components/gedu/session-details/GroupNotesPanel";
import type { SiteNotesDraft } from "@/components/gedu/session-details/SiteNotesPanel";
import { AdminProductPageBody } from "@/components/admin/products/detail/admin-product-page-body";
import type { AdminProductGroupDetail } from "@/components/admin/products/detail/admin-product-detail-data";
import type { GroupsPanelActions } from "@/components/admin/products/groups/groups-panel-view";
import {
  ADMIN_PRODUCT_DETAIL_NOW,
  buildAdminProductDetailFixture,
  type AdminProductDetailScenario,
} from "@/components/admin/products/mock-product-detail-fixtures";
import type { GroupPending } from "@/services/groups";
import type { GroupParticipationDetail, ProductGroupsSnapshot } from "@/types";

/**
 * The admin's page for one product, over fixtures.
 *
 * It renders the **draft** body that is going to replace the live details page —
 * a page that today shows about half the columns a product has and nothing at
 * all of what its gedus wrote. Promotion means this body becomes the route's
 * body with reads in place of the fixture; the layout does not change in that
 * step.
 *
 * **Everything that is pure UI works.** The seating panel drags, moves,
 * promotes, demotes, renames, adds and deletes groups against local state, and
 * refuses the drops the money rules refuse. Chips open their popover. Group
 * notes, site notes and every session editor save into the same local state and
 * survive tab switches. The session send walks through all three of its states
 * and reaches nobody.
 *
 * **What is inert is what would leave the platform or need a picker's own
 * reference read**: adding a participant and adding a gedu open nothing, because
 * both pickers query every eligible user and a scene must not fetch on load.
 * Removing a participant is inert for the opposite reason — it is a hard delete,
 * and rehearsing one against local state teaches a gesture whose real
 * consequence is not reversible.
 *
 * The whole scene is pinned to one instant, frozen at mount. Not a live clock:
 * the entries are laid out around it, the feed classifies against it, and the
 * editor predicates answer from it — entries built at one instant and liveness
 * read at another come apart, and the card being edited is where it shows first.
 */
export function AdminProductDetailScene({
  scenario,
}: {
  scenario: AdminProductDetailScenario;
}) {
  const [now] = useState(ADMIN_PRODUCT_DETAIL_NOW);
  const [fixture] = useState(() =>
    buildAdminProductDetailFixture(now, scenario),
  );

  const [snapshot, setSnapshot] = useState<ProductGroupsSnapshot>(
    fixture.data.groups,
  );
  const [groupDetails, setGroupDetails] = useState<AdminProductGroupDetail[]>([
    ...fixture.data.groupDetails,
  ]);
  const [site, setSite] = useState(fixture.data.site);
  const [siteNotesEditing, setSiteNotesEditing] = useState(false);
  const [editingGroupNotesId, setEditingGroupNotesId] = useState<string | null>(
    null,
  );
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Faked latency has to be cancellable, or a reviewer who navigates away
  // mid-flight leaves a timer setting state on an unmounted tree.
  const pendingTimers = useRef(new Set<number>());
  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  /**
   * What each card's send does, seeded from the fixture and **mutated in
   * place**: a week whose send fails flips to succeeding, so pressing the same
   * card again shows the recovery rather than the same error for ever.
   */
  const sendOutcomes = useRef(new Map(fixture.sendOutcomes));

  /** Monotonic, so a deleted group's id is never handed to a new one. */
  const nextLocalGroup = useRef(0);

  /**
   * Nothing is ever in flight here, so the pending registry is one frozen empty
   * value rather than state.
   *
   * That is the honest answer for a scene: every write below is synchronous, so
   * there is no window in which a chip could be greyed. The in-flight states are
   * what the live page has and what this scene deliberately is not for.
   */
  const pending = useMemo<GroupPending>(
    () => ({
      moves: new Set<string>(),
      removes: new Set<string>(),
      renames: new Set<string>(),
      deletes: new Set<string>(),
      gedus: new Set<string>(),
      creating: false,
    }),
    [],
  );

  // ── Seating, against local state ──────────────────────────────────────────

  /** Lift one participation out of wherever it currently sits. */
  const detach = (
    current: ProductGroupsSnapshot,
    participationId: string,
  ): {
    rest: ProductGroupsSnapshot;
    taken: GroupParticipationDetail | null;
  } => {
    let taken: GroupParticipationDetail | null = null;
    const pick = (rows: GroupParticipationDetail[]) =>
      rows.filter((row) => {
        if (row.id !== participationId) return true;
        taken = row;
        return false;
      });

    return {
      rest: {
        ...current,
        groups: current.groups.map((group) => ({
          ...group,
          participations: pick(group.participations),
        })),
        unassigned: pick(current.unassigned),
        waitlist: pick(current.waitlist),
      },
      taken,
    };
  };

  const place = (participationId: string, toGroupId: string | null) =>
    setSnapshot((current) => {
      const { rest, taken } = detach(current, participationId);
      if (taken === null) return current;
      const seated: GroupParticipationDetail = { ...taken, status: "active" };
      if (toGroupId === null) {
        return { ...rest, unassigned: [...rest.unassigned, seated] };
      }
      return {
        ...rest,
        groups: rest.groups.map((group) =>
          group.id === toGroupId
            ? { ...group, participations: [...group.participations, seated] }
            : group,
        ),
      };
    });

  const groupActions: GroupsPanelActions = {
    onMove: place,
    onPromote: place,
    onDemote: (participationId) =>
      setSnapshot((current) => {
        const { rest, taken } = detach(current, participationId);
        if (taken === null) return current;
        // The back of the queue, which is where a demotion lands: waitlist order
        // is derived from when somebody joined it, and this is now.
        return {
          ...rest,
          waitlist: [...rest.waitlist, { ...taken, status: "waitlisted" }],
        };
      }),
    // Inert: a removal is a hard delete with no refund on the live page, and
    // rehearsing one against local state teaches a gesture whose real
    // consequence cannot be undone. The confirm dialog in front of it is real —
    // it is what the drag is for — and confirming simply does nothing here.
    onRemoveParticipant: () => {},
    onRenameGroup: (groupId, name) => {
      setSnapshot((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId ? { ...group, name } : group,
        ),
      }));
      // The group's own card and its session selector are named from the same
      // rename, or the page would show two names for one group.
      setGroupDetails((current) =>
        current.map((group) =>
          group.groupId === groupId ? { ...group, name } : group,
        ),
      );
    },
    onDeleteGroup: (groupId) => {
      setSnapshot((current) => {
        const doomed = current.groups.find((group) => group.id === groupId);
        return {
          ...current,
          groups: current.groups.filter((group) => group.id !== groupId),
          // Its members go back to the inbox rather than vanishing — which is
          // what the real RPC does, and the difference matters: a delete that
          // silently dropped four seats would be rehearsing a data loss.
          unassigned: [...current.unassigned, ...(doomed?.participations ?? [])],
        };
      });
      setGroupDetails((current) =>
        current.filter((group) => group.groupId !== groupId),
      );
    },
    onCreateGroup: (name) => {
      // A counter rather than the current group count: make one, delete it, make
      // another, and a count-derived id would be reused — which React would read
      // as the same card coming back.
      const id = `${LOCAL_GROUP_PREFIX}${(nextLocalGroup.current += 1)}`;
      setSnapshot((current) => ({
        ...current,
        groups: [
          ...current.groups,
          {
            id,
            name,
            created_at: now.toISOString(),
            gedus: [],
            participations: [],
          },
        ],
      }));
      // The new group appears in the session selector too, with an empty feed —
      // which is what a group made today actually has. Leaving it out of this
      // list would make the page disagree with itself about how many groups the
      // product has, one section apart.
      setGroupDetails((current) => [
        ...current,
        {
          groupId: id,
          name,
          publicNote: null,
          staffNote: null,
          contactEmails: [],
          entries: [],
          roster: [],
        },
      ]);
    },
    onRemoveGedu: (groupId, geduId) =>
      setSnapshot((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? { ...group, gedus: group.gedus.filter((g) => g.id !== geduId) }
            : group,
        ),
      })),
    // Both pickers read every eligible user in the platform, which is a fetch on
    // open — so they are inert here rather than faked. The buttons are real; the
    // sheets they would summon are the shell's, and this shell has none.
    onRequestAddGedu: () => {},
    onRequestAddParticipant: () => {},
  };

  // ── Notes and sessions, against local state ───────────────────────────────

  const handleSaveSiteNotes = (draft: SiteNotesDraft) => {
    setSite((current) =>
      current === null
        ? current
        : {
            ...current,
            publicNote: draft.publicNote.length > 0 ? draft.publicNote : null,
            staffNote: draft.staffNote.length > 0 ? draft.staffNote : null,
          },
    );
    setSiteNotesEditing(false);
  };

  const handleSaveGroupNotes = (groupId: string, draft: GroupNotesDraft) => {
    setGroupDetails((current) =>
      current.map((group) =>
        group.groupId === groupId
          ? {
              ...group,
              publicNote: draft.publicNote.length > 0 ? draft.publicNote : null,
              staffNote: draft.staffNote.length > 0 ? draft.staffNote : null,
            }
          : group,
      ),
    );
    setEditingGroupNotesId(null);
  };

  // Which editor produced the draft is settled by the entry's own kind, not by
  // the caller: a plan can only land on a future session and a write-up only on
  // a finished one, so a mismatch leaves the entry as it was rather than
  // corrupting it into a state the feed cannot render.
  const handleSaveEntry = (entryId: string, draft: SessionEntryDraft) =>
    setGroupDetails((current) =>
      current.map((group) => ({
        ...group,
        entries: group.entries.map((entry): SessionFeedEntry => {
          if (entry.id !== entryId) return entry;
          if (draft.kind === "plan") {
            return isPlannableEntry(entry, now)
              ? applyPlanDraftToEntry(entry, draft)
              : entry;
          }
          return isEditableEntry(entry, now)
            ? applyDraftToEntry(entry, draft)
            : entry;
        }),
      })),
    );

  /**
   * Email a report to the families — locally, and to nobody.
   *
   * The stamp is delayed on purpose, alone among this scene's writes: the button
   * is one control in three states and the middle one is the only part of the
   * sequence a screenshot cannot show. Which of the three answers a press gets
   * is the card's own, read off the fixture by entry id, so the page is the same
   * page every time it is opened — and a failure flips itself to succeeding on
   * the way out, because the retry is half of what a failure is worth reviewing.
   */
  const handleSendReport = (entryId: string): Promise<SessionReportSendResult> =>
    new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingTimers.current.delete(timer);
        const outcome = sendOutcomes.current.get(entryId) ?? "sent";

        if (outcome === "fails") {
          sendOutcomes.current.set(entryId, "sent");
          reject(new SessionReportSendError("failed"));
          return;
        }

        let recipients = 0;
        setGroupDetails((current) =>
          current.map((group) => {
            if (!group.entries.some((entry) => entry.id === entryId)) return group;
            recipients = group.contactEmails.length;
            return {
              ...group,
              entries: group.entries.map((entry) =>
                entry.id === entryId && entry.kind === "past"
                  ? { ...entry, reportEmailedAt: now }
                  : entry,
              ),
            };
          }),
        );
        // A partial send is still a send — the seats that got the mail must not
        // get it twice — so the entry is stamped either way and only the tally
        // differs.
        resolve(
          outcome === "partial"
            ? { sent: Math.max(0, recipients - 1), failed: 1, skipped: 0 }
            : { sent: recipients, failed: 0, skipped: 0 },
        );
      }, SIMULATED_SEND_MS);
      pendingTimers.current.add(timer);
    });

  /**
   * What a chip's popover answers with, composed from the fixture's contact map
   * and the real admin user route.
   *
   * The contact is looked up rather than read off the participation because the
   * groups snapshot carries a parent's *name* and no address — the one fact on
   * this page that a promotion has to widen an RPC for.
   */
  const chipDetails = (participation: GroupParticipationDetail) => ({
    contactEmail:
      fixture.data.contactByParticipation[participation.id] ?? null,
    adminUserHref: ROUTES.admin.user(participation.participant_id),
  });

  return (
    <AdminProductPageBody
      data={{
        ...fixture.data,
        groups: snapshot,
        groupDetails,
        site,
      }}
      pending={pending}
      // Every figure on this page is the bundled stand-in, and it takes both of
      // these to be so. A Roblox render can only be resolved by account id
      // through our own route, so handing over none is enough there; a Minecraft
      // row would go and find its own face from the username unless told not to,
      // which is a third-party request per chip on load — exactly what a preview
      // must never make.
      robloxRenders={undefined}
      deriveAvatars={false}
      chipDetails={chipDetails}
      groupActions={groupActions}
      siteNotesEditing={siteNotesEditing}
      onSiteNotesEditingChange={setSiteNotesEditing}
      onSaveSiteNotes={handleSaveSiteNotes}
      editingGroupNotesId={editingGroupNotesId}
      onEditingGroupNotesChange={setEditingGroupNotesId}
      onSaveGroupNotes={handleSaveGroupNotes}
      feedNow={now}
      editingEntryId={editingEntryId}
      onEditEntry={setEditingEntryId}
      onSaveEntry={handleSaveEntry}
      onSendReport={handleSendReport}
    />
  );
}

/**
 * The id a locally-created group gets.
 *
 * Deliberately **not** the live panel's `temp-` prefix, which means "a create is
 * in flight and this id is not real yet" and disables every action on the card.
 * Nothing is in flight here, so a group made in the scene is as usable as any
 * other — which is the whole point of being able to make one.
 */
const LOCAL_GROUP_PREFIX = "scene-group-";

/**
 * Roughly what a fan-out of a dozen mails costs the live route. Long enough to
 * watch the spinner sit in the button's own slot and see that nothing under the
 * card moves when the sent time lands.
 */
const SIMULATED_SEND_MS = 1400;
