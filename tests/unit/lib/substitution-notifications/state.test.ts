import { describe, expect, it } from "vitest";
import { deriveNotificationState } from "@/lib/substitution-notifications/state";
import { substitutionNotificationSnapshot } from "@/lib/substitution-notifications/snapshot.contracts";
import {
  SNAPSHOT_IDS,
  filledRequest,
  notificationSnapshot,
} from "../../../mocks/substitution-notifications";

/**
 * The one state the Slack message and every DM are drawn from, and the order
 * its checks run in when two hold at once.
 */
describe("deriveNotificationState", () => {
  it("the fixture is a snapshot the contract accepts", () => {
    expect(() => substitutionNotificationSnapshot.parse(notificationSnapshot())).not.toThrow();
  });

  it("an open request whose session is today or later is open", () => {
    expect(deriveNotificationState(notificationSnapshot()).kind).toBe("open");
    expect(
      deriveNotificationState(
        notificationSnapshot({ product_today: "2026-10-14" }),
      ).kind,
    ).toBe("open");
  });

  it("an open request whose date has gone by is past", () => {
    expect(
      deriveNotificationState(notificationSnapshot({ product_today: "2026-10-15" })).kind,
    ).toBe("past");
  });

  it("a substituted request is filled, with its sub and approver", () => {
    const state = deriveNotificationState(notificationSnapshot({ request: filledRequest() }));
    expect(state).toMatchObject({
      kind: "filled",
      substitute: { id: SNAPSHOT_IDS.aino },
      approver: { id: SNAPSHOT_IDS.admin },
    });
  });

  it("a filled request stays filled after its date", () => {
    expect(
      deriveNotificationState(
        notificationSnapshot({ request: filledRequest(), product_today: "2026-11-01" }),
      ).kind,
    ).toBe("filled");
  });

  it("a cancelled session outranks a filled one, and withdrawn outranks both", () => {
    expect(
      deriveNotificationState(
        notificationSnapshot({ request: filledRequest(), is_cancelled: true }),
      ).kind,
    ).toBe("cancelled");
    expect(
      deriveNotificationState(
        notificationSnapshot({ request: { status: "withdrawn" }, is_cancelled: true }),
      ).kind,
    ).toBe("withdrawn");
  });
});
