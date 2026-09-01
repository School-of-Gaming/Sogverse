import { describe, expect, it } from "vitest";
import {
  entryCompleteness,
  entryOwesCreations,
  type CreationsObligation,
} from "@/components/gedu/session-feed";
import {
  buildGroupWorkspaceFixture,
  GROUP_WORKSPACE_SCENARIOS,
} from "@/components/group-workspace/mock-workspace-fixtures";
import { finalSessionDate, sessionEntryId } from "@/lib/session-occurrence";

/**
 * ============================================================================
 * The workspace preview fixtures, checked against the derivations they feed.
 * ============================================================================
 *
 * A preview scenario fails **silently**: nothing throws when a fixture stops
 * producing the state its label promises, the page simply renders the ordinary
 * one and a reviewer sees a roster with no marks on it and assumes that is what
 * the feature looks like. The `owed` scenario is the one most exposed to that,
 * because the state it exists to show is an *alignment* between four separate
 * things — a flag, an end date, a schedule and a roster's creations — none of
 * which is wrong on its own when it drifts.
 *
 * So the alignment is asserted here, against the real derivations rather than a
 * restatement of them. Nothing is rendered: what could go wrong is arithmetic.
 */

/** The instant every fixture below is built around — a Wednesday. */
const NOW = new Date("2026-03-18T09:00:00.000Z");

/** The obligation the workspace body derives, rebuilt from the fixture here. */
function obligationFor(
  fixture: ReturnType<typeof buildGroupWorkspaceFixture>,
): CreationsObligation | null {
  const { product, my_group_id: groupId } = fixture.data;
  if (!product.requires_gamer_creations) return null;
  const date = finalSessionDate({
    slots: product.schedule_slots,
    startDate: product.start_date,
    endDate: product.end_date,
  });
  return {
    finalEntryId: date === null ? null : sessionEntryId(groupId, date),
    withCreations: new Set(
      Object.entries(fixture.memberFlair.creations)
        .filter(([, list]) => list.length > 0)
        .map(([participantId]) => participantId),
    ),
  };
}

describe("every workspace scenario", () => {
  for (const scenario of GROUP_WORKSPACE_SCENARIOS) {
    /**
     * The ids the live page derives are `(group, product-local date)` pairs —
     * the row's own key in Postgres — and the workspace looks entries up by
     * building one. A fixture keying its entries any other way cannot be found
     * by anything that does that, which is a whole class of scenario that
     * renders but shows nothing.
     */
    it(`${scenario}: keys its entries the way the live page does`, () => {
      const fixture = buildGroupWorkspaceFixture(NOW, scenario);
      const groupId = fixture.data.my_group_id;

      expect(fixture.entries.length).toBeGreaterThan(0);
      for (const entry of fixture.entries) {
        expect(entry.id.startsWith(`${groupId}:`)).toBe(true);
      }
      // Unique, or two sessions would share a card's identity — which is what
      // the (group, date) key guarantees in the database too.
      expect(new Set(fixture.entries.map((e) => e.id)).size).toBe(
        fixture.entries.length,
      );
    });
  }

  it("flags exactly one product as requiring creations", () => {
    // The flag and a finished run travel together, and only one scenario is
    // that shape. A second flagged scenario would mean somebody had turned the
    // signal on somewhere it cannot fire.
    const flagged = GROUP_WORKSPACE_SCENARIOS.filter(
      (s) =>
        buildGroupWorkspaceFixture(NOW, s).data.product
          .requires_gamer_creations,
    );
    expect(flagged).toEqual(["owed"]);
  });
});

describe("the owed scenario", () => {
  const fixture = buildGroupWorkspaceFixture(NOW, "owed");

  it("has a final session, and it is an entry the feed actually holds", () => {
    // The whole alignment in one assertion: the end date, the schedule's
    // weekday and the newest entry's date all have to name the same day, or
    // the derivation looks up an id nothing carries and the page goes quiet.
    const obligation = obligationFor(fixture);
    expect(obligation).not.toBeNull();
    expect(obligation!.finalEntryId).not.toBeNull();
    expect(fixture.entries.map((e) => e.id)).toContain(
      obligation!.finalEntryId,
    );
  });

  it("has finished: its final session is the newest entry, and it is past", () => {
    const obligation = obligationFor(fixture);
    const final = fixture.entries.find(
      (e) => e.id === obligation!.finalEntryId,
    );
    expect(final?.kind).toBe("past");
    // Newest, because a run with sessions after its last one is not over.
    expect(final?.id).toBe(fixture.entries[0].id);
    expect(final!.endsAt.getTime()).toBeLessThan(NOW.getTime());
  });

  it("leaves at least two members owing, and most of the roster done", () => {
    const obligation = obligationFor(fixture);
    const owing = fixture.feedRoster.filter(
      (member) => !obligation!.withCreations.has(member.id),
    );
    // Two, so the marker is seen more than once and never reads as a quirk of
    // one row; and a minority, so the warning tone has a lit roster to stand
    // out against rather than becoming the roster's default.
    expect(owing.length).toBeGreaterThanOrEqual(2);
    expect(owing.length).toBeLessThan(fixture.feedRoster.length / 2);
  });

  it("owes creations and nothing else on the final session", () => {
    // The point of the scenario: one cause for the amber, so a reviewer is not
    // left guessing which of four obligations the card is complaining about.
    const obligation = obligationFor(fixture);
    const final = fixture.entries.find(
      (e) => e.id === obligation!.finalEntryId,
    )!;

    expect(entryOwesCreations(final, fixture.feedRoster, obligation)).toBe(true);
    expect(entryCompleteness(final, fixture.feedRoster, obligation)).toBe(
      "needs_attention",
    );
    // Without the obligation the very same entry is finished — which is what
    // proves the other three are discharged rather than merely assumed.
    expect(entryCompleteness(final, fixture.feedRoster, null)).toBe("complete");
  });

  it("leaves every earlier session complete", () => {
    // The contrast is what makes the amber legible: one flagged card at the
    // top of a run of green ones.
    for (const entry of fixture.entries.slice(1)) {
      expect(entryCompleteness(entry, fixture.feedRoster, null)).toBe(
        "complete",
      );
    }
  });
});
