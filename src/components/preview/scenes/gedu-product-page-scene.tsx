"use client";

import { useEffect, useRef, useState } from "react";
import type { GameAccountStatus } from "@/components/game-account";
import { platformForTopic } from "@/lib/products/topics";
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
 * **The roster's staff flair is live too, on the club scenario that carries
 * it.** The note button at the end of every row opens that member's Gedu note —
 * most of them empty, which is the add flow — and saving one lights the button,
 * while saving an empty one puts it out again. The newcomer badges are
 * read-only: their meters drain against the scene's frozen clock, which is what
 * lets four ages spread across the window be compared in one screenshot.
 *
 * **Emailing a report to the families is live too, and reaches nobody.** One
 * press walks the button through all three of its states — send, sending, sent
 * — because what the click runs is a delayed local stamp on the entry rather
 * than a send. That stands in for the refetched row the live page gets back,
 * which is the only way the transition — the flagged card turning finished as
 * the button settles into the time it went — can be looked at at all.
 *
 * **And the send answers three different ways, one per unsent card**, because
 * the fixture says per week what its send does: everything delivered, one
 * address refused, or nothing delivered at all. The three sit within a screen
 * of each other, so the sent line, the partial tally and the error line can be
 * compared against each other in one pass. The failing one succeeds when it is
 * pressed again — a failed send is the only one of the three that leaves a
 * button to press, so the retry is part of what there is to look at.
 *
 * Every save resolves immediately, so the in-flight and failure states the live
 * page has are not what this scene is for; the send is the single exception on
 * both counts, and its pause is there precisely because the in-flight frame is
 * the one a screenshot cannot show.
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
   * The Gedu notes, live against local state — the club scenario seeds two and
   * every other scenario seeds none, because only the club carries flair at all.
   *
   * Held as a record keyed by participant id, exactly as the live read will hand
   * it over: the roster rows only need "does this person have one", and the
   * dialog looks the text up when it opens.
   */
  const [gamerNotes, setGamerNotes] = useState<Record<string, string>>(
    () => fixture.memberFlair?.notes ?? {},
  );
  const [noteEditors, setNoteEditors] = useState<Record<string, string>>(
    () => fixture.memberFlair?.noteEditors ?? {},
  );

  /**
   * Which identity this scenario's roster shows, read off the fixture's own
   * topic — exactly as the live page reads it off the product's. `null` on the
   * scenario about no game account, where no row renders an editor and this
   * handler is unreachable.
   */
  const platform = platformForTopic(fixture.data.product.topic);

  // Faked latency has to be cancellable, or a reviewer who navigates away
  // mid-flight leaves a timer setting state on an unmounted tree. One set for
  // both of the scene's delayed writes — the game-name check and the send.
  const pendingTimers = useRef(new Set<number>());
  /**
   * What each past card's send does, seeded from the fixture and **mutated in
   * place**: a week whose send fails is flipped to succeeding, so pressing the
   * same card again shows the recovery rather than the same error forever.
   *
   * A ref rather than state because nothing renders from it — the outcome is
   * only ever read inside the send, one tick after a click that already
   * re-rendered the card.
   */
  const sendOutcomes = useRef(new Map(fixture.sendOutcomes));
  useEffect(() => {
    const timers = pendingTimers.current;
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

  /**
   * Email a report to the families — locally, and to nobody.
   *
   * The send itself is the one action on this page that would leave the
   * platform, so a scene must not make it. What it does instead is what the
   * live page's refetch does a round trip later: stamp the entry with the
   * instant it went, which is what puts the button into its sent state and
   * turns the amber card finished.
   *
   * **The stamp is deliberately delayed**, alone among this scene's writes. The
   * button is one control in three states — send, sending, sent — and the
   * middle one is the only part of that sequence a reviewer cannot see in a
   * screenshot: whether the spinner lands in the same slot at the same height,
   * and whether anything under the card moves as the label grows into the sent
   * time. A stamp applied on the click would skip straight past it.
   *
   * **Which of the three answers a press gets is the card's own**, read off the
   * fixture by entry id. A scene that always succeeded could only ever show the
   * happy path, and the other two are where the card actually has to do
   * something: hold a tally beside a button that has already gone quiet, or
   * hand the button back with a line under it. Keying it to the week rather
   * than to the click is what keeps the page the same page every time it is
   * opened.
   *
   * A failure is also the only outcome that leaves anything to press, so it
   * flips itself to succeeding on the way out — the second press of that card
   * is the recovery, which is the half of the failure worth reviewing.
   */
  const handleSendReport = (
    entryId: string,
  ): Promise<SessionReportSendResult> =>
    new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingTimers.current.delete(timer);
        const outcome = sendOutcomes.current.get(entryId) ?? "sent";

        if (outcome === "fails") {
          // Nothing delivered, so nothing is stamped: the card stays flagged
          // and the button comes back, which is the whole point of this one.
          sendOutcomes.current.set(entryId, "sent");
          reject(new SessionReportSendError("failed"));
          return;
        }

        setEntries((prev) =>
          prev.map((entry) =>
            entry.id === entryId && entry.kind === "past"
              ? { ...entry, reportEmailedAt: now }
              : entry,
          ),
        );
        // A partial send is still a send — the seats that got the mail must not
        // get it twice — so the entry is stamped either way and only the tally
        // differs.
        const roster = fixture.feedRoster.length;
        resolve(
          outcome === "partial"
            ? { sent: roster - 1, failed: 1, skipped: 0 }
            : { sent: roster, failed: 0, skipped: 0 },
        );
      }, SIMULATED_SEND_MS);
      pendingTimers.current.add(timer);
    });

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
   * **A fixture list of handles stands in for the platform's account database**,
   * and it has to, because there is no rule left to stand in for one. The
   * product asks the platform about every name it is given and takes the
   * platform's word; nothing on our side decides in advance which names could
   * exist. A scene that answered from a format check would be rehearsing a gate
   * the product does not have, and would call a real, live handle impossible for
   * the same reason the removed gate did.
   *
   * So the names below are known and everything else misses — which is also what
   * lets a reviewer see both outcomes on purpose rather than by typing something
   * malformed. One of them carries a space, which no format rule of ours ever
   * allowed and which both platforms have live accounts holding.
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
      const verified = SIMULATED_KNOWN_HANDLES.has(value.toLowerCase());
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
    pendingTimers.current.add(timer);
  };

  /**
   * A Gedu writing, rewriting or retiring a note about one member.
   *
   * The text arrives trimmed, and an empty one is a real action rather than a
   * no-op: it **deletes** the key, which is what puts the row back to no dot and
   * is how a Gedu drops guidance that no longer applies. The editor stamp moves
   * with it — this scene's viewer is Sanna, so a note she rewrites now says so,
   * and a cleared note takes its attribution with it rather than leaving a name
   * attached to nothing.
   *
   * Like every write in this scene bar the send, it resolves immediately: the
   * dialog's disabled-until-saved frame is the live page's to show.
   */
  const handleSaveNote = (participantId: string, text: string) => {
    setGamerNotes(({ [participantId]: _cleared, ...rest }) =>
      text.length > 0 ? { ...rest, [participantId]: text } : rest,
    );
    setNoteEditors(({ [participantId]: _dropped, ...rest }) =>
      text.length > 0 ? { ...rest, [participantId]: SCENE_VIEWER } : rest,
    );
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
      onSendReport={handleSendReport}
      onSaveGameUsername={handleSaveGameUsername}
      gameStatuses={gameStatuses}
      // Only where the scenario has flair at all — the club. Passed whole at
      // mount, badges and dots included, so nothing arrives on a row after the
      // roster has painted; the live page hands it over in the same staff-scoped
      // read as the roster itself, so it behaves the same way there.
      memberFlair={
        fixture.memberFlair === null
          ? undefined
          : {
              // The scene's one frozen instant, so the newcomer fade is measured
              // against the same clock the sessions were laid out around.
              now,
              newcomers: fixture.memberFlair.newcomers,
              notes: gamerNotes,
              noteEditors,
              onSaveNote: handleSaveNote,
            }
      }
      // Deliberately not passed. A Roblox render can only be resolved by
      // account id through our own route, and a scene must not reach a
      // third-party host on load — so every figure here is the drawn stand-in,
      // verified rows included. The live page resolves the whole roster in one
      // batched call instead.
    />
  );
}

/**
 * Who is looking at this page. The rail names Sanna and Petra as the group's
 * gedus and Sanna writes most of the fixture's sessions up, so she is the one
 * whose name a note rewritten here should carry — a scene that stamped a third
 * name would be showing a colleague nobody on this product is.
 */
const SCENE_VIEWER = "Sanna";

/**
 * Roughly what a Mojang lookup costs over a home connection. Long enough that
 * the spinner is genuinely seen, short enough that nobody reviewing the page
 * thinks it has hung.
 */
const SIMULATED_CHECK_MS = 800;

/**
 * Roughly what a fan-out of a dozen mails costs the live route, and longer than
 * the lookup above for the same reason the real one is: the send waits on a
 * provider accepting every address, not on one name being resolved. Long enough
 * to watch the spinner sit in the button's own slot and see that nothing under
 * the card moves when the label lands.
 */
const SIMULATED_SEND_MS = 1400;

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

/**
 * The handles this scene's stand-in platform knows about, lower-cased because
 * both real lookups are case-insensitive.
 *
 * **A list, not a rule.** Every handle the roster already carries is here, so
 * re-saving a child's own name lands verified rather than reading as a
 * regression; anything else misses and shows the unverified row with its
 * sentence. `Old Timer` is the one that is not on the roster and is the point of
 * the list: a name with a space in it, which our own format checks used to call
 * impossible and which both platforms have been issuing accounts under for
 * longer than they have had signup validators.
 */
const SIMULATED_KNOWN_HANDLES: ReadonlySet<string> = new Set([
  "ainobuilds",
  "vainothebold",
  "eliasredstone",
  "elias_builds",
  "hildahollow",
  "linnealoops",
  "oskarore",
  "siirisky",
  "old timer",
]);
