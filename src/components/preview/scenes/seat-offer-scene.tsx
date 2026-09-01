"use client";

import { useState } from "react";
import { useLocale } from "next-intl";

import {
  SEAT_OFFER_FIXTURE,
  seatOfferFixtureDeadline,
  type SeatOfferScenario,
} from "@/components/seat-offer/mock-seat-offer-fixtures";
import {
  SeatOfferOutcomeCard,
  SeatOfferResponse,
} from "@/components/seat-offer/seat-offer-response";
import { resolveLocale } from "@/lib/constants/locales";
import { formatDate } from "@/lib/utils";
import { useNow } from "@/providers";

/**
 * The page a family lands on from the seat-offer mail, over fixtures.
 *
 * **This is the one page in the feature nobody could look at.** Its link
 * carries a signed token naming a real waitlisted row, so the only state
 * reachable without minting one by hand was the dead-link card — put rubbish in
 * the query string and the page obliges. The offer itself, and the two cards an
 * answer lands on, had no way of being seen at all.
 *
 * Both halves are the live components: the offer panel is the same one the route
 * renders, and the three terminal cards are the same component it and the page
 * both render. What the scene supplies is the data the token would have carried
 * and a responder that answers without leaving the browser.
 *
 * **Answering is inert and the panel still moves**, which is the honest version
 * of both rules at once: the buttons hold their committing state and spin
 * exactly as they do in production, and then the real terminal card replaces the
 * panel — accept lands on the accepted card, decline on the declined one, by way
 * of the confirmation step, which is pure local state and works for real. The
 * failure alert is the one state no scenario shows, because it belongs to a
 * request that did not land and no fixture responder can honestly fail.
 *
 * The deadline is derived from the first `useNow()` and then held, the way every
 * other scene holds its fixture: the clock ticks every thirty seconds, and a
 * deadline sentence that re-derived itself on that beat would rewrite painted
 * text on data's own schedule.
 */
export function SeatOfferScene({ scenario }: { scenario: SeatOfferScenario }) {
  const now = useNow();
  const locale = resolveLocale(useLocale());
  const [deadline] = useState(() => seatOfferFixtureDeadline(now));

  // The lapsed panel is the live component too, not a card: a family whose
  // window closed can still give the place back, so the scenario has a button
  // on it and walks into the declined card the same way the live offer does.
  if (scenario === "live" || scenario === "expired") {
    return (
      <SeatOfferResponse
        // Never sent anywhere: `respond` below replaces the whole call, token
        // and all.
        token={SEAT_OFFER_FIXTURE.token}
        offer={
          scenario === "expired"
            ? { kind: "expired" }
            : {
                kind: "open",
                participantName: SEAT_OFFER_FIXTURE.participantName,
                isSelfSeat: false,
                productName: SEAT_OFFER_FIXTURE.productName,
                // Formatted exactly as the route formats it — the product's
                // zone with the zone named, and a 24-hour clock face, so the
                // page and the mail state one deadline rather than two readings
                // of it.
                deadline: formatDate(deadline, locale, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZoneName: "short",
                  timeZone: SEAT_OFFER_FIXTURE.timeZone,
                }),
              }
        }
        initialIntent={null}
        respond={answerTruthfully}
      />
    );
  }

  return <SeatOfferOutcomeCard outcome={TERMINAL_CARD[scenario]} />;
}

/** Which card each terminal scenario is: the wire's word, not the URL's. */
const TERMINAL_CARD = {
  accepted: "accepted",
  declined: "declined",
  // A link whose offer has been spent — answered, promoted, withdrawn or
  // replaced — as against one we could not read at all. Two sentences now,
  // because a signature we minted may be told its offer is over and a forged
  // one may be told nothing.
  used: "used",
  "dead-link": "invalid",
} as const satisfies Record<
  Exclude<SeatOfferScenario, "live" | "expired">,
  "accepted" | "declined" | "used" | "invalid"
>;

/**
 * The answer the server would have given, given without a server.
 *
 * Truthful rather than pinned to one outcome, because both directions have a
 * card behind them and the point of the live scenario is that either button
 * really reaches its own. It answers for the lapsed panel too, where only the
 * decline is reachable. The server's refusals (`expired`, `used`, `invalid`)
 * are not produced here: those are what the other scenarios are for, and a
 * responder that refused would make the accept path unreachable.
 */
function answerTruthfully(accept: boolean) {
  return Promise.resolve(accept ? ("accepted" as const) : ("declined" as const));
}
