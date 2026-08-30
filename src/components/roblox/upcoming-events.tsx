import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, CalendarDays } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import type { ParticipationCounts } from "@/services/participations";
import type { ProductBrowseRow } from "@/types";
import { EventsRail } from "./events-rail";

interface UpcomingEventsProps {
  /**
   * The programme's products, already narrowed to the programme's slice by the
   * shell above. Empty renders the empty state, which stays a real state: the
   * page ships before every cohort is scheduled.
   */
  products?: readonly ProductBrowseRow[];
  /**
   * Seat counts covering those products, in any order — the raw query result,
   * so the shell hands over what it fetched rather than a map it had to
   * assemble. The per-id map is built where the cards are, in the rail.
   */
  counts?: readonly ParticipationCounts[];
}

/**
 * "Upcoming Events" — the programme's own products, rendered with the
 * storefront's own card.
 *
 * Presentational by design: it takes rows and renders them, so it stays
 * demoable from fixtures and the data work lives in the shell that wraps it
 * (`upcoming-events-section.tsx` prefetches, `upcoming-events-browse.tsx` keeps
 * the query live and applies the programme narrowing). This file is the frame —
 * heading, subheading, and the choice between the empty state and the rail —
 * and holds no interactive state of its own; the scrolling lives one level down
 * in `events-rail.tsx`, which is the only part that needs a client directive
 * and only exists when there is something to scroll.
 *
 * The card is `ProductBrowseCard`, the same component the shop grid renders,
 * not a lookalike: a family who taps through from here and a family who found
 * the same product in the shop must be reading the same card, with the same
 * schedule, price, seat and audience rules. It also owns every locale, currency
 * and timezone resolution a product row needs, which is why this file does no
 * date maths of its own — the earlier shape took pre-formatted strings for
 * exactly that reason, and the card now discharges it.
 *
 * Cards link to `/shop/[id]`, the card's own default, so the detail page a
 * reader lands on is the storefront one with its real signup panel.
 *
 * The cards are a carousel — a horizontally snapping rail — chosen with the
 * owner, reversing what this file used to say. The old note refused one on the
 * grounds that a scrolling row "would hide events behind an interaction on the
 * one section whose whole job is to show what is on offer", and the peek is the
 * answer to exactly that: a card is 85% of the rail on a phone, so the next one
 * is always visibly cut off at the screen edge and a reader can see there is
 * more without touching anything. The grid it replaced hid more, not less —
 * a fourth event was a full scroll of the page below the fold, with nothing at
 * the third card saying it existed. At `lg` the rail fits three cards exactly,
 * so the desktop shape a reader already knows is unchanged.
 */
export function UpcomingEvents({
  products = [],
  counts = [],
}: UpcomingEventsProps) {
  const t = useTranslations("roblox.events");

  return (
    <section className="container mx-auto px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t("heading")}
        </h2>
        <p className="mt-4 text-muted-foreground">{t("subheading")}</p>
      </div>

      {products.length === 0 ? (
        <Card className="mx-auto mt-12 max-w-2xl bg-card/50">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <p className="max-w-md text-muted-foreground">{t("empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <EventsRail products={products} counts={counts} />
          {/* The completist's exit from the rail: the same programme slice in
              the shop's own vertical layout and filters. Deliberately absent in
              the empty state above — it would point at an equally empty shop —
              and rendered from the same server data as the rail, so it is in
              the HTML from the first byte and nothing below it ever moves. */}
          <div className="mt-10 text-center">
            <Link
              href={ROUTES.robloxShop}
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "gap-2",
              })}
            >
              {t("browseShop")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
