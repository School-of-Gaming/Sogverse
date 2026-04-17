"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MOCK_GAMERS,
  getClub,
  getClubState,
  getClubVenueLabel,
  getLocation,
  type Club,
  type ClubRuntimeState,
} from "../../_mock/data";
import { useNow } from "../../_mock/use-now";
import {
  buildCountdown,
  formatDayEn,
  formatRange,
  formatIsoDate,
  formatServerClock,
  formatWhen,
  pad2,
} from "../../_mock/format";

// Shared between PreOpenPanel and NotOpenSkeleton so the load→ready
// transition doesn't add or remove a line of text under the submit button.
const PRE_OPEN_HELPER_TEXT =
  "Pick your child and agree to the rules for a one-click registration.";

export default function ClubDetailPage() {
  const { locationSlug, clubId } = useParams<{
    locationSlug: string;
    clubId: string;
  }>();
  const location = getLocation(locationSlug);
  const club = getClub(clubId);
  const now = useNow();

  const state = useMemo(
    () => (club && now !== null ? getClubState(club, now) : null),
    [club, now],
  );

  if (!location || !club) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Club not found</h1>
        <Link href="/registration" className="mt-6 inline-block">
          <Button variant="outline">Start over</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Link
          href={`/registration/${location.slug}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to {location.name}
        </Link>
        <ServerClock now={now} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <ClubOverview club={club} />
        <div className="space-y-4">
          <RegistrationPanel
            club={club}
            state={state}
            now={now}
            locationSlug={location.slug}
          />
          <Card>
            <CardContent className="p-5 text-sm">
              <h3 className="text-sm font-semibold">About registration</h3>
              <p className="mt-2 text-xs text-muted-foreground">
                Seats are assigned first-come, first-served the instant
                registration opens. If you don&apos;t get a seat, you join the
                waitlist. We&apos;ll email and message you on WhatsApp the
                moment a seat opens up.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ClubOverview({ club }: { club: Club }) {
  const venue = getClubVenueLabel(club);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{club.game}</Badge>
        <Badge variant="outline">{club.isOnline ? "Online" : "In person"}</Badge>
        <Badge variant="outline">{club.language}</Badge>
        <Badge variant="outline">Ages {club.minAge}–{club.maxAge}</Badge>
      </div>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        {club.name}
      </h1>
      <p className="mt-4 text-muted-foreground">{club.description}</p>

      <dl className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InfoRow label="Meets">
          {formatDayEn(club.dayOfWeek)}s · {formatRange(club.startTime, club.endTime)}
        </InfoRow>
        <InfoRow label="Term">
          {formatIsoDate(club.seasonStartIso)} – {formatIsoDate(club.seasonEndIso)}
        </InfoRow>
        <InfoRow label={club.isOnline ? "Location" : "Venue"}>
          {club.isOnline
            ? "Online voice room (joined from your child's account)"
            : (venue ?? "TBD")}
        </InfoRow>
        <InfoRow label="Language">{club.language}</InfoRow>
        <InfoRow label="Gedu">
          {club.gedu.name}
          <p className="text-xs text-muted-foreground">{club.gedu.bio}</p>
        </InfoRow>
        {club.assistantGedu && (
          <InfoRow label="Assistant">
            {club.assistantGedu.name}
            <p className="text-xs text-muted-foreground">
              {club.assistantGedu.bio}
            </p>
          </InfoRow>
        )}
      </dl>

      <div className="mt-8">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          No session on these dates
        </h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {club.skipped.map((s) => (
            <li
              key={s.date}
              className="rounded-md border border-dashed p-3 text-sm"
            >
              <span className="font-medium">{formatIsoDate(s.date)}</span>
              <span className="ml-2 text-muted-foreground">{s.reason}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

function ServerClock({ now }: { now: number | null }) {
  return (
    <div className="text-right text-xs text-muted-foreground">
      <div className="font-medium text-foreground/80">Our clock</div>
      <div className="tabular-nums">
        {now === null ? "--:--:-- ---" : formatServerClock(new Date(now))}
      </div>
    </div>
  );
}

function RegistrationPanel({
  club,
  state,
  now,
  locationSlug,
}: {
  club: Club;
  state: ClubRuntimeState | null;
  now: number | null;
  locationSlug: string;
}) {
  if (!state || now === null) {
    // The club's opensOffsetMs + seat counts tell us which shape the final
    // panel will take — no clock needed. Pick the matching skeleton so the
    // loading → ready transition doesn't shift the layout.
    return <RegistrationPanelSkeleton club={club} />;
  }
  // Route by the club's INITIAL shape (stable club property), not by the
  // live state.status. Critical: when the countdown ends, state.status flips
  // from "not_open" → "available", but we keep rendering the same
  // PreOpenPanel component so React reuses the same instance. The
  // RegistrationForm inside keeps its state (selected gamer, checked rules)
  // and the layout stays put. Swapping panel components here would unmount
  // the form and reset it.
  if (club.opensOffsetMs > 0) {
    return (
      <PreOpenPanel
        club={club}
        state={state}
        now={now}
        locationSlug={locationSlug}
      />
    );
  }
  if (state.status === "full") {
    return <WaitlistPanel club={club} locationSlug={locationSlug} />;
  }
  return <OpenPanel club={club} state={state} locationSlug={locationSlug} />;
}

function RegistrationPanelSkeleton({ club }: { club: Club }) {
  if (club.opensOffsetMs > 0) return <NotOpenSkeleton />;
  const seatsRemaining = Math.max(0, club.seatCount - club.seatsTaken);
  if (seatsRemaining <= 0) return <WaitlistSkeleton club={club} />;
  const almostFull =
    seatsRemaining <= Math.max(1, Math.ceil(club.seatCount * 0.2));
  return <OpenSkeleton almostFull={almostFull} />;
}

function NotOpenSkeleton() {
  const zero = { done: false, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  return (
    <Card className="overflow-hidden" aria-busy="true">
      <div className="bg-muted px-6 py-3 text-center text-sm font-semibold text-muted-foreground">
        Registration opens in
      </div>
      <CardContent className="space-y-5 p-6">
        <div className="invisible">
          <CountdownClock countdown={zero} />
        </div>
        <p className="invisible text-center text-xs text-muted-foreground">
          placeholder for opens-at date
        </p>
        <RegistrationFormSkeleton
          idleLabel="Not yet open"
          helperText={PRE_OPEN_HELPER_TEXT}
        />
        <SeatCounterSkeleton />
      </CardContent>
    </Card>
  );
}

function OpenSkeleton({ almostFull }: { almostFull: boolean }) {
  return (
    <Card
      className={
        almostFull
          ? "overflow-hidden border-warning"
          : "overflow-hidden border-primary"
      }
      aria-busy="true"
    >
      <div
        className={`px-6 py-3 text-center text-sm font-semibold ${
          almostFull
            ? "bg-warning text-warning-foreground"
            : "bg-primary text-primary-foreground"
        }`}
      >
        {almostFull
          ? "Going fast — only a few seats left"
          : "Registration is open"}
      </div>
      <CardContent className="space-y-5 p-6">
        <SeatCounterSkeleton large />
        <RegistrationFormSkeleton idleLabel="Register now →" />
      </CardContent>
    </Card>
  );
}

function WaitlistSkeleton({ club }: { club: Club }) {
  return (
    <Card className="overflow-hidden border-destructive/60" aria-busy="true">
      <div className="bg-destructive px-6 py-3 text-center text-sm font-semibold text-destructive-foreground">
        Fully booked
      </div>
      <CardContent className="space-y-5 p-6">
        <div className="text-center">
          <div className="text-4xl font-bold tabular-nums">
            {club.waitlistCount}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            families currently on the waitlist · you&apos;d be #
            {club.waitlistCount + 1}
          </p>
        </div>
        <RegistrationFormSkeleton
          idleLabel="Join the waitlist"
          variant="secondary"
        />
        <div className="space-y-2 rounded-md border bg-muted/30 p-4 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">
              How the waitlist works:
            </span>
          </p>
          <ul className="list-disc space-y-1 pl-4">
            <li>You keep your spot in line for the whole term.</li>
            <li>
              If a family cancels or their child stops attending, the next
              person on the list is offered the seat.
            </li>
            <li>
              You&apos;ll get an email and WhatsApp message with a short window
              to accept.
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function RegistrationFormSkeleton({
  idleLabel,
  variant = "default",
  helperText,
}: {
  idleLabel: string;
  variant?: "default" | "secondary";
  helperText?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold">Who are you registering?</h3>
        {helperText && (
          <p className="mt-1 text-xs text-muted-foreground">{helperText}</p>
        )}
        <div className="mt-3 space-y-2">
          {MOCK_GAMERS.map((g) => (
            <div
              key={g.id}
              className="h-[38px] rounded-md border border-input bg-muted/20"
            />
          ))}
          <div className="h-[38px] rounded-md border border-dashed border-input" />
        </div>
      </div>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" className="mt-0.5" disabled />
        <span className="text-muted-foreground">
          I agree to the club&apos;s code of conduct and understand that
          repeated unexcused absences may open my child&apos;s seat for the
          next family on the waitlist.
        </span>
      </label>
      <Button
        size="lg"
        variant={variant}
        disabled
        className="w-full text-base"
      >
        {idleLabel}
      </Button>
    </div>
  );
}

function SeatCounterSkeleton({ large = false }: { large?: boolean }) {
  return (
    <div className="invisible">
      <div className="flex items-baseline justify-between">
        <span
          className={`font-bold tabular-nums ${large ? "text-3xl" : "text-xl"}`}
        >
          0
        </span>
        <span className="text-xs text-muted-foreground">placeholder</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-muted" />
    </div>
  );
}

function PreOpenPanel({
  club,
  state,
  now,
  locationSlug,
}: {
  club: Club;
  state: ClubRuntimeState;
  now: number;
  locationSlug: string;
}) {
  const router = useRouter();
  const cd = buildCountdown(state.opensAt, now);
  const isOpen = cd.done;

  function handleRegister(gamerName: string) {
    const query = new URLSearchParams({ status: "registered", gamer: gamerName });
    router.push(`/registration/${locationSlug}/${club.id}/confirmed?${query.toString()}`);
  }

  return (
    <Card className={`overflow-hidden ${isOpen ? "border-primary" : ""}`}>
      {/* Banner keeps identical text-sm sizing in both states so the flip from
          countdown → open doesn't push the content (and the submit button)
          down a few pixels under the user's cursor. */}
      <div
        className={`px-6 py-3 text-center text-sm font-semibold ${
          isOpen
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {isOpen ? "Registration is OPEN" : "Registration opens in"}
      </div>
      <CardContent className="space-y-5 p-6">
        <CountdownClock countdown={cd} />
        <p className="text-center text-xs text-muted-foreground">
          {formatWhen(state.opensAt)}
        </p>
        <RegistrationForm
          club={club}
          canSubmit={isOpen}
          idleLabel={isOpen ? "Register now →" : "Not yet open"}
          readyLabel={isOpen ? "Register now →" : "Ready — waiting for open"}
          // Constant across the cd.done transition so the paragraph doesn't
          // disappear and push the submit button up under the user's cursor.
          helperText={PRE_OPEN_HELPER_TEXT}
          onSubmit={handleRegister}
        />
        <SeatCounter club={club} seatsRemaining={state.seatsRemaining} />
      </CardContent>
    </Card>
  );
}

function OpenPanel({
  club,
  state,
  locationSlug,
}: {
  club: Club;
  state: ClubRuntimeState;
  locationSlug: string;
}) {
  const router = useRouter();
  const urgent = state.status === "almost_full";

  function handleRegister(gamerName: string) {
    const query = new URLSearchParams({ status: "registered", gamer: gamerName });
    router.push(`/registration/${locationSlug}/${club.id}/confirmed?${query.toString()}`);
  }

  return (
    <Card className={urgent ? "overflow-hidden border-warning" : "overflow-hidden border-primary"}>
      <div
        className={`px-6 py-3 text-center text-sm font-semibold ${
          urgent
            ? "bg-warning text-warning-foreground"
            : "bg-primary text-primary-foreground"
        }`}
      >
        {urgent ? "Going fast — only a few seats left" : "Registration is open"}
      </div>
      <CardContent className="space-y-5 p-6">
        <SeatCounter club={club} seatsRemaining={state.seatsRemaining} large />
        <RegistrationForm
          club={club}
          canSubmit={true}
          idleLabel="Register now →"
          readyLabel="Register now →"
          onSubmit={handleRegister}
        />
      </CardContent>
    </Card>
  );
}

function WaitlistPanel({
  club,
  locationSlug,
}: {
  club: Club;
  locationSlug: string;
}) {
  const router = useRouter();

  function handleJoin(gamerName: string) {
    const query = new URLSearchParams({
      status: "waitlisted",
      gamer: gamerName,
      position: String(club.waitlistCount + 1),
    });
    router.push(`/registration/${locationSlug}/${club.id}/confirmed?${query.toString()}`);
  }

  return (
    <Card className="overflow-hidden border-destructive/60">
      <div className="bg-destructive px-6 py-3 text-center text-sm font-semibold text-destructive-foreground">
        Fully booked
      </div>
      <CardContent className="space-y-5 p-6">
        <div className="text-center">
          <div className="text-4xl font-bold tabular-nums">
            {club.waitlistCount}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            families currently on the waitlist · you&apos;d be #{club.waitlistCount + 1}
          </p>
        </div>
        <RegistrationForm
          club={club}
          canSubmit={true}
          idleLabel="Join the waitlist"
          readyLabel="Join the waitlist"
          variant="secondary"
          onSubmit={handleJoin}
        />
        <div className="space-y-2 rounded-md border bg-muted/30 p-4 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">How the waitlist works:</span>
          </p>
          <ul className="list-disc space-y-1 pl-4">
            <li>You keep your spot in line for the whole term.</li>
            <li>
              If a family cancels or their child stops attending, the next
              person on the list is offered the seat.
            </li>
            <li>
              You&apos;ll get an email and WhatsApp message with a short window to accept.
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// Shared inline registration form: gamer picker + rules checkbox + submit
// button. The parent decides whether the button can fire (canSubmit) and the
// label to use when the form is empty vs. ready. Keeps the "one-click at
// open" promise — the submit button IS the registration, no navigation to a
// separate form.
function RegistrationForm({
  club,
  canSubmit,
  idleLabel,
  readyLabel,
  helperText,
  variant = "default",
  onSubmit,
}: {
  club: Club;
  canSubmit: boolean;
  idleLabel: string;
  readyLabel: string;
  helperText?: string;
  variant?: "default" | "secondary";
  onSubmit: (gamerName: string) => void;
}) {
  const [gamerId, setGamerId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAge, setNewAge] = useState("");
  const [agreed, setAgreed] = useState(false);

  const hasGamer =
    (gamerId !== null && !addingNew) || (addingNew && newName.trim().length > 0);
  const formReady = hasGamer && agreed;
  const clickable = formReady && canSubmit;

  function handleClick() {
    if (!clickable) return;
    const name = addingNew
      ? newName.trim()
      : (MOCK_GAMERS.find((g) => g.id === gamerId)?.name ?? "your child");
    onSubmit(name);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold">Who are you registering?</h3>
        {helperText && (
          <p className="mt-1 text-xs text-muted-foreground">{helperText}</p>
        )}
        <div className="mt-3 space-y-2">
          {MOCK_GAMERS.map((g) => {
            const selected = gamerId === g.id && !addingNew;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setGamerId(g.id);
                  setAddingNew(false);
                }}
                className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-input hover:bg-muted/60"
                }`}
              >
                <span>
                  <span className="font-medium">{g.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    Age {g.age}
                  </span>
                </span>
                {selected && (
                  <span className="text-xs font-semibold text-primary">
                    Selected
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setAddingNew((v) => !v);
              setGamerId(null);
            }}
            className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
              addingNew
                ? "border-primary bg-primary/10"
                : "border-dashed border-input text-muted-foreground hover:bg-muted/40"
            }`}
          >
            + Add another child
          </button>
        </div>
        {addingNew && (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_80px]">
            <div className="space-y-1">
              <Label htmlFor="new-name" className="text-xs">
                Name
              </Label>
              <Input
                id="new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-age" className="text-xs">
                Age
              </Label>
              <Input
                id="new-age"
                type="number"
                min={club.minAge}
                max={club.maxAge}
                value={newAge}
                onChange={(e) => setNewAge(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span className="text-muted-foreground">
          I agree to the club&apos;s code of conduct and understand that
          repeated unexcused absences may open my child&apos;s seat for the
          next family on the waitlist.
        </span>
      </label>

      <Button
        size="lg"
        variant={variant}
        className="w-full text-base"
        disabled={!clickable}
        onClick={handleClick}
      >
        {formReady ? readyLabel : idleLabel}
      </Button>
    </div>
  );
}

function CountdownClock({ countdown }: { countdown: ReturnType<typeof buildCountdown> }) {
  const urgent = !countdown.done && countdown.totalMs < 60 * 60 * 1000;
  return (
    <div
      className={`flex items-center justify-center gap-2 text-center ${
        urgent ? "text-warning" : "text-foreground"
      }`}
    >
      <Unit n={countdown.days} label="days" />
      <Colon />
      <Unit n={countdown.hours} label="hrs" />
      <Colon />
      <Unit n={countdown.minutes} label="min" />
      <Colon />
      <Unit n={countdown.seconds} label="sec" />
    </div>
  );
}

function Unit({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="rounded-md bg-muted px-3 py-2 text-2xl font-bold tabular-nums sm:text-3xl">
        {pad2(n)}
      </div>
      <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Colon() {
  return <span className="pb-5 text-2xl font-bold text-muted-foreground">:</span>;
}

function SeatCounter({
  club,
  seatsRemaining,
  large = false,
}: {
  club: Club;
  seatsRemaining: number;
  large?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (seatsRemaining / club.seatCount) * 100));
  const barColor =
    seatsRemaining === 0
      ? "bg-destructive"
      : seatsRemaining <= Math.ceil(club.seatCount * 0.2)
        ? "bg-warning"
        : "bg-success";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className={`font-bold tabular-nums ${large ? "text-3xl" : "text-xl"}`}>
          {seatsRemaining}
        </span>
        <span className="text-xs text-muted-foreground">
          of {club.seatCount} seats remaining
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-[width] duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
