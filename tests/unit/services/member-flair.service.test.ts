import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemberFlairService } from "@/services/member-flair/member-flair.service";
import {
  createFetchStubbedClient,
  postgrestJson,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

/**
 * ============================================================================
 * What a refused flair write hands the surface above it.
 * ============================================================================
 *
 * Both writes on this service — the private note and the creations list beside
 * it in the same dialog — hand a refusal up exactly as PostgREST described it,
 * code and message both. The message is raw database English (`Forbidden` for
 * a `42501`, a constraint name for a CHECK), and the dialog every surface
 * mounts never prints it: it logs the error and shows its own sentence, which
 * the wiring suite asserts. Keeping the code intact is what lets that log say
 * which refusal it was.
 *
 * The real client runs over a fake fetch transport (`tests/mocks/postgrest-fetch`),
 * so the PostgrestError under test is the one supabase-js actually builds — code
 * and all — rather than a hand-shaped stand-in.
 */

const GROUP_ID = "e25929cc-1b80-424e-bbe1-5fb484705404";
const PARTICIPANT_ID = "b178a049-5482-4f1a-a17b-444e634f2e2f";

/** A PostgREST error response carrying a specific SQLSTATE. */
function sqlError(code: string, message: string, status: number): Response {
  return postgrestJson({ message, code, details: null, hint: null }, status);
}

describe("MemberFlairService.setGamerGroupNote — refusals", () => {
  let fetchMock: FetchMock;
  let service: MemberFlairService;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new MemberFlairService(createFetchStubbedClient(fetchMock));
  });

  const save = () =>
    service.setGamerGroupNote({
      groupId: GROUP_ID,
      participantId: PARTICIPANT_ID,
      note: "Pair her with Emil this week.",
    });

  it("throws a refusal as it came, SQLSTATE and message intact", async () => {
    // A real path: an admin moves a member out of a group while a Gedu has a
    // stale roster open, and the Gedu's next save meets the RPC's target check.
    fetchMock.mockResolvedValue(sqlError("42501", "Forbidden", 403));

    const err = await save().catch((e: unknown) => e);

    expect(err).toMatchObject({ code: "42501", message: "Forbidden" });
  });

  it("returns the written note when the RPC accepts it", async () => {
    fetchMock.mockResolvedValue(
      postgrestJson({
        group_id: GROUP_ID,
        participant_id: PARTICIPANT_ID,
        note: "Pair her with Emil this week.",
        note_updated_by_first_name: "Sanna",
        updated_at: "2026-03-16T12:00:00.000Z",
      }),
    );

    await expect(save()).resolves.toMatchObject({
      note: "Pair her with Emil this week.",
      note_updated_by_first_name: "Sanna",
    });
  });
});

describe("MemberFlairService.setGamerGroupCreations", () => {
  let fetchMock: FetchMock;
  let service: MemberFlairService;

  const CREATION = {
    title: "Skyward Bazaar",
    url: "https://www.roblox.com/games/1818/skyward-bazaar",
  };

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    service = new MemberFlairService(createFetchStubbedClient(fetchMock));
  });

  const save = (creations = [CREATION]) =>
    service.setGamerGroupCreations({
      groupId: GROUP_ID,
      participantId: PARTICIPANT_ID,
      creations,
    });

  it("throws a refusal as it came, as the note write does", async () => {
    const message =
      'new row for relation "gamer_group_creations" violates check constraint "chk_gamer_group_creations_shape"';
    fetchMock.mockResolvedValue(sqlError("23514", message, 400));

    const err = await save().catch((e: unknown) => e);

    expect(err).toMatchObject({ code: "23514", message });
  });

  it("refuses a malformed list before it costs a round trip", async () => {
    // The caps in the contracts file are the table's CHECK, so the service
    // parses on the way OUT as well as back — which is what keeps that
    // constraint a loud backstop rather than a routine error path.
    await expect(save([{ title: "   ", url: "https://example.com" }])).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the stored list when the RPC accepts it", async () => {
    fetchMock.mockResolvedValue(
      postgrestJson({
        group_id: GROUP_ID,
        participant_id: PARTICIPANT_ID,
        creations: [CREATION],
        updated_at: "2026-03-16T12:00:00.000Z",
      }),
    );

    await expect(save()).resolves.toMatchObject({ creations: [CREATION] });
  });

  it("reads an empty save back as the empty shape", async () => {
    // An empty list DELETES the row, and the RPC answers with the same keys
    // either way, so a caller merges one shape.
    fetchMock.mockResolvedValue(
      postgrestJson({
        group_id: GROUP_ID,
        participant_id: PARTICIPANT_ID,
        creations: [],
        updated_at: null,
      }),
    );

    await expect(save([])).resolves.toMatchObject({
      creations: [],
      updated_at: null,
    });
  });
});

describe("MemberFlairService.getGroupStaffOverlay — a refused read", () => {
  it("is a clean null rather than a throw", async () => {
    // The read and the write part company here on purpose: a refused *read* is
    // a "not yours" state the room renders as no flair at all, while a refused
    // *write* is something the editor has to tell the Gedu about.
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(sqlError("42501", "Forbidden", 403));

    const service = new MemberFlairService(createFetchStubbedClient(fetchMock));

    await expect(service.getGroupStaffOverlay(GROUP_ID)).resolves.toBeNull();
  });
});
