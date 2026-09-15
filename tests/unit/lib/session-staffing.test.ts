import { describe, it, expect } from "vitest";
import {
  deriveSessionStaffing,
  holdsLiveCoverRequest,
  type CoverRequestInput,
  type GeduAssignmentRole,
  type StaffingAssignment,
} from "@/lib/session-staffing";

/**
 * The derivation sentence, case by case: *a gedu is expected at (group, date) iff
 * they hold no non-withdrawn request for it, and they are either assigned to the
 * group or hold a `covered` request for it.*
 *
 * These are the same cases the DB suite runs against the SQL predicate —
 * assigned, open request, covered, the chain, cleared, withdrawn — so a
 * divergence between the two shows up as one suite passing and the other failing
 * on a case with the same name.
 *
 * Every id is a real UUID because a gedu's first name renders beside an
 * identicon derived from their id on the surfaces these feed, and a readable
 * stand-in renders a degenerate one.
 */
const DATE = "2026-04-13";
const OTHER_DATE = "2026-04-20";

const GEDU = {
  amina: "9a0c1e4e-2a0e-4b6f-8a3d-3f1b2c7d4e50",
  bo: "1c4f5a7b-9d2e-4c88-9a11-7b3e6d5c2f41",
  cai: "5e2d8b6a-3c4f-4d91-8e77-2a9b1c0d3e62",
  dara: "7f3a1b2c-4d5e-4f80-9b22-6c8d7e5f4a13",
} as const;

const NAMES: Record<string, string> = {
  [GEDU.amina]: "Amina",
  [GEDU.bo]: "Bo",
  [GEDU.cai]: "Cai",
  [GEDU.dara]: "Dara",
};

function person(id: string) {
  return { id, firstName: NAMES[id] ?? "Unknown" };
}

function assigned(
  id: string,
  role: GeduAssignmentRole = "primary",
): StaffingAssignment {
  return { id, firstName: NAMES[id] ?? "Unknown", role };
}

/** An open request, unless `fields` says otherwise. */
function request(
  id: string,
  requestedBy: string,
  fields: Partial<CoverRequestInput> = {},
): CoverRequestInput {
  return {
    id,
    sessionDate: DATE,
    requestedBy: person(requestedBy),
    role: "primary",
    status: "open",
    coveredBy: null,
    ...fields,
  };
}

/** A request already covered by `sub`. */
function covered(
  id: string,
  requestedBy: string,
  sub: string,
  fields: Partial<CoverRequestInput> = {},
): CoverRequestInput {
  return request(id, requestedBy, {
    status: "covered",
    coveredBy: person(sub),
    ...fields,
  });
}

function derive(args: {
  gedus?: StaffingAssignment[];
  requests?: CoverRequestInput[];
  sessionDate?: string;
  viewerId?: string | null;
}) {
  return deriveSessionStaffing({
    gedus: args.gedus ?? [],
    requests: args.requests ?? [],
    sessionDate: args.sessionDate ?? DATE,
    viewerId: args.viewerId,
  });
}

function expectedIds(staffing: {
  expected: readonly { id: string }[];
}): string[] {
  return staffing.expected.map((gedu) => gedu.id);
}

describe("deriveSessionStaffing — plain assignment", () => {
  it("expects every assigned gedu in their own role", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina), assigned(GEDU.bo, "assistant")],
    });

    expect(staffing.expected).toEqual([
      { id: GEDU.amina, firstName: "Amina", role: "primary" },
      { id: GEDU.bo, firstName: "Bo", role: "assistant" },
    ]);
    expect(staffing.requests).toEqual([]);
  });

  it("ignores requests on another date", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina)],
      requests: [request("r1", GEDU.amina, { sessionDate: OTHER_DATE })],
    });

    expect(expectedIds(staffing)).toEqual([GEDU.amina]);
    expect(staffing.requests).toEqual([]);
  });
});

describe("deriveSessionStaffing — an open request", () => {
  it("drops the requester and adds nobody", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina), assigned(GEDU.bo)],
      requests: [request("r1", GEDU.amina)],
    });

    expect(expectedIds(staffing)).toEqual([GEDU.bo]);
    expect(staffing.requests).toEqual([
      {
        id: "r1",
        status: "open",
        requestedBy: person(GEDU.amina),
        role: "primary",
        coveredBy: null,
        offerCount: null,
        isViewers: false,
      },
    ]);
  });

  it("carries the offer count through where the reader is told, and null where not", () => {
    const told = derive({
      gedus: [assigned(GEDU.amina)],
      requests: [request("r1", GEDU.amina, { offerCount: 2 })],
    });
    const untold = derive({
      gedus: [assigned(GEDU.amina)],
      requests: [request("r1", GEDU.amina)],
    });

    expect(told.requests[0]?.offerCount).toBe(2);
    expect(untold.requests[0]?.offerCount).toBeNull();
  });
});

describe("deriveSessionStaffing — covered", () => {
  it("expects the sub in the requester's role and not the requester", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina, "assistant")],
      requests: [
        covered("r1", GEDU.amina, GEDU.bo, {
          role: "assistant",
          offerCount: 1,
        }),
      ],
    });

    expect(staffing.expected).toEqual([
      { id: GEDU.bo, firstName: "Bo", role: "assistant" },
    ]);
    expect(staffing.requests).toEqual([
      {
        id: "r1",
        status: "covered",
        requestedBy: person(GEDU.amina),
        role: "assistant",
        coveredBy: person(GEDU.bo),
        offerCount: 1,
        isViewers: false,
      },
    ]);
  });

  it("gives an admin-recorded cover on a group with no assignment row its seat", () => {
    const staffing = derive({
      gedus: [],
      requests: [covered("r1", GEDU.amina, GEDU.bo)],
    });

    expect(expectedIds(staffing)).toEqual([GEDU.bo]);
  });
});

describe("deriveSessionStaffing — the chain", () => {
  it("expects only the last sub when A → B → C are all covered", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina)],
      requests: [
        covered("r1", GEDU.amina, GEDU.bo),
        covered("r2", GEDU.bo, GEDU.cai),
      ],
    });

    expect(expectedIds(staffing)).toEqual([GEDU.cai]);
    expect(staffing.requests.map((state) => state.id)).toEqual(["r1", "r2"]);
  });

  it("leaves the seat empty while the sub's own request is open", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina)],
      requests: [covered("r1", GEDU.amina, GEDU.bo), request("r2", GEDU.bo)],
    });

    expect(staffing.expected).toEqual([]);
    expect(staffing.requests.map((state) => state.status)).toEqual([
      "covered",
      "open",
    ]);
  });
});

describe("deriveSessionStaffing — cleared and withdrawn", () => {
  it("expects nobody for a seat whose cover was cleared back to open", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina)],
      requests: [request("r1", GEDU.amina, { coveredBy: person(GEDU.bo) })],
    });

    expect(staffing.expected).toEqual([]);
    // The row's `covered_by` is cleared by the RPC; the state refuses to name a
    // sub on an open request even if one rode along.
    expect(staffing.requests[0]?.coveredBy).toBeNull();
  });

  it("treats a withdrawn request as absent, so the requester is expected again", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina), assigned(GEDU.bo, "assistant")],
      requests: [
        request("r1", GEDU.amina, { status: "withdrawn" }),
        // A withdrawn cover is history too: the sub it named is not expected.
        covered("r2", GEDU.bo, GEDU.cai, { status: "withdrawn" }),
      ],
    });

    expect(expectedIds(staffing)).toEqual([GEDU.amina, GEDU.bo]);
    expect(staffing.requests).toEqual([]);
  });
});

describe("deriveSessionStaffing — two primaries both out", () => {
  it("keeps the seats apart: one covered, one still open", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina), assigned(GEDU.bo)],
      requests: [covered("r1", GEDU.amina, GEDU.cai), request("r2", GEDU.bo)],
    });

    expect(expectedIds(staffing)).toEqual([GEDU.cai]);
    expect(
      staffing.requests.map((state) => [state.requestedBy.id, state.status]),
    ).toEqual([
      [GEDU.amina, "covered"],
      [GEDU.bo, "open"],
    ]);
  });
});

describe("deriveSessionStaffing — a sub who is also assigned", () => {
  it("resolves the role from the assignment, not the request", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina), assigned(GEDU.bo, "assistant")],
      requests: [covered("r1", GEDU.amina, GEDU.bo, { role: "primary" })],
    });

    expect(staffing.expected).toEqual([
      { id: GEDU.bo, firstName: "Bo", role: "assistant" },
    ]);
  });

  it("seats such a gedu once, whatever order the rows arrive in", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.bo, "assistant"), assigned(GEDU.amina)],
      requests: [covered("r1", GEDU.amina, GEDU.bo)],
    });

    expect(expectedIds(staffing)).toEqual([GEDU.bo]);
  });
});

describe("deriveSessionStaffing — the viewer", () => {
  it("marks the requester's own request and does not expect them", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina), assigned(GEDU.bo)],
      requests: [request("r1", GEDU.amina, { offerCount: 3 })],
      viewerId: GEDU.amina,
    });

    expect(staffing.viewerIsExpected).toBe(false);
    expect(staffing.viewerRequest).toEqual({
      id: "r1",
      status: "open",
      requestedBy: person(GEDU.amina),
      role: "primary",
      coveredBy: null,
      offerCount: 3,
      isViewers: true,
    });
  });

  it("expects the sub and gives them no request of their own", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina)],
      requests: [covered("r1", GEDU.amina, GEDU.bo)],
      viewerId: GEDU.bo,
    });

    expect(staffing.viewerIsExpected).toBe(true);
    expect(staffing.viewerRequest).toBeNull();
  });

  it("expects an unrelated assigned gedu and flags nothing as theirs", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina), assigned(GEDU.bo)],
      requests: [request("r1", GEDU.amina)],
      viewerId: GEDU.bo,
    });

    expect(staffing.viewerIsExpected).toBe(true);
    expect(staffing.viewerRequest).toBeNull();
    expect(staffing.requests[0]?.isViewers).toBe(false);
  });

  it("answers false for both with no viewer at all", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina)],
      requests: [request("r1", GEDU.amina)],
    });

    expect(staffing.viewerIsExpected).toBe(false);
    expect(staffing.viewerRequest).toBeNull();
  });

  it("falls back to the document's own isMine flag when no viewer id is given", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina)],
      requests: [request("r1", GEDU.amina, { isMine: true })],
    });

    expect(staffing.requests[0]?.isViewers).toBe(true);
    expect(staffing.viewerRequest?.id).toBe("r1");
  });

  it("prefers the viewer id over the flag where both are present", () => {
    const staffing = derive({
      gedus: [assigned(GEDU.amina), assigned(GEDU.bo)],
      requests: [request("r1", GEDU.amina, { isMine: true })],
      viewerId: GEDU.bo,
    });

    expect(staffing.requests[0]?.isViewers).toBe(false);
    expect(staffing.viewerRequest).toBeNull();
  });
});

describe("deriveSessionStaffing — ordering", () => {
  it("puts primaries before assistants, then sorts by first name, then by id", () => {
    const twinA = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";
    const twinB = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3e";

    const staffing = derive({
      gedus: [
        { id: GEDU.dara, firstName: "Dara", role: "assistant" },
        { id: twinB, firstName: "Cai", role: "primary" },
        { id: GEDU.amina, firstName: "Amina", role: "assistant" },
        { id: twinA, firstName: "Cai", role: "primary" },
      ],
    });

    expect(expectedIds(staffing)).toEqual([
      twinA,
      twinB,
      GEDU.amina,
      GEDU.dara,
    ]);
  });

  it("orders requests by the absent gedu's role, name and request id", () => {
    const staffing = derive({
      gedus: [
        assigned(GEDU.dara, "assistant"),
        assigned(GEDU.cai),
        assigned(GEDU.amina),
      ],
      requests: [
        request("r-dara", GEDU.dara, { role: "assistant" }),
        request("r-cai", GEDU.cai),
        request("r-amina", GEDU.amina),
      ],
    });

    expect(staffing.requests.map((state) => state.id)).toEqual([
      "r-amina",
      "r-cai",
      "r-dara",
    ]);
    expect(staffing.expected).toEqual([]);
  });
});

describe("holdsLiveCoverRequest", () => {
  const requests = [
    request("r1", GEDU.amina),
    covered("r2", GEDU.bo, GEDU.cai),
    request("r3", GEDU.dara, { status: "withdrawn" }),
    request("r4", GEDU.cai, { sessionDate: OTHER_DATE }),
  ];

  it("is true for an open and for a covered request on that date", () => {
    expect(holdsLiveCoverRequest(requests, DATE, GEDU.amina)).toBe(true);
    expect(holdsLiveCoverRequest(requests, DATE, GEDU.bo)).toBe(true);
  });

  it("is false for a withdrawn one, another date, a sub, and a gedu with none", () => {
    expect(holdsLiveCoverRequest(requests, DATE, GEDU.dara)).toBe(false);
    expect(holdsLiveCoverRequest(requests, DATE, GEDU.cai)).toBe(false);
    expect(holdsLiveCoverRequest(requests, OTHER_DATE, GEDU.amina)).toBe(false);
    expect(holdsLiveCoverRequest(requests, OTHER_DATE, GEDU.cai)).toBe(true);
  });
});
