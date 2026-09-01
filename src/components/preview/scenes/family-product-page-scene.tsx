"use client";

import { useState } from "react";
import { FamilyProductPageBody } from "@/components/family/product-page";
import {
  buildFamilyProductPageFixture,
  type FamilyProductScenario,
} from "@/components/family/product-page/mock-fixtures";
import { useNow } from "@/providers";
import type { SessionAudience } from "@/types";
import { ytyPaletteFor } from "../palette-scenarios";

/**
 * The family product page over fixtures — the same presentational body for
 * every audience, which is the point of the scene existing twice.
 *
 * Everything on the page that is pure UI works: revealing the future upward with
 * the viewport pinned, expanding a clamped report, and walking back through the
 * term in chunks. Everything that would touch a backend is inert — the Join
 * renders its real live or locked state and does nothing when clicked, because a
 * preview must not put anybody into a voice room.
 *
 * One scenario differs from `active-club` in nothing but the draft palette: the
 * page's time marks in wit, its liveness in glow, its community label in
 * harmony. It borrows the live club because that is the only scenario with a
 * room open, and liveness is the half of the grammar a quiet page cannot show.
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
      // The live shell resolves this by comparing the signed-in user with the
      // feed's participant; the fixture states the same fact outright. The
      // conjunction with the parent audience is the shell's rule too: on a
      // `/gamer` route the reader is always the participant, and calling that a
      // self seat would swap the child's copy for the parent's.
      audience={
        audience === "customer" && fixture.isSelfSeat ? "self" : audience
      }
      productName={fixture.productName}
      schedule={fixture.schedule}
      isRemote={fixture.isRemote}
      participant={fixture.participant}
      groupName={fixture.groupName}
      // Passed on both audiences deliberately: the body is what decides a child
      // never sees a billing notice, and a scene that withheld the props would
      // be proving the scene's own conditional rather than the page's.
      paymentProblem={fixture.paymentProblem}
      cancellation={fixture.cancellation}
      gedus={fixture.gedus}
      groupPublicNote={fixture.groupPublicNote}
      // On the kitchen sink only, and empty everywhere else — which is the
      // state most real pages are in and the one worth being able to see: no
      // card, and no space held open for one.
      creations={fixture.creations}
      site={fixture.site}
      voiceHref={fixture.voiceHref}
      // Passing a handler is what makes the Join a `<button>` rather than a
      // link, so the lit state can be looked at without the click going
      // anywhere. It is also the real shape of the parent's live page, which
      // intercepts the click to switch accounts before joining.
      //
      // **The self seat is the one place this diverges from the live page**,
      // deliberately: there the handler is absent and the Join is a plain link
      // straight to the room, which is the whole point of the variant. A
      // preview may not navigate anybody into a voice room, so the scene keeps
      // the inert handler. The two render identically — the button and the link
      // share every style — so nothing about the page's look is being faked;
      // what is unavailable here is a click, which is unavailable on every
      // other scenario too.
      onJoinClick={noop}
      entries={fixture.entries}
      sourceTimeZone={fixture.sourceTimeZone}
      // The one scenario that is a palette rather than a shape of the page.
      // Every other scenario passes `"current"` and renders exactly what the
      // live route does.
      palette={ytyPaletteFor(scenario)}
    />
  );
}

function noop() {}
