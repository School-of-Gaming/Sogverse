"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getAncestors,
  getClubsForLocation,
  getClubState,
  getClubVenueLabel,
  getLocation,
  type Club,
  type ClubRuntimeState,
} from "../_mock/data";
import { useNow } from "../_mock/use-now";
import {
  buildCountdown,
  formatDayEn,
  formatRange,
  formatIsoDate,
  formatWhen,
  pad2,
} from "../_mock/format";

export default function LocationPage() {
  const { locationSlug } = useParams<{ locationSlug: string }>();
  const now = useNow();
  const location = getLocation(locationSlug);

  if (!location) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Municipality not found</h1>
        <p className="mt-2 text-muted-foreground">
          We couldn&apos;t find a municipality at &quot;{locationSlug}&quot;.
        </p>
        <Link href="/registration" className="mt-6 inline-block">
          <Button variant="outline">Back to search</Button>
        </Link>
      </div>
    );
  }

  const clubs = getClubsForLocation(location.id);
  const breadcrumb = getAncestors(location.id)
    .filter((a) => a.type !== "country" && a.id !== location.id)
    .map((a) => a.name)
    .join(" · ");

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-2">
        <Link
          href="/registration"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to search
        </Link>
      </div>

      <div className="border-b pb-6">
        {breadcrumb && (
          <p className="text-sm text-muted-foreground">{breadcrumb}</p>
        )}
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          {location.name}
        </h1>
        {location.termLabel && (
          <p className="mt-4 text-sm">
            <span className="font-medium">{location.termLabel}</span>{" "}
            {location.termStartIso && location.termEndIso && (
              <span className="text-muted-foreground">
                ({formatIsoDate(location.termStartIso)} –{" "}
                {formatIsoDate(location.termEndIso)})
              </span>
            )}
          </p>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold">
          Clubs offered · {clubs.length}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Seats fill fast — especially in the minutes after registration opens.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {clubs.map((club) => (
          <ClubListCard
            key={club.id}
            club={club}
            now={now}
            locationSlug={location.slug}
          />
        ))}
      </div>

      {clubs.length === 0 && (
        <Card className="mt-6">
          <CardContent className="py-12 text-center text-muted-foreground">
            No clubs are being offered in {location.name} this term. Check
            back next semester.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ClubListCard({
  club,
  now,
  locationSlug,
}: {
  club: Club;
  now: number | null;
  locationSlug: string;
}) {
  const state = now !== null ? getClubState(club, now) : null;
  const venue = getClubVenueLabel(club);
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold leading-tight">{club.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {club.isOnline ? "Online" : "In person"} · {club.language}
            </p>
          </div>
          <Badge variant="secondary">{club.game}</Badge>
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">
          {club.description}
        </p>

        <dl className="space-y-1 text-xs text-muted-foreground">
          <Row
            label="Schedule"
            value={`${formatDayEn(club.dayOfWeek)}s, ${formatRange(club.startTime, club.endTime)}`}
          />
          <Row
            label="Term"
            value={`${formatIsoDate(club.seasonStartIso)} – ${formatIsoDate(club.seasonEndIso)}`}
          />
          {venue && <Row label="Venue" value={venue} />}
          <Row label="Gedu" value={club.gedu.name} />
          <Row label="Ages" value={`${club.minAge}–${club.maxAge}`} />
        </dl>

        <div className="mt-auto flex items-center justify-between gap-3">
          <StateChip club={club} state={state} now={now} />
          <Link href={`/registration/${locationSlug}/${club.id}`}>
            <Button size="sm">View club</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-16 shrink-0 font-medium text-foreground/80">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

function StateChip({
  club,
  state,
  now,
}: {
  club: Club;
  state: ClubRuntimeState | null;
  now: number | null;
}) {
  // Every variant renders the same two-line shape (Badge + subtext line) so
  // loading → ready doesn't change the card's footer height. The subtext is
  // `invisible` (still takes space) when a state has nothing to show there.
  if (!state || now === null) {
    return (
      <div className="min-w-0">
        <Badge variant="outline" className="invisible">
          placeholder
        </Badge>
        <p className="invisible mt-1 text-[11px] text-muted-foreground">
          placeholder
        </p>
      </div>
    );
  }
  if (state.status === "not_open") {
    const cd = buildCountdown(state.opensAt, now);
    const urgent = cd.totalMs < 60 * 60 * 1000; // < 1 hour
    const label =
      cd.days > 0
        ? `Opens in ${cd.days}d ${cd.hours}h`
        : cd.hours > 0
          ? `Opens in ${cd.hours}h ${cd.minutes}m`
          : `Opens in ${cd.minutes}m ${pad2(cd.seconds)}s`;
    return (
      <div className="min-w-0">
        <Badge
          variant={urgent ? "default" : "outline"}
          className={urgent ? "" : "border-primary/40 text-primary"}
        >
          {label}
        </Badge>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {formatWhen(state.opensAt)}
        </p>
      </div>
    );
  }
  if (state.status === "full") {
    return (
      <div className="min-w-0">
        <Badge variant="destructive">
          Full · {club.waitlistCount} on waitlist
        </Badge>
        <p className="invisible mt-1 text-[11px] text-muted-foreground">
          placeholder
        </p>
      </div>
    );
  }
  if (state.status === "almost_full") {
    return (
      <div className="min-w-0">
        <Badge className="border border-warning/40 bg-warning/15 text-warning">
          Only {state.seatsRemaining} left
        </Badge>
        <p className="invisible mt-1 text-[11px] text-muted-foreground">
          placeholder
        </p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <Badge className="border border-success/40 bg-success/15 text-success">
        {state.seatsRemaining} of {club.seatCount} seats
      </Badge>
      <p className="invisible mt-1 text-[11px] text-muted-foreground">
        placeholder
      </p>
    </div>
  );
}
