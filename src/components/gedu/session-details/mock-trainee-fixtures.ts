import { buildGroupWorkspaceFixture } from "@/components/group-workspace/mock-workspace-fixtures";
import { isRedactedMember } from "@/components/group-workspace/types";
import { productLocalDate } from "@/lib/session-occurrence";
import { computeAge } from "@/lib/utils";
import { gamerBirthOf } from "@/lib/gamer-birth";
import type { TraineeAssignedProduct } from "@/services/assignments";
import type {
  TraineeFeedSession,
  TraineeGroupFeed,
} from "@/services/gedu-sessions";

/**
 * The trainee workspace's preview fixture: **the club scenario's own fixture,
 * redacted the way the two trainee reads redact it** — so the scene renders the
 * real trainee shell over the same group, the same term and the same roster an
 * assigned gedu's club scene shows, and the two can be compared page against
 * page.
 *
 * What goes is exactly what the RPCs leave off the wire: every staff note (the
 * group's, the site's, each session's), the parent addresses, the dates of
 * birth (an age in their place), the notes' text and editors (whether a note
 * exists stays), the creations, the register's marks, the substitutions, and
 * the sister groups' sizes, staff and rosters (their names stay).
 */

/** The trainee reading the page — a real UUID, because it renders as an identicon. */
const TRAINEE_ID = "24518f8a-0753-4a7e-81cf-7187a2ee986d";

export function buildTraineeWorkspaceFixture(now: Date): {
  product: TraineeAssignedProduct;
  feed: TraineeGroupFeed;
} {
  const club = buildGroupWorkspaceFixture(now, "club");
  const { data, entries, sourceTimeZone: timeZone } = club;
  const own = data.groups.find((group) => group.id === data.my_group_id);
  if (own === undefined) throw new Error("The club fixture has no own group.");

  const roster = (own.roster ?? []).map((member) => {
    if (isRedactedMember(member)) return member;
    const birth = gamerBirthOf(member.birth_year, member.birth_month);
    return {
      participant_id: member.participant_id,
      first_name: member.first_name,
      signed_up_at: member.group_joined_at ?? data.product.start_date ?? "",
      group_joined_at: member.group_joined_at,
      age: birth === null ? null : computeAge(birth, timeZone),
      gender: member.gender,
      minecraft_username: member.minecraft_username,
      minecraft_uuid: member.minecraft_uuid,
      roblox_username: member.roblox_username,
      roblox_user_id: member.roblox_user_id,
      has_note: (club.memberFlair.notes[member.participant_id] ?? "").length > 0,
      creations: [],
    };
  });

  const sessions: TraineeFeedSession[] = entries.flatMap((entry) => {
    if (entry.kind !== "past" && entry.kind !== "future") return [];
    const sessionDate = productLocalDate(entry.startsAt, timeZone);
    return [
      {
        id: `mock-trainee-session-${sessionDate}`,
        session_date: sessionDate,
        starts_at: entry.startsAt.toISOString(),
        ends_at: entry.endsAt.toISOString(),
        report: entry.report,
        report_emailed_at:
          entry.kind === "past" && entry.reportEmailedAt !== null
            ? entry.reportEmailedAt.toISOString()
            : null,
        updated_by: entry.lastEditedBy?.id ?? null,
        updated_by_first_name: entry.lastEditedBy?.firstName ?? null,
        images: [...entry.images],
        attendance: {},
      },
    ];
  });

  const cancellations = entries.flatMap((entry) =>
    entry.kind === "cancelled"
      ? [
          {
            session_date: entry.sessionDate,
            reason: null,
            cancelled_at: null,
            cancelled_by: null,
            cancelled_by_first_name: null,
          },
        ]
      : [],
  );

  const gedus = own.gedus.map((gedu) => ({ ...gedu }));

  const product: TraineeAssignedProduct = {
    product: data.product,
    my_group_id: data.my_group_id,
    groups: data.groups.map((group) =>
      group.id === data.my_group_id
        ? {
            id: group.id,
            name: group.name,
            created_at: group.created_at,
            is_my_group: true as const,
            participant_count: roster.length,
            gedus,
            roster,
          }
        : {
            id: group.id,
            name: group.name,
            created_at: group.created_at,
            is_my_group: false as const,
          },
    ),
  };

  const feed: TraineeGroupFeed = {
    product: {
      id: data.product.id,
      product_type: data.product.product_type,
      timezone: data.product.timezone,
      start_date: data.product.start_date,
      end_date: data.product.end_date,
      is_remote: data.product.is_remote,
      material_url: club.materialUrl,
      requires_gamer_creations: data.product.requires_gamer_creations,
      translations: data.product.translations,
      schedule_slots: data.product.schedule_slots,
    },
    group: {
      id: own.id,
      name: own.name,
      public_note: club.groupNotes.publicNote,
    },
    site:
      club.site === null
        ? null
        : {
            location_id: "mock-location",
            name: club.site.name,
            address: club.site.address,
            public_note: club.site.publicNote,
          },
    roster,
    sessions,
    gedus,
    cancellations,
    trainees: [{ id: TRAINEE_ID, first_name: "Veera" }],
  };

  return { product, feed };
}
