"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { LockExplanation, Locked } from "@/components/ui/locked-control";
import {
  resolveInGroupSince,
  type SessionFeedGamer,
} from "@/components/gedu/session-feed";
import { showsNewcomerBadge } from "@/components/member-flair";
import { GroupWorkspace } from "@/components/group-workspace/GroupWorkspace";
import { buildGeduSessionFeed } from "@/lib/gedu-session-feed";
import { platformForTopic } from "@/lib/products/topics";
import { WITHHELD } from "@/lib/withheld";
import { useNow } from "@/providers";
import {
  useTraineeAssignedProduct,
  type TraineeAssignedProduct,
} from "@/services/assignments";
import {
  useTraineeGroupFeed,
  type TraineeGroupFeed,
} from "@/services/gedu-sessions";
import { useRobloxRenders } from "@/services/roblox";
import { GeduProductPageSkeleton } from "./GeduProductPageSkeleton";
import { NotAssignedState } from "./NotAssignedState";
import {
  traineeFlairMaps,
  traineeSite,
  traineeWorkspaceData,
} from "./trainee-workspace";

/**
 * The **trainee shell** of the group workspace — what `/gedu/clubs|camps|events/[id]`
 * renders for a gedu holding a trainee seat on the product rather than an
 * assignment.
 *
 * **The owner's rule is the whole design: a trainee sees the same page an
 * assigned gedu sees, with the private content replaced and the saves locked.**
 * So this is a shell and nothing more — the body is the one `GroupWorkspace`
 * every staff surface renders — and it differs from the gedu shell in exactly
 * the two things a shell owns:
 *
 * - **Where the data comes from.** The two redacted reads, which carry the
 *   staff documents' shapes with every staff-only field absent from the wire.
 *   What is absent stays absent on the way into the body — typed withheld, drawn
 *   as blurred filler — and nothing is made up to fill the staff shape.
 * - **Which writes it supplies.** None, as functions. Every write slot is handed
 *   a lock carrying the words its control explains itself with, so every
 *   control is on the page, in its place, and presses into an explanation
 *   rather than into a request. Every write RPC refuses a trainee besides: the
 *   lock is a teaching aid, not the security boundary.
 *
 * **Trainee status is a property of the seat, never of the person.** A
 * certified gedu can be a trainee on one group and assigned on another, so
 * this shell is chosen by which seat the caller holds on *this* product — the
 * gedu shell hands over to it when the assignment read answers that there is
 * none — and nothing here asks about certification.
 */
export function TraineeProductPage({
  productId,
  groupId: requestedGroupId = null,
}: {
  productId: string;
  groupId?: string | null;
}) {
  const { data: product, isPending: productPending } = useTraineeAssignedProduct(
    productId,
    requestedGroupId,
  );
  const groupId = product?.my_group_id ?? null;
  const { data: feed, isPending: feedPending } = useTraineeGroupFeed(groupId);

  if (productPending || (groupId !== null && feedPending)) {
    return <GeduProductPageSkeleton />;
  }
  if (!product || !feed) return <NotAssignedState />;

  return <TraineeWorkspace product={product} feed={feed} />;
}

/**
 * Every lock this shell hands the body, with the words each one says.
 *
 * **Two reasons, and which one a lock gives is decided by what it guards.** A
 * Save is the end of something the trainee can do in full — open the editor,
 * type, try it — so its reason says so, and says that nothing is kept. Every
 * other locked action (send, photos, a substitute, another group's room) is
 * simply somebody else's, and says whose.
 *
 * Neither ever says "once you're certified": a certified gedu can be a trainee
 * on a group, and the lock is about the seat.
 */
function useTraineeLocks() {
  const t = useTranslations("gedu.trainee");
  return useMemo(() => {
    const explain = (
      title: string,
      what: string,
      why: "save" | "action",
    ): LockExplanation => ({
      title,
      what,
      why: why === "save" ? t("whySave") : t("whyAction"),
      dismiss: t("dismiss"),
      lockedHint: t("lockedHint"),
    });
    const lock = (explanation: LockExplanation): Locked => ({
      locked: explanation,
    });
    return {
      session: lock(explain(t("sessionTitle"), t("sessionWhat"), "save")),
      groupNotes: lock(
        explain(t("groupNotesTitle"), t("groupNotesWhat"), "save"),
      ),
      siteNotes: lock(explain(t("siteNotesTitle"), t("siteNotesWhat"), "save")),
      gamer: lock(explain(t("gamerTitle"), t("gamerWhat"), "save")),
      username: lock(explain(t("usernameTitle"), t("usernameWhat"), "save")),
      send: lock(explain(t("sendTitle"), t("sendWhat"), "action")),
      photos: lock(explain(t("photosTitle"), t("photosWhat"), "action")),
      substitute: lock(
        explain(t("substituteTitle"), t("substituteWhat"), "action"),
      ),
      room: explain(t("roomTitle"), t("roomWhat"), "action"),
    };
  }, [t]);
}

export function TraineeWorkspace({
  product,
  feed,
}: {
  product: TraineeAssignedProduct;
  feed: TraineeGroupFeed;
}) {
  const liveNow = useNow();
  const groupId = feed.group.id;
  const locks = useTraineeLocks();

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  // The same freeze the gedu shell holds while an editor is open, for the same
  // reason: the trainee may open any editor and type into it, and a tick that
  // reclassified the entry underneath would swap the editor and drop the draft.
  const [feedNow, setFeedNow] = useState<Date | null>(null);
  const [groupNotesEditing, setGroupNotesEditing] = useState(false);
  const [siteNotesEditing, setSiteNotesEditing] = useState(false);

  const platform = platformForTopic(product.product.topic);
  const robloxIds = useMemo(
    () =>
      platform === "roblox"
        ? feed.roster
            .map((member) => member.roblox_user_id)
            .filter((id): id is number => id !== null)
        : [],
    [platform, feed.roster],
  );
  const { data: robloxAvatarUrls } = useRobloxRenders(robloxIds, "full");

  const now = feedNow ?? liveNow;

  const entries = useMemo(
    () =>
      buildGeduSessionFeed({
        groupId,
        timezone: feed.product.timezone,
        slots: feed.product.schedule_slots.map((slot) => ({
          weekday: slot.weekday,
          startTime: slot.start_time,
          durationMinutes: slot.duration_minutes,
        })),
        startDate: feed.product.start_date,
        endDate: feed.product.end_date,
        sessions: feed.sessions,
        gedus: feed.gedus,
        // A trainee is nobody's substitute and nobody's absence is theirs to
        // know; the document carries none, so nothing is invented here.
        substitutions: [],
        cancellations: feed.cancellations,
        // Nobody: a trainee holds no staff seat, so no card may offer them an
        // absence of their own — the locked row below stands in its place.
        viewerId: null,
        now,
        reach: "redacted",
      }),
    [groupId, feed.product, feed.sessions, feed.gedus, feed.cancellations, now],
  );

  const handleEditEntry = (entryId: string | null) => {
    setFeedNow(entryId === null ? null : liveNow);
    setEditingEntryId(entryId);
  };

  const feedRoster = useMemo<SessionFeedGamer[]>(
    () =>
      feed.roster.map((member) => ({
        id: member.participant_id,
        firstName: member.first_name,
        inGroupSince: resolveInGroupSince(member.group_joined_at),
      })),
    [feed.roster],
  );

  const data = useMemo(
    () => traineeWorkspaceData(product, feed),
    [product, feed],
  );

  const drawsNewcomerBadge = showsNewcomerBadge(product.product.product_type);
  const flairMaps = useMemo(
    () => traineeFlairMaps(feed.roster, drawsNewcomerBadge),
    [feed.roster, drawsNewcomerBadge],
  );

  return (
    <GroupWorkspace
      data={data}
      entries={entries}
      feedNow={now}
      feedRoster={feedRoster}
      // Not asked: the photo-consent answers are withheld from a trainee (their
      // read policy admits staff only, so the read would come back empty and an
      // empty map would mark every child "not allowed" — a claim made out of
      // missing data). The block that lists them is inside the photo editor,
      // and a trainee's photo writes are locked, so the block they see is the
      // ordinary one with its Add and ✕ locked.
      photoConsents={null}
      sourceTimeZone={feed.product.timezone}
      materialUrl={feed.product.material_url}
      groupPublicNote={feed.group.public_note}
      groupStaffNote={WITHHELD}
      groupNotesEditing={groupNotesEditing}
      onGroupNotesEditingChange={setGroupNotesEditing}
      onSaveGroupNotes={locks.groupNotes}
      site={traineeSite(feed.site)}
      siteNotesEditing={siteNotesEditing}
      onSiteNotesEditingChange={setSiteNotesEditing}
      onSaveSiteNotes={locks.siteNotes}
      editingEntryId={editingEntryId}
      onEditEntry={handleEditEntry}
      onSaveEntry={locks.session}
      onSendReport={locks.send}
      onAddPhoto={locks.photos}
      onRemovePhoto={locks.photos}
      onRequestSubstitution={locks.substitute}
      onSaveGameUsername={locks.username}
      robloxAvatarUrls={robloxAvatarUrls}
      memberFlair={{
        now,
        ...flairMaps,
        onSaveNote: locks.gamer,
        onSaveCreations: locks.gamer,
      }}
      trainees={feed.trainees}
      namedOnlyRoomLock={locks.room}
    />
  );
}
