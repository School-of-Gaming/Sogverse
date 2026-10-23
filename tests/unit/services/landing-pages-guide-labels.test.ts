import { beforeEach, describe, expect, it, vi } from "vitest";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";
import type { LandingSection } from "@/lib/landing-pages/sections";
import {
  createFetchStubbedClient,
  postgrestJson,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

/**
 * **The labels of the guides a structure places**, read over the real client
 * with a canned PostgREST answer: every id placed comes back with its label,
 * and an id the read does not answer throws, since nothing in the app can
 * leave a section placing a guide no row has.
 */

const PARENTS = "d4000000-0000-4000-8000-000000000001";
const GONE = "d4000000-0000-4000-8000-000000000002";

const SECTIONS: LandingSection[] = [
  { id: "a1000000-0000-4000-8000-000000000001", type: "guide", background: "default", guideId: PARENTS },
  { id: "a1000000-0000-4000-8000-000000000002", type: "guide", background: "default", guideId: GONE },
];

let fetchMock: FetchMock;
let service: LandingPageService;

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  service = new LandingPageService(createFetchStubbedClient(fetchMock));
});

describe("the placed guides' labels", () => {
  it("answers every placed guide's label by its id", async () => {
    fetchMock.mockResolvedValue(
      postgrestJson([
        { id: PARENTS, label: "Parents' guide 2026" },
        { id: GONE, label: "Term dates" },
      ]),
    );
    await expect(service.listPlacedGuideLabels(SECTIONS)).resolves.toEqual({
      [PARENTS]: "Parents' guide 2026",
      [GONE]: "Term dates",
    });
  });

  it("throws, naming the id, when the read does not answer a placed guide", async () => {
    fetchMock.mockResolvedValue(postgrestJson([{ id: PARENTS, label: "Parents' guide 2026" }]));
    await expect(service.listPlacedGuideLabels(SECTIONS)).rejects.toThrow(
      `No guide has the id ${GONE}`,
    );
  });
});
