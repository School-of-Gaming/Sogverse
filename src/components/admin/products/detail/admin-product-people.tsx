"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { CopyAllEmailsButton } from "@/components/gedu/session-details/roster-helpers";
import {
  GroupNotesPanel,
  type GroupNotesDraft,
} from "@/components/gedu/session-details/GroupNotesPanel";
import {
  GroupsPanelView,
  type GroupsPanelActions,
} from "../groups/groups-panel-view";
import type { ParticipantChipDetails } from "../groups/participant-chip";
import type { GroupPending } from "@/services/groups";
import type { RobloxRenderMap } from "@/services/roblox";
import type {
  BillingMode,
  GroupParticipationDetail,
  ProductGroupsSnapshot,
  ProductTopic,
  ProductType,
} from "@/types";
import type { AdminProductGroupDetail } from "./admin-product-detail-data";

/**
 * **People** — the seating panel at full width, and then everything about each
 * group that the seating panel has no room for.
 *
 * The panel is the same one the live page has always had, now split into a
 * presentational view so it can be fed a snapshot instead of binding eleven
 * mutation hooks to itself. Nothing about how it seats people changed.
 *
 * What is new is the block under it: each group's two standing notes, editable
 * where they are read, and its own copy-all-contacts button. Those notes have
 * existed for as long as the gedu workspace has and have never been visible to
 * an admin — which is the same gap the sessions section closes, arriving from
 * the other direction. **The gedu-only note is shown to admins deliberately**;
 * the banner over it says gedus *and admins*, because a panel that told an
 * admin only gedus could read what the admin was looking at would be lying to
 * them about their own screen.
 *
 * Per group rather than one block for the product, because both are group-scoped
 * facts: a note about how Group B's Thursday runs is not true of Group A, and a
 * contact list for the whole product is the wrong list to paste into a mail
 * about one group's session.
 */
export function AdminProductPeople({
  snapshot,
  pending,
  productType,
  billingMode,
  topic,
  seatCount,
  waitlistEnabled,
  voiceAvailable,
  voiceIsOpen,
  opensDate,
  opensTime,
  robloxRenders,
  deriveAvatars,
  chipDetails,
  actions,
  groupDetails,
  editingGroupNotesId,
  onEditingGroupNotesChange,
  onSaveGroupNotes,
}: {
  snapshot: ProductGroupsSnapshot;
  pending: GroupPending;
  productType: ProductType;
  billingMode: BillingMode;
  topic: ProductTopic;
  seatCount: number | null;
  waitlistEnabled: boolean;
  voiceAvailable: boolean;
  voiceIsOpen: boolean;
  opensDate: string;
  opensTime: string;
  robloxRenders?: RobloxRenderMap;
  deriveAvatars?: boolean;
  chipDetails?: (participation: GroupParticipationDetail) => ParticipantChipDetails;
  actions: GroupsPanelActions;
  groupDetails: readonly AdminProductGroupDetail[];
  /** Which group's notes are open for editing, or `null` when none are. */
  editingGroupNotesId: string | null;
  onEditingGroupNotesChange: (groupId: string | null) => void;
  onSaveGroupNotes: (groupId: string, draft: GroupNotesDraft) => void | Promise<void>;
}) {
  const t = useTranslations("admin.products.detail");

  return (
    <div className="space-y-6">
      <GroupsPanelView
        snapshot={snapshot}
        isLoading={false}
        pending={pending}
        productType={productType}
        billingMode={billingMode}
        topic={topic}
        seatCount={seatCount}
        waitlistEnabled={waitlistEnabled}
        voiceAvailable={voiceAvailable}
        voiceIsOpen={voiceIsOpen}
        opensDate={opensDate}
        opensTime={opensTime}
        robloxRenders={robloxRenders}
        deriveAvatars={deriveAvatars}
        chipDetails={chipDetails}
        actions={actions}
      />

      {groupDetails.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-2">
          {groupDetails.map((group) => (
            <Card key={group.groupId}>
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">{group.name}</h3>
                  <CopyAllEmailsButton emails={group.contactEmails} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("people.notesCaption")}
                </p>
                <GroupNotesPanel
                  publicNote={group.publicNote}
                  staffNote={group.staffNote}
                  editing={editingGroupNotesId === group.groupId}
                  onEditingChange={(editing) =>
                    onEditingGroupNotesChange(editing ? group.groupId : null)
                  }
                  onSave={(draft) => onSaveGroupNotes(group.groupId, draft)}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
