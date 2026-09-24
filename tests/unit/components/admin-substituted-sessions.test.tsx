import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AdminSubstitutionsPageBody } from "@/components/admin/substitutions/admin-substitutions-page-body";
import type {
  AdminSubstitutionsData,
  SubstitutedSession,
} from "@/components/admin/substitutions/admin-substitutions-data";
import { ROUTES } from "@/lib/constants";

/**
 * The admin Substitutions page's second section: the upcoming sessions that
 * already have a substitute.
 *
 * 1. **It sits below the open queue, with a heading and a count**, and an
 *    all-clear line of its own when there is nothing in it.
 * 2. **A card names the session, who is away, who stands in and who approved
 *    them** — what an admin reads to check they picked the right person.
 * 3. **It has no actions.** Changing or clearing a sub is the group page's job,
 *    so the card carries the way there and nothing to press on this page.
 *
 * Translations echo their keys (with their arguments, where the key takes
 * any), and the relative-time formatter echoes a fixed phrase.
 */
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string, values?: Record<string, unknown>) => {
      const full = namespace ? `${namespace}.${key}` : key;
      return values === undefined ? full : `${full} ${JSON.stringify(values)}`;
    };
    t.rich = (key: string) => key;
    return t;
  },
  useFormatter: () => ({ relativeTime: () => "in 3 hours" }),
  useLocale: () => "en",
}));

// Real UUIDs, hardcoded: every chip draws an identicon out of the id's hex
// bytes. Never generated at test time.
const IDS = {
  requester: "3f8682f8-1994-4e4b-b849-73c4066efac4",
  substitute: "52cae3c1-b538-4513-9036-d22863bb8766",
} as const;

const NOW = new Date("2026-08-17T09:20:00+03:00");

const GROUP_HREF = ROUTES.admin.productGroup(
  "consumer_club",
  "consumer-club-4",
  "group-c",
);

const SUBSTITUTED: SubstitutedSession = {
  id: "request-substituted",
  groupId: "group-c",
  groupName: "Ryhmä C",
  productName: "Fortnite-klubi Vantaa",
  productType: "consumer_club",
  sessionDay: "2026-08-18",
  sessionDate: "Tue 18 Aug",
  sessionTime: "16:00–17:30",
  startsAt: new Date("2026-08-18T16:00:00+03:00"),
  urgent: false,
  role: "primary",
  reason: "sick",
  reasonNote: null,
  requesterId: IDS.requester,
  requesterName: "Onni Mäkelä",
  groupHref: GROUP_HREF,
  substituteId: IDS.substitute,
  substituteName: "Saana Nieminen",
  approvedAt: new Date("2026-08-16T19:30:00+03:00"),
  approverFirstName: "Kaisa",
};

function renderBody(substituted: readonly SubstitutedSession[]) {
  const data: AdminSubstitutionsData = {
    now: NOW,
    timeZoneAbbrev: null,
    open: [],
    substituted,
  };
  return render(
    <AdminSubstitutionsPageBody
      data={data}
      onApproveOffer={() => Promise.resolve()}
      onSeatSubstitute={() => Promise.resolve()}
    />,
  );
}

function section() {
  const heading = screen.getByRole("heading", {
    name: /admin\.substitutions\.substitutedLabel/,
  });
  const element = heading.closest("section");
  if (element === null) throw new Error("the heading sits outside a section");
  return element;
}

describe("the admin Substitutions page's sessions with a substitute", () => {
  it("lists them below the open queue, under a heading with a count", () => {
    renderBody([SUBSTITUTED, { ...SUBSTITUTED, id: "second", sessionDay: "2026-08-24" }]);

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "admin.substitutions.listLabel",
      "admin.substitutions.substitutedLabel2",
    ]);

    const list = within(section()).getByRole("list", {
      name: "admin.substitutions.substitutedLabel",
    });
    expect(within(list).getAllByText("Fortnite-klubi Vantaa")).toHaveLength(2);
  });

  it("names the session, who is away, who stands in and who approved them", () => {
    renderBody([SUBSTITUTED]);
    const card = within(section());

    expect(card.getByText("Fortnite-klubi Vantaa")).toBeTruthy();
    expect(card.getByText("Ryhmä C")).toBeTruthy();
    expect(card.getByText("16:00–17:30")).toBeTruthy();
    expect(card.getByText("Onni Mäkelä")).toBeTruthy();
    expect(card.getByText("admin.substitutions.substitute")).toBeTruthy();
    expect(card.getByText("Saana Nieminen")).toBeTruthy();
    expect(
      card.getByText(
        `admin.substitutions.approvedBy ${JSON.stringify({ name: "Kaisa", when: "in 3 hours" })}`,
      ),
    ).toBeTruthy();
  });

  it("carries the way to the group and nothing to press here", () => {
    renderBody([SUBSTITUTED]);
    const card = within(section());

    expect(card.queryByRole("button")).toBeNull();
    const link = card.getByRole("link", { name: /admin\.substitutions\.openGroup/ });
    expect(link.getAttribute("href")).toContain("group-c");
  });

  it("says so in a line when no upcoming session has a substitute", () => {
    renderBody([]);
    const empty = within(section());

    expect(empty.getByText("admin.substitutions.substitutedEmpty")).toBeTruthy();
    expect(empty.queryByRole("list")).toBeNull();
  });
});
