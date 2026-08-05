"use client";

import { useState } from "react";
import { FamilyProductPageBody } from "@/components/family/product-page";
import {
  buildFamilyProductPageFixture,
  type FamilyProductScenario,
} from "@/components/family/product-page/mock-fixtures";
import { useNow } from "@/providers";
import type { SessionAudience } from "@/types";

/**
 * The family product page over fixtures — the same presentational body for both
 * audiences, which is the point of the scene existing twice.
 *
 * Everything on the page that is pure UI works: revealing the future upward with
 * the viewport pinned, expanding a clamped report, and walking back through the
 * term in chunks. Everything that would touch a backend is inert — the Join
 * renders its real live or locked state and does nothing when clicked, because a
 * preview must not put anybody into a voice room.
 *
 * The fixture is built once from the first `useNow()` value and then held in
 * state. Rebuilding it on the 30-second tick would re-derive every session start
 * from a new `now`, so the schedule under somebody's cursor would creep while
 * they were reading it. What still follows the clock is what the page derives
 * from `useNow()` itself — the live badge, the voice window — which is exactly
 * the half that should.
 */
export function FamilyProductPageScene({
  audience,
  scenario,
}: {
  audience: SessionAudience;
  scenario: FamilyProductScenario;
}) {
  const now = useNow();
  const [fixture] = useState(() =>
    buildFamilyProductPageFixture(now, scenario),
  );

  return (
    <FamilyProductPageBody
      audience={audience}
      productName={fixture.productName}
      schedule={fixture.schedule}
      isRemote={fixture.isRemote}
      gamer={fixture.gamer}
      groupName={fixture.groupName}
      // Passed on both audiences deliberately: the body is what decides a child
      // never sees a billing notice, and a scene that withheld the props would
      // be proving the scene's own conditional rather than the page's.
      paymentProblem={fixture.paymentProblem}
      cancellation={fixture.cancellation}
      gedus={fixture.gedus}
      groupPublicNote={fixture.groupPublicNote}
      venue={fixture.venue}
      voiceHref={fixture.voiceHref}
      // Passing a handler is what makes the Join a `<button>` rather than a
      // link, so the lit state can be looked at without the click going
      // anywhere. It is also the real shape of the parent's live page, which
      // intercepts the click to switch accounts before joining.
      onJoinClick={noop}
      entries={fixture.entries}
      sourceTimeZone={fixture.sourceTimeZone}
    />
  );
}

function noop() {}
