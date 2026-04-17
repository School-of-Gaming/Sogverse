"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getClub, getClubVenueLabel, getLocation } from "../../../_mock/data";
import {
  formatDayEn,
  formatIsoDate,
  formatRange,
} from "../../../_mock/format";

export default function ConfirmedPage() {
  const params = useParams<{ locationSlug: string; clubId: string }>();
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const gamer = searchParams.get("gamer") ?? "your child";
  const position = searchParams.get("position");

  const location = getLocation(params.locationSlug);
  const club = getClub(params.clubId);

  if (!location || !club) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Not found</h1>
        <Link href="/registration" className="mt-6 inline-block">
          <Button variant="outline">Start over</Button>
        </Link>
      </div>
    );
  }

  const venue = getClubVenueLabel(club);

  const isWaitlist = status === "waitlisted";

  return (
    <div className="container mx-auto max-w-xl px-4 py-16">
      <div className="text-center">
        {isWaitlist ? (
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warning/15">
            <span className="text-2xl font-bold text-warning">#{position}</span>
          </div>
        ) : (
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
            <CheckIcon />
          </div>
        )}

        <h1 className="mt-6 text-3xl font-bold tracking-tight">
          {isWaitlist
            ? `${gamer} is on the waitlist`
            : `${gamer} has a seat!`}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {isWaitlist
            ? `Position #${position} of the waitlist for ${club.name}.`
            : `See you at ${club.name} on ${formatDayEn(club.dayOfWeek)}s.`}
        </p>
      </div>

      <Card className="mt-8">
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className="text-sm font-semibold">{club.name}</h2>
            <p className="text-xs text-muted-foreground">{location.name}</p>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Meets">
              {formatDayEn(club.dayOfWeek)}s ·{" "}
              {formatRange(club.startTime, club.endTime)}
            </Info>
            <Info label="Term">
              {formatIsoDate(club.seasonStartIso)} –{" "}
              {formatIsoDate(club.seasonEndIso)}
            </Info>
            <Info label={club.isOnline ? "Location" : "Venue"}>
              {club.isOnline ? "Online" : (venue ?? "TBD")}
            </Info>
            <Info label="Gedu">{club.gedu.name}</Info>
          </dl>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="space-y-3 p-6">
          <h2 className="text-sm font-semibold">What happens next</h2>
          {isWaitlist ? (
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                • You&apos;ll get a confirmation email in the next few minutes.
              </li>
              <li>
                • If a family cancels, we&apos;ll send you a WhatsApp and email
                alert with a short window to accept.
              </li>
              <li>
                • You can leave the waitlist anytime from your account.
              </li>
            </ul>
          ) : (
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• You&apos;ll get a confirmation email with club details.</li>
              <li>
                • The first session starts{" "}
                <strong className="text-foreground">
                  {formatIsoDate(club.seasonStartIso)}
                </strong>
                .
              </li>
              {club.isOnline ? (
                <li>
                  • {gamer} can join the voice room from their Sogverse account
                  shortly before the session starts.
                </li>
              ) : (
                <li>
                  • Drop-off is at{" "}
                  <strong className="text-foreground">
                    {venue ?? "the venue announced with your confirmation email"}
                  </strong>
                  .
                </li>
              )}
              <li>
                • If {gamer} can&apos;t make a session, let the Gedu know from
                your account.
              </li>
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href={`/registration/${location.slug}`}>
          <Button variant="outline" className="w-full sm:w-auto">
            Back to {location.name}
          </Button>
        </Link>
        <Link href="/">
          <Button className="w-full sm:w-auto">Go to my account</Button>
        </Link>
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8 text-success"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
