import { describe, expect, it } from "vitest";
import {
  seatSubstituteFailureKey,
  substitutionRequestFailureKey,
  substitutionRequestRefusalMeansAlreadyFiled,
} from "@/services/session-substitution";

/**
 * **The picker's only way of learning about a request filed in an earlier
 * visit is the write's refusal**, so what the refusal is *called* is the whole
 * of what the reader gets told. One mapper serves both ways into that write —
 * the Substitutions page's picker and the session card's overflow menu — and
 * these are the strings `request_session_substitution` really raises, copied
 * from the migration that raises them.
 *
 * The one case that cannot be split is pinned here too: the function's
 * authorization IS the derivation, so a gedu who already holds a live request
 * and a gedu who no longer holds the seat raise one `42501 Forbidden` between
 * them. A test claiming otherwise would be describing a database we do not
 * have.
 */

/** A PostgrestError as the browser client hands one on. */
function refusal(code: string, message: string) {
  return { code, message, details: "", hint: "" };
}

describe("substitutionRequestFailureKey", () => {
  it("names the live-seat unique index as an outright second filing", () => {
    expect(
      substitutionRequestFailureKey(
        refusal(
          "23505",
          'duplicate key value violates unique constraint "session_substitution_requests_live_seat"',
        ),
      ),
    ).toBe("substitutionRequestFailedAlreadyAsked");
  });

  it("reads a past date and a date off the schedule apart", () => {
    expect(
      substitutionRequestFailureKey(
        refusal(
          "23514",
          "a substitution request cannot be filed for a past session (2026-02-02)",
        ),
      ),
    ).toBe("substitutionRequestFailedPastSession");
    expect(
      substitutionRequestFailureKey(
        refusal("23514", "No scheduled session on 2026-02-17 for this group"),
      ),
    ).toBe("substitutionRequestFailedNotScheduled");
  });

  it("gives the one 42501 a line that is true of both of its causes", () => {
    // `assert_role`, a live request already on file, and a seat that has been
    // taken away all raise this — same state, same message — so the key is one
    // key and its copy names both possibilities rather than guessing.
    expect(substitutionRequestFailureKey(refusal("42501", "Forbidden"))).toBe(
      "substitutionRequestFailedNotExpected",
    );
  });

  it("falls to the generic line for anything it cannot place", () => {
    // A reworded refusal, a check_violation this does not know, and a network
    // failure with no wire fields at all — the server's own words are
    // untranslated and name uuids, so none of them is shown.
    expect(
      substitutionRequestFailureKey(
        refusal("23514", "a substitution request needs a reason category"),
      ),
    ).toBe("substitutionRequestFailed");
    expect(substitutionRequestFailureKey(new Error("Failed to fetch"))).toBe(
      "substitutionRequestFailed",
    );
    expect(substitutionRequestFailureKey(null)).toBe("substitutionRequestFailed");
  });
});

describe("substitutionRequestRefusalMeansAlreadyFiled", () => {
  it("covers the two refusals the row's own reason describes, and no others", () => {
    expect(
      substitutionRequestRefusalMeansAlreadyFiled(
        "substitutionRequestFailedAlreadyAsked",
      ),
    ).toBe(true);
    expect(
      substitutionRequestRefusalMeansAlreadyFiled(
        "substitutionRequestFailedNotExpected",
      ),
    ).toBe(true);
    // True of the session, not of the filing: a row marked "already asked" for
    // a date that has simply passed would be inventing a request.
    expect(
      substitutionRequestRefusalMeansAlreadyFiled(
        "substitutionRequestFailedPastSession",
      ),
    ).toBe(false);
    expect(
      substitutionRequestRefusalMeansAlreadyFiled(
        "substitutionRequestFailedNotScheduled",
      ),
    ).toBe(false);
    // And a failure nobody could place is exactly where pressing again is the
    // right move.
    expect(
      substitutionRequestRefusalMeansAlreadyFiled("substitutionRequestFailed"),
    ).toBe(false);
  });
});

describe("seatSubstituteFailureKey", () => {
  it("reads a request withdrawn under the dialog as its own line", () => {
    // The write is keyed by the seat, so a request withdrawn while the dialog
    // was open arrives as a filing with no reason — and the absent gedu still
    // holds the seat, so this is not the "no longer has this session" line.
    expect(
      seatSubstituteFailureKey(
        refusal(
          "23514",
          "seat has no substitution request, and filing one needs a reason",
        ),
      ),
    ).toBe("seatFailedRequestWithdrawn");
    expect(
      seatSubstituteFailureKey(
        refusal(
          "23514",
          "gedu 00000000-0000-0000-0000-000000000001 is not expected at group 00000000-0000-0000-0000-000000000002 on 2026-10-01",
        ),
      ),
    ).toBe("seatFailedSeatGone");
    expect(seatSubstituteFailureKey(new Error("Failed to fetch"))).toBe(
      "seatFailed",
    );
  });
});
