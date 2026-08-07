"use client";

import { useEffect, useRef, useState } from "react";
import type { GameAccountStatus } from "@/components/game-account";
import {
  applyDraftToEntry,
  applyPlanDraftToEntry,
  isEditableEntry,
  isPlannableEntry,
  type SessionEntryDraft,
  type SessionFeedEntry,
} from "@/components/gedu/session-feed";
import { GeduProductPageBody } from "@/components/gedu/session-details/GeduProductPageBody";
import type { GroupNotesDraft } from "@/components/gedu/session-details/GroupNotesPanel";
import {
  buildGeduProductPageFixture,
  type GeduProductScenario,
} from "@/components/gedu/session-details/mock-product-page-fixtures";
import { useNow } from "@/providers";

/**
 * The gedu's product page built around the session feed, over fixtures.
 *
 * Every editor is fully live against local state: marking each child present or
 * absent (including saving half a roster and coming back to it), typing both
 * session notes on a past *or* a future session — pre-epoch ones included,
 * which open the same record editor — writing the group's standing notes, and,
 * on an in-person product, the venue's shared ones, plus correcting a child's
 * Minecraft username from the roster. A flagged session turning into a finished
 * one, and a part-marked one staying flagged, are the two most important things
 * to feel here. Nothing persists past a reload.
 *
 * Every save resolves immediately, so the in-flight and failure states the live
 * page has are not what this scene is for; what it rehearses is the shape of
 * the page and the feel of the editors.
 *
 * The fixture is built once from the first `useNow()` value and then held in
 * state — rebuilding it on the 30-second tick would throw away whatever the
 * reviewer had just typed.
 */
export function GeduProductPageScene({
  scenario,
}: {
  scenario: GeduProductScenario;
}) {
  const liveNow = useNow();
  /**
   * One instant for the whole scene: the fixture's sessions are laid out around
   * it, the feed classifies against it, and the editor predicates answer from
   * it. Frozen at mount rather than ticking, for the same reason the live
   * workspace freezes its feed clock while an editor is open — entries built at
   * one instant and liveness read at another come apart, and the card being
   * edited is where that shows up first.
   *
   * A scene loses nothing by holding still: the camp day runs long enough that
   * whichever state was on screen at mount is the state under review.
   */
  const [now] = useState(liveNow);
  const [fixture] = useState(() => buildGeduProductPageFixture(now, scenario));
  const [data, setData] = useState(fixture.data);
  const [entries, setEntries] = useState<SessionFeedEntry[]>(fixture.entries);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [groupNotes, setGroupNotes] = useState(fixture.groupNotes);
  const [groupNotesEditing, setGroupNotesEditing] = useState(false);
  const [site, setSite] = useState(fixture.site);
  const [siteNotesEditing, setSiteNotesEditing] = useState(false);
  const [minecraftStatuses, setMinecraftStatuses] = useState<
    Record<string, GameAccountStatus>
  >({});

  // Faked latency has to be cancellable, or a reviewer who navigates away
  // mid-check leaves a timer setting state on an unmounted tree.
  const pendingChecks = useRef(new Set<number>());
  useEffect(() => {
    const timers = pendingChecks.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // Which editor produced the draft is settled by the entry's own kind, not by
  // the caller: a plan can only land on a future session and a write-up only on
  // a past one, so a mismatch leaves the entry exactly as it was rather than
  // corrupting it into a state the feed can't render.
  //
  // It does not close the editor. The feed does that itself, once the save it
  // was handed has settled — which for a scene is immediately, and for the live
  // page is a round trip later.
  const handleSave = (entryId: string, draft: SessionEntryDraft) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        // Both predicates take the clock now: since the kind flips at the
        // session's *end*, "may this take a register" is a question about the
        // start and no longer readable off the kind alone.
        if (draft.kind === "plan") {
          return isPlannableEntry(entry, now)
            ? applyPlanDraftToEntry(entry, draft)
            : entry;
        }
        return isEditableEntry(entry, now)
          ? applyDraftToEntry(entry, draft)
          : entry;
      }),
    );
  };

  const handleSaveGroupNotes = (draft: GroupNotesDraft) => {
    setGroupNotes({
      publicNote: draft.publicNote.length > 0 ? draft.publicNote : null,
      staffNote: draft.staffNote.length > 0 ? draft.staffNote : null,
    });
    setGroupNotesEditing(false);
  };

  // Site notes belong to the venue, so a save here would in reality touch every
  // product running there. In the scene it touches this page's copy and stops —
  // but the panel says out loud what the real write would do, which is the part
  // that has to be right before any of this is wired up.
  const handleSaveSiteNotes = (draft: GroupNotesDraft) => {
    setSite((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            publicNote: draft.publicNote.length > 0 ? draft.publicNote : null,
            staffNote: draft.staffNote.length > 0 ? draft.staffNote : null,
          },
    );
    setSiteNotesEditing(false);
  };

  /**
   * A gedu correcting a mistyped Minecraft name, **with the Mojang round trip
   * faked at a realistic latency**.
   *
   * The point of doing it here rather than saving instantly is that the check is
   * the whole reason the roster row was redesigned: a name goes in, a spinner
   * sits in a slot that was already holding its space, and about a second later a
   * tick or a cross lands in the same slot without anything moving. That sequence
   * is impossible to judge from a static screenshot and trivial to get wrong, so
   * the scene rehearses it.
   *
   * Validity stands in for Mojang with the format rule the real lookup applies
   * before it ever calls out — three to sixteen letters, digits or underscores.
   * Type `Steve_99` and it lands valid; type `nope!!` and it lands invalid, which
   * is the cheapest way to see the failed state without inventing a fake account
   * database.
   *
   * The write is scoped the way the real one is — only the gedu's own group —
   * and it clears `minecraft_uuid` **while the check is in flight**, because a
   * verification belongs to the name it was issued for and keeping the old one
   * would render a new, unchecked name in verified green. A check that comes
   * back valid then lands a UUID, matching what the live route does: the server
   * resolves the name against Mojang before writing, so a successful gedu edit
   * ends up *verified* rather than pending.
   */
  const handleSaveMinecraftUsername = (gamerId: string, username: string) => {
    const trimmed = username.trim();
    setData((prev) => ({
      ...prev,
      groups: prev.groups.map((group) =>
        group.id !== prev.my_group_id || group.roster === null
          ? group
          : {
              ...group,
              roster: group.roster.map((member) =>
                member.gamer_id === gamerId
                  ? {
                      ...member,
                      minecraft_username: trimmed.length > 0 ? trimmed : null,
                      minecraft_uuid: null,
                    }
                  : member,
              ),
            },
      ),
    }));

    // Cleared rather than checked: there is no name to look up, so the row goes
    // straight back to its resting state.
    if (trimmed.length === 0) {
      setMinecraftStatuses(({ [gamerId]: _cleared, ...rest }) => rest);
      return;
    }

    setMinecraftStatuses((prev) => ({ ...prev, [gamerId]: "checking" }));
    const timer = window.setTimeout(() => {
      const verified = MOJANG_NAME_SHAPE.test(trimmed);
      setMinecraftStatuses((prev) => ({
        ...prev,
        [gamerId]: verified ? "verified" : "unverified",
      }));
      if (!verified) return;
      setData((prev) => ({
        ...prev,
        groups: prev.groups.map((group) =>
          group.id !== prev.my_group_id || group.roster === null
            ? group
            : {
                ...group,
                roster: group.roster.map((member) =>
                  member.gamer_id === gamerId
                    ? { ...member, minecraft_uuid: SIMULATED_CHECK_UUID }
                    : member,
                ),
              },
        ),
      }));
    }, SIMULATED_CHECK_MS);
    pendingChecks.current.add(timer);
  };

  return (
    <GeduProductPageBody
      data={data}
      entries={entries}
      // The same frozen instant the fixture's sessions were laid out around.
      feedNow={now}
      feedRoster={fixture.feedRoster}
      sourceTimeZone={fixture.sourceTimeZone}
      materialUrl={fixture.materialUrl}
      groupPublicNote={groupNotes.publicNote}
      groupStaffNote={groupNotes.staffNote}
      groupNotesEditing={groupNotesEditing}
      onGroupNotesEditingChange={setGroupNotesEditing}
      onSaveGroupNotes={handleSaveGroupNotes}
      site={site}
      siteNotesEditing={siteNotesEditing}
      onSiteNotesEditingChange={setSiteNotesEditing}
      onSaveSiteNotes={handleSaveSiteNotes}
      editingEntryId={editingEntryId}
      onEditEntry={setEditingEntryId}
      onSaveEntry={handleSave}
      onSaveMinecraftUsername={handleSaveMinecraftUsername}
      minecraftStatuses={minecraftStatuses}
    />
  );
}

/**
 * Roughly what a Mojang lookup costs over a home connection. Long enough that
 * the spinner is genuinely seen, short enough that nobody reviewing the page
 * thinks it has hung.
 */
const SIMULATED_CHECK_MS = 800;

/**
 * The shape Mojang accepts, which is also the gate the real verify route applies
 * before it ever calls out. It stands in for the account lookup here: any
 * well-formed name is treated as a real account, and a malformed one fails —
 * which is the state worth being able to see on demand.
 */
const MOJANG_NAME_SHAPE = /^[a-zA-Z0-9_]{3,16}$/;

/**
 * The UUID a passed check lands, standing in for the one Mojang would return.
 *
 * A real generated UUIDv4 rather than a readable string: the roster row treats
 * a non-null UUID as proof the name is verified, and the fixtures elsewhere in
 * this feature all hold themselves to looking like the thing they stand in for.
 * A scene never fetches the skin it unlocks — the bundled placeholder figure is
 * what a preview draws, because a preview must not reach a third-party host.
 */
const SIMULATED_CHECK_UUID = "0f0f7f2c-1a5b-4a2a-9d0f-6a2f2b6f4b1e";
