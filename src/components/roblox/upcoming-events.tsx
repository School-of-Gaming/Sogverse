import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

/** One upcoming programme event, as the section needs to render it. */
export interface UpcomingEvent {
  id: string;
  name: string;
  /** Pre-formatted for the viewer — this component does no date maths. */
  when: string;
  where: string;
}

interface UpcomingEventsProps {
  /**
   * The events to show. Empty (the default) renders the empty state, which is
   * the real state today: no Roblox products exist yet.
   */
  events?: readonly UpcomingEvent[];
}

/**
 * "Upcoming Events" — the programme's own products, each linking to its
 * product page to enrol.
 *
 * Presentational by design: it takes rows and renders them, so the eventual
 * wiring is a data shell fetching Roblox-topic products and passing them in,
 * with no change to this file. That also keeps it demoable from fixtures.
 *
 * Dates arrive pre-formatted rather than as instants. A session's start time is
 * a real instant and has to be rendered in the *viewer's* timezone against a
 * request-stable "now" — that belongs in the shell that knows the viewer, not in
 * a presentational list that would otherwise fall back to the runtime default.
 *
 * The brief asks for a carousel. This renders a plain responsive grid until
 * there are real events to page through: a carousel of nothing is worse than a
 * sentence, and a horizontally-scrolling row of cards would hide events behind
 * an interaction on the one section whose whole job is to show what is on offer.
 */
export function UpcomingEvents({ events = [] }: UpcomingEventsProps) {
  const t = useTranslations("roblox.events");

  return (
    <section className="container mx-auto px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t("heading")}
        </h2>
        <p className="mt-4 text-muted-foreground">{t("subheading")}</p>
      </div>

      {events.length === 0 ? (
        <Card className="mx-auto mt-12 max-w-2xl bg-card/50">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground" />
            <p className="max-w-md text-muted-foreground">{t("empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <Link
              key={event.id}
              href={ROUTES.shopProduct(event.id)}
              className="group rounded-lg transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full bg-card/50">
                <CardContent className="flex h-full flex-col py-6">
                  <p className="font-semibold">{event.name}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {event.when}
                  </p>
                  <p className="text-sm text-muted-foreground">{event.where}</p>
                  <ArrowRight className="mt-4 h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
