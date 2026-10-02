import type { FeedbackPeriod } from "@/components/admin/feedback/aggregate-feedback";
import type {
  AdminFeedbackDataset,
  AdminFeedbackGedu,
  AdminFeedbackGroupRef,
  AdminFeedbackResponse,
  AdminFeedbackSession,
} from "@/services/session-feedback/admin-feedback.contracts";

/**
 * Builders for the admin feedback dataset the RPC returns: a response or a
 * session at one of a few fixed groups, and a dataset spanning the history.
 */

export const FEEDBACK_CLUB_A: AdminFeedbackGroupRef = {
  groupId: "group-a1",
  groupName: "A1",
  productId: "product-a",
  productName: "Club A",
  productType: "consumer_club",
  isRemote: true,
};
export const FEEDBACK_CLUB_A2: AdminFeedbackGroupRef = {
  ...FEEDBACK_CLUB_A,
  groupId: "group-a2",
  groupName: "A2",
};
export const FEEDBACK_CLUB_B: AdminFeedbackGroupRef = {
  groupId: "group-b1",
  groupName: "B1",
  productId: "product-b",
  productName: "Club B",
  productType: "municipality_club",
  isRemote: true,
};
export const FEEDBACK_GEDU_AINO: AdminFeedbackGedu = { id: "gedu-aino", name: "Aino", role: "primary" };
export const FEEDBACK_GEDU_MIKA: AdminFeedbackGedu = { id: "gedu-mika", name: "Mika", role: "assistant" };

/** Three months of history, ending "today". */
export const FEEDBACK_HISTORY: FeedbackPeriod = { from: "2026-07-01", to: "2026-09-30" };

/** One rating for every statement the online catalogue asks. */
export function allFive(rating: number): Record<string, number> {
  return { learned: rating, fun: rating, geduKnowledgeable: rating, geduKind: rating, groupListens: rating };
}

let nextGamer = 0;

/** A response at Club A's first group, from a gamer nobody else is. */
export function feedbackResponse(overrides: Partial<AdminFeedbackResponse> = {}): AdminFeedbackResponse {
  nextGamer += 1;
  return {
    ...FEEDBACK_CLUB_A,
    source: "gamer_online",
    sessionDate: "2026-09-08",
    respondent: { id: `gamer-${nextGamer}`, name: `Gamer ${nextGamer}` },
    gedus: [FEEDBACK_GEDU_AINO],
    answers: {},
    note: "",
    countsTowardRate: true,
    submittedAt: "2026-09-08T16:00:00Z",
    ...overrides,
  };
}

/** `count` responses alike but for who gave them. */
export function feedbackResponses(
  count: number,
  overrides: Partial<AdminFeedbackResponse> = {},
): AdminFeedbackResponse[] {
  return Array.from({ length: count }, () => feedbackResponse(overrides));
}

export function feedbackSession(overrides: Partial<AdminFeedbackSession> = {}): AdminFeedbackSession {
  return {
    ...FEEDBACK_CLUB_A,
    source: "gamer_online",
    sessionDate: "2026-09-08",
    eligibleCount: 4,
    gedus: [FEEDBACK_GEDU_AINO],
    ...overrides,
  };
}

/** A dataset spanning `FEEDBACK_HISTORY`. */
export function feedbackDataset(
  responses: AdminFeedbackResponse[],
  sessions: AdminFeedbackSession[] = [],
): AdminFeedbackDataset {
  return { ...FEEDBACK_HISTORY, responses, sessions };
}
