"use client";

import { useEffect, useRef, useState } from "react";
import {
  GAME_PLATFORMS,
  type GameAccountStatus,
} from "@/components/game-account";
import { platformForTopic } from "@/lib/products/topics";
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
import type { GeduAssignedProductRosterEntry } from "@/types";

/**
 * The gedu's product page built around the session feed, over fixtures.
 *
 * Every editor is fully live against local state: marking each child present or
 * absent (including saving half a roster and coming back to it), typing both
 * session notes on a past *or* a future session — pre-epoch ones included,
 * which open the same record editor — writing the group's standing notes, and,
 * on an in-person product, the venue's shared ones, plus correcting a child's
 * game username from the roster — on whichever platform the scenario's topic
 * names, or not at all on the one topic that names none. A flagged session
 * turning into a finished one, and a part-marked one staying flagged, are the
 * two most important things to feel here. Nothing persists past a reload.
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
  const [gameStatuses, setGameStatuses] = useState<
    Record<string, GameAccountStatus>
  >({});

  /**
   * Which identity this scenario's roster shows, read off the fixture's own
   * topic — exactly as the live page reads it off the product's. `null` on the
   * scenario about no game account, where no row renders an editor and this
   * handler is unreachable.
   */
  const platform = platformForTopic(fixture.data.product.topic);

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
   * Rewrite one roster member of the gedu's own group, in place.
   *
   * Two of the three writes below are the same traversal — the group, then the
   * member, then the fields — and the third would have been a third copy of it.
   * Scoped to `my_group_id` the way the real RPC is: a peer group's roster is
   * never even loaded on this page, let alone editable.
   */
  const patchMember = (
    gamerId: string,
    patch: Partial<GeduAssignedProductRosterEntry>,
  ) =>
    setData((prev) => ({
      ...prev,
      groups: prev.groups.map((group) =>
        group.id !== prev.my_group_id || group.roster === null
          ? group
          : {
              ...group,
              roster: group.roster.map((member) =>
                member.participant_id === gamerId
                  ? { ...member, ...patch }
                  : member,
              ),
            },
      ),
    }));

  /**
   * A gedu correcting a mistyped game name, **with the platform's round trip
   * faked at a realistic latency**.
   *
   * The point of doing it here rather than saving instantly is that the check is
   * the whole reason the roster row was redesigned: a name goes in, a spinner
   * sits in a slot that was already holding its space, and about a second later a
   * tick or a cross lands in the same slot without anything moving. That sequence
   * is impossible to judge from a static screenshot and trivial to get wrong, so
   * the scene rehearses it — on either platform, since the interaction is the one
   * thing the two share exactly.
   *
   * Validity stands in for the account lookup with the platform's **own** format
   * rule, read off the shared descriptor, which is also the gate the real route
   * applies before it ever calls out. On Minecraft `Steve_99` lands valid; on
   * Roblox `Builder_Man` does and `_builder` does not. It is the cheapest way to
   * see the failed state without inventing a fake account database, and taking
   * the rule from the descriptor rather than restating it here is what stops the
   * scene from rehearsing a gate the product no longer has.
   *
   * The write is scoped the way the real one is — only the gedu's own group —
   * and it clears the account key **while the check is in flight**, because a
   * verification belongs to the name it was issued for and keeping the old one
   * would render a new, unchecked name in verified green. A check that comes back
   * valid then lands a key of that platform's own shape, matching what the live
   * route does: the server resolves the name before writing, so a successful gedu
   * edit ends up *verified* rather than pending.
   */
  const handleSaveGameUsername = (gamerId: string, username: string) => {
    // Unreachable on the no-platform scenario, whose rows render no editor at
    // all — the guard is what proves that to the compiler.
    if (platform === null) return;
    const trimmed = username.trim();
    const value = trimmed.length > 0 ? trimmed : null;

    patchMember(
      gamerId,
      platform === "minecraft"
        ? { minecraft_username: value, minecraft_uuid: null }
        : { roblox_username: value, roblox_user_id: null },
    );

    // Cleared rather than checked: there is no name to look up, so the row goes
    // straight back to its resting state.
    if (value === null) {
      setGameStatuses(({ [gamerId]: _cleared, ...rest }) => rest);
      return;
    }

    setGameStatuses((prev) => ({ ...prev, [gamerId]: "checking" }));
    const timer = window.setTimeout(() => {
      const verified = GAME_PLATFORMS[platform].isValidUsername(value);
      setGameStatuses((prev) => ({
        ...prev,
        [gamerId]: verified ? "verified" : "unverified",
      }));
      if (!verified) return;
      patchMember(
        gamerId,
        platform === "minecraft"
          ? { minecraft_uuid: SIMULATED_CHECK_UUID }
          : { roblox_user_id: SIMULATED_CHECK_ROBLOX_ID },
      );
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
      onSaveGameUsername={handleSaveGameUsername}
      gameStatuses={gameStatuses}
      // Deliberately not passed. A Roblox render can only be resolved by
      // account id through our own route, and a scene must not reach a
      // third-party host on load — so every figure here is the drawn stand-in,
      // verified rows included. The live page resolves the whole roster in one
      // batched call instead.
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
 * The account key a passed check lands, one per platform, standing in for what
 * the real lookup would return.
 *
 * Each looks like the thing it stands in for — a real generated UUIDv4 where
 * Mojang hands out UUIDs, a positive integer in Roblox's own range where Roblox
 * hands out int64s — rather than a readable string. The roster row treats a
 * non-null key as proof the name is verified, and the fixtures elsewhere in this
 * feature all hold themselves to the same bar. **A scene never fetches the
 * figure it unlocks**: the bundled stand-in is what a preview draws, because a
 * preview must not reach a third-party host on load.
 */
const SIMULATED_CHECK_UUID = "0f0f7f2c-1a5b-4a2a-9d0f-6a2f2b6f4b1e";
const SIMULATED_CHECK_ROBLOX_ID = 2748301956;
