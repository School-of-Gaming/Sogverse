import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemberFlairService } from "@/services/member-flair/member-flair.service";
import {
  createFetchStubbedClient,
  postgrestJson,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

/**
 * ============================================================================
 * What a refused note write hands the surface above it.
 * ============================================================================
 *
 * A note save can be refused for real, not only in theory: an admin moves a
 * member out of a group while a Gedu has a stale roster open, and the Gedu's
 * next save meets the RPC's target check. Postgres answers `42501` with the
 * message `Forbidden` — English, untranslated, written for a log — and all
 * three surfaces (the gedu page, the voice room, the admin group details page) hand
 * the rejection to the same dialog, which prints an `Error`'s own message.
 *
 * So the mapping lives here, at the one point all three inherit: a known raw-SQL
 * refusal arrives with **no message**, which is what makes the dialog fall back
 * to its localized copy, and anything that does carry a usable message keeps it.
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

  it("strips the database's own words off a 42501, keeping the cause", async () => {
    fetchMock.mockResolvedValue(sqlError("42501", "Forbidden", 403));

    const err = await save().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    // The whole claim: nothing for the dialog to print, so it prints its own
    // localized line instead of the SQL string.
    expect(err instanceof Error ? err.message : "unreachable").toBe("");
    // The refusal itself is not lost — a console, and any future logging, still
    // sees the SQLSTATE.
    expect(err instanceof Error ? err.cause : null).toMatchObject({
      code: "42501",
      message: "Forbidden",
    });
  });

  it("strips them off the length CHECK too", async () => {
    // Only a non-UI caller can trip this (the dialog caps at 2000 characters),
    // and a constraint name is no more readable than `Forbidden` is.
    fetchMock.mockResolvedValue(
      sqlError(
        "23514",
        'new row for relation "gamer_group_notes" violates check constraint "chk_gamer_group_notes_length"',
        400,
      ),
    );

    const err = await save().catch((e: unknown) => e);

    expect(err instanceof Error ? err.message : "unreachable").toBe("");
  });

  it("leaves an error it does not name alone, code and message intact", async () => {
    // The mapping is a named list, not a blanket: anything else reaches the
    // caller exactly as PostgREST described it, message and SQLSTATE both.
    //
    // Worth knowing while reading this: without `.throwOnError()` the library
    // hands back the parsed error *body* — a plain object that is not an
    // `Error` instance, however the types read — so a message reaching the
    // dialog through this path is already the exception rather than the rule.
    // That is exactly why the two refusals above are mapped explicitly instead
    // of being left to that accident, which one `.throwOnError()` or one
    // library release would reverse.
    fetchMock.mockResolvedValue(
      sqlError("P0001", "Deliberate, and worth reading", 400),
    );

    const err = await save().catch((e: unknown) => e);

    expect(err).toMatchObject({
      code: "P0001",
      message: "Deliberate, and worth reading",
    });
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
