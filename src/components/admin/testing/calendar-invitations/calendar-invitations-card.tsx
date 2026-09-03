"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { CalendarCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/api-error";
import {
  INVITATION_METHOD_OPTIONS,
  INVITATION_REMINDERS,
  INVITATION_SHAPES,
  canStateAsRule,
  type InvitationMethodOption,
  type InvitationReminder,
  type InvitationShape,
} from "@/lib/calendar-invitations/options";
import { cn, findOption, formatDate } from "@/lib/utils";
import { useCalendarFeedSandbox } from "@/services/calendar-feed";
import {
  useSendCalendarInvitation,
  type CalendarInvitationResponse,
} from "@/services/calendar-invitations";
import { useAuth } from "@/providers";
import {
  SectionHeading,
  SwappableLabel,
  selectClass,
} from "../calendar-feed/shared";

/**
 * The calendar-invitation card: the second of the two designs under comparison.
 *
 * The feed card above publishes a document and waits for a vendor to poll it.
 * This one *sends* — one invitation per product per gamer, an update when the
 * schedule moves, a cancellation when the seat ends — which is a different
 * bargain: the family gets an entry that arrives immediately and can be
 * declined, and we take on remembering what we have already said about it.
 *
 * The two share a family on purpose. The seats offered here are the sandbox
 * family's, edited in the card above, so an admin can change a product's slots
 * there and then send an update here and watch one calendar entry move.
 */

/** Which action is in flight, held from the click until the answer lands. */
type Committing = "preview" | "send" | "update" | "cancel" | null;

/**
 * The viewer's own zone, for the one clock face on this card.
 *
 * It does not exist on the server, so reading it during render is a hydration
 * mismatch, and it never changes, so there is nothing to subscribe to —
 * `useSyncExternalStore` is exactly that shape. Cached at module scope because
 * the hook requires a referentially stable snapshot.
 */
let cachedTimeZone: string | null = null;

function readTimeZone(): string {
  cachedTimeZone ??= Intl.DateTimeFormat().resolvedOptions().timeZone;
  return cachedTimeZone;
}

const subscribeToNothing = () => () => undefined;
const noTimeZone = () => null;

function useViewerTimeZone(): string | null {
  return useSyncExternalStore(subscribeToNothing, readTimeZone, noTimeZone);
}

interface SeatChoice {
  id: string;
  label: string;
}

export function CalendarInvitationsCard() {
  const t = useTranslations("admin.testing.calendarInvitations");
  const locale = useLocale();
  const { profile } = useAuth();
  const timeZone = useViewerTimeZone();

  // The same query the feed card reads, not a second one: two reads of one row
  // would be two answers, and the status line here would be free to describe a
  // document the editor above is not showing.
  const sandbox = useCalendarFeedSandbox();
  const send = useSendCalendarInvitation();

  const [participationId, setParticipationId] = useState("");
  const [to, setTo] = useState(profile?.email ?? "");
  const [shape, setShape] = useState<InvitationShape>("series");
  const [reminder, setReminder] = useState<InvitationReminder>("60");
  const [method, setMethod] = useState<InvitationMethodOption>("request");
  const [committing, setCommitting] = useState<Committing>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [result, setResult] = useState<CalendarInvitationResponse | null>(null);

  const definition = sandbox.data?.definition ?? null;
  /** Whether the sandbox read has answered — a failed read has not. */
  const loaded = sandbox.data !== undefined;

  const seats: readonly SeatChoice[] = useMemo(() => {
    if (definition === null) return [];
    const gamers = new Map(definition.gamers.map((g) => [g.id, g.firstName]));
    const products = new Map(definition.products.map((p) => [p.id, p.name]));
    return definition.participations.flatMap((participation) => {
      if (participation.status !== "active") return [];
      const gamer = gamers.get(participation.gamerId);
      const product = products.get(participation.productId);
      if (gamer === undefined || product === undefined) return [];
      return [{ id: participation.id, label: t("seatLine", { gamer, product }) }];
    });
  }, [definition, t]);

  // Whatever the select shows is what the actions act on: an unset value would
  // let a click send an invitation for a seat nobody chose, and the first seat
  // is what the browser is already displaying.
  const selectedId = participationId === "" ? (seats[0]?.id ?? "") : participationId;
  const record = definition?.invitations?.[selectedId];
  const hasOpenInvitation = record !== undefined && record.lastMethod !== "CANCEL";

  /**
   * Whether a weekly rule could state the selected seat's schedule.
   *
   * Answered here from the document the card already holds, through the same
   * predicate the builder refuses with, so the option this card offers and the
   * request the route accepts cannot come apart. A seat that is not in the
   * document yet (the read has not landed) is treated as statable: the option
   * list must not flicker while a small indexed read resolves, and the route
   * still refuses if it turns out otherwise.
   */
  const ruleAvailable = useMemo(() => {
    if (definition === null || selectedId === "") return true;
    const seat = definition.participations.find(
      (participation) => participation.id === selectedId,
    );
    const product = definition.products.find(
      (candidate) => candidate.id === seat?.productId,
    );
    if (product === undefined) return true;
    return canStateAsRule(product.slots);
  }, [definition, selectedId]);

  /**
   * The shape the actions actually send.
   *
   * A seat whose sessions differ in time or length has no rule form, and the
   * select shows that option disabled — so the value it would otherwise be
   * holding falls through to the list, rather than sending a request the route
   * is going to refuse.
   */
  const effectiveShape: InvitationShape =
    shape === "series" && !ruleAvailable ? "occurrences" : shape;

  const errorMessage =
    send.error === null
      ? null
      : send.error instanceof ApiError && send.error.status === 503
        ? t("smtpNotConfigured")
        : send.error.message;

  function run(action: Committing, preview: boolean) {
    if (action === null || selectedId === "") return;
    // Set synchronously, before any render caused by the mutation: React
    // Query's `isPending` flips false one dispatch before `onSuccess` runs, and
    // nothing here unloads the page to cover the gap.
    setCommitting(action);
    setResult(null);
    send.mutate(
      {
        action: action === "preview" ? "send" : action,
        participationId: selectedId,
        to,
        shape: effectiveShape,
        reminder,
        method,
        preview,
      },
      {
        onSuccess: (data) => setResult(data),
        // Nothing navigates and nothing unmounts, so every outcome — success
        // included — has to clear the flag itself.
        onSettled: () => setCommitting(null),
      },
    );
  }

  const busy = committing !== null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5" />
          <CardTitle>{t("title")}</CardTitle>
        </div>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* --- 1. Which seat --- */}
        <div className="space-y-3">
          <SectionHeading>{t("participationHeading")}</SectionHeading>
          <p className="text-sm text-muted-foreground">
            {t("participationHint")}
          </p>
          {/* The select is rendered empty until the read lands, rather than
              standing something else in its place: this is a small indexed
              read of one row, so it arrives in a frame or two, and a field that
              is already its final size means nothing below it moves when the
              seats appear. The "no seats" line waits for data — before it
              arrives there is nothing to say that about, and saying it early
              would be replacing a sentence with a control. */}
          {loaded && seats.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noParticipations")}
            </p>
          ) : (
            <Field label={t("participationLabel")} htmlFor="invitation-seat">
              <select
                id="invitation-seat"
                className={selectClass}
                value={selectedId}
                onChange={(event) => setParticipationId(event.target.value)}
              >
                {seats.map((seat) => (
                  <option key={seat.id} value={seat.id}>
                    {seat.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {/* --- 2. Where it goes --- */}
        <div className="space-y-3">
          <SectionHeading>{t("recipientHeading")}</SectionHeading>
          <Field label={t("recipientLabel")} htmlFor="invitation-to">
            <Input
              id="invitation-to"
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder={t("recipientPlaceholder")}
            />
          </Field>
        </div>

        {/* --- 3. Options --- */}
        <div className="space-y-3">
          <SectionHeading>{t("optionsHeading")}</SectionHeading>
          {/* Admin surfaces are desktop-default, so the knobs use the width. */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* The unavailable rule says so in its own option label rather
                than in a sentence that appears beside the select: the label is
                already on screen at its final size, so a seat whose schedule a
                rule cannot state changes what the list says without moving
                anything below it. */}
            <EnumField
              id="invitation-shape"
              label={t("shapeLabel")}
              value={effectiveShape}
              values={INVITATION_SHAPES}
              optionLabel={(value) =>
                value === "series" && !ruleAvailable
                  ? t("shapeOptionUnavailable", {
                      option: t(`shapeOptions.${value}`),
                    })
                  : t(`shapeOptions.${value}`)
              }
              optionDisabled={(value) => value === "series" && !ruleAvailable}
              onPick={setShape}
            />
            <EnumField
              id="invitation-reminder"
              label={t("reminderLabel")}
              value={reminder}
              values={INVITATION_REMINDERS}
              optionLabel={(value) => t(`reminderOptions.${value}`)}
              onPick={setReminder}
            />
            <EnumField
              id="invitation-method"
              label={t("methodLabel")}
              value={method}
              values={INVITATION_METHOD_OPTIONS}
              optionLabel={(value) => t(`methodOptions.${value}`)}
              onPick={setMethod}
            />
          </div>
          <p className="text-sm text-muted-foreground">{t("shapeHint")}</p>
        </div>

        {/* --- 4. What has already been said --- */}
        <div className="space-y-3">
          <SectionHeading>{t("statusHeading")}</SectionHeading>
          {/* One line's height whether or not there is a line, so the actions
              below never move when a send lands. */}
          <p className="min-h-5 text-sm text-muted-foreground">
            {record === undefined || timeZone === null
              ? t("statusNone")
              : record.lastMethod === "CANCEL"
                ? t("statusCancelled", {
                    when: formatDate(record.lastSentAt, locale, {
                      timeZone,
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZoneName: "short",
                    }),
                  })
                : t("statusSent", {
                    sequence: record.sequence,
                    recipient: record.recipient,
                    when: formatDate(record.lastSentAt, locale, {
                      timeZone,
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZoneName: "short",
                    }),
                  })}
          </p>
        </div>

        {/* The action row, authored DOM-order [negative…, affirmative]: sending
            the invitation is what this card exists to do, so it is the last
            child — rightmost in a row and topmost once the row stacks. The
            cancellation sits between the two ends because it is neither the
            way out nor the thing being asked for. */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={busy || selectedId === ""}
            onClick={() => run("preview", true)}
          >
            <SwappableLabel
              label={t("preview")}
              alternate={t("working")}
              showingAlternate={committing === "preview"}
            />
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !hasOpenInvitation}
            onClick={() => setConfirmingCancel(true)}
          >
            <SwappableLabel
              label={t("sendCancellation")}
              alternate={t("working")}
              showingAlternate={committing === "cancel"}
            />
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !hasOpenInvitation}
            onClick={() => run("update", false)}
          >
            <SwappableLabel
              label={t("sendUpdate")}
              alternate={t("working")}
              showingAlternate={committing === "update"}
            />
          </Button>
          <Button
            type="button"
            disabled={busy || selectedId === ""}
            onClick={() => run("send", false)}
          >
            <SwappableLabel
              label={t("send")}
              alternate={t("working")}
              showingAlternate={committing === "send"}
            />
          </Button>
        </div>

        {/* --- 5. What came back ---
            The sandbox read's failure banner sits down here rather than in the
            seat section it reads as belonging to, for the same reason the feed
            card puts its own at the end: it arrives on a round trip's own
            schedule, and a banner inserted above the recipient, the options and
            the actions would push all three down the viewport. At the end it
            grows the card downward and nothing painted moves. */}
        {sandbox.error !== null && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {sandbox.error.message}
          </div>
        )}
        {errorMessage !== null && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        )}
        {result !== null && (
          <div className="rounded-md bg-success/10 p-3 text-sm text-success">
            {result.messageId === null
              ? t("previewedNotSent")
              : t("sentSuccess", { messageId: result.messageId })}
          </div>
        )}

        {/* A property of the document that came back, so it lands with it, at
            the end of the card where a late arrival grows the card downward
            and nothing already painted moves. */}
        {result !== null && result.usesPeriodRdates && (
          <div className="rounded-md bg-warning/10 p-3 text-sm text-warning">
            {t("periodEntriesHint")}
          </div>
        )}

        {result !== null && (
          <details className="rounded-md border border-border">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              {t("rawHeading")}
            </summary>
            <div className="space-y-4 border-t border-border p-4">
              <div>
                <SectionHeading>{t("subjectLabel")}</SectionHeading>
                <p className="min-h-5 text-sm">{result.subject}</p>
              </div>
              <div>
                <SectionHeading>{t("calendarPartLabel")}</SectionHeading>
                {/* Fixed height, so a longer document does not push the frame
                    below it down when a second send lands. */}
                <pre className="mt-2 h-64 overflow-auto rounded bg-muted p-3 font-mono text-xs">
                  {result.ical}
                </pre>
              </div>
              <div>
                <SectionHeading>{t("mailLabel")}</SectionHeading>
                {/* Sandboxed, and `allow-same-origin` is load-bearing rather
                    than a relaxation: scripts stay off (without
                    `allow-scripts` nothing in here can run), while the origin
                    is what the inherited CSP's `img-src 'self'` is matched
                    against — an opaque origin would block the mail's own brand
                    mark. */}
                <div className="mt-2 h-[min(480px,60vh)] overflow-hidden rounded-md border border-border bg-background">
                  <iframe
                    title={t("mailLabel")}
                    srcDoc={result.html}
                    sandbox="allow-same-origin"
                    className="block h-full w-full border-0"
                  />
                </div>
              </div>
            </div>
          </details>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        title={t("confirmCancelTitle")}
        description={t("confirmCancelDescription")}
        confirmLabel={t("sendCancellation")}
        onConfirm={() => run("cancel", false)}
      />
    </Card>
  );
}

/**
 * One option, as a select over a fixed value list.
 *
 * Generic in the *value* rather than in the option key, which is what keeps it
 * free of casts: `values` fixes `V`, `findOption` narrows the browser's plain
 * string back to it, and `onPick` receives the union the caller's state is
 * already declared as.
 */
function EnumField<V extends string>({
  id,
  label,
  value,
  values,
  optionLabel,
  optionDisabled,
  onPick,
}: {
  id: string;
  label: string;
  value: V;
  values: readonly V[];
  optionLabel: (value: V) => string;
  /** Which values this field currently cannot offer. All of them, by default. */
  optionDisabled?: (value: V) => boolean;
  onPick: (value: V) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        className={cn(selectClass)}
        value={value}
        onChange={(event) => {
          const picked = findOption(values, event.target.value);
          if (picked !== undefined) onPick(picked);
        }}
      >
        {values.map((option) => (
          <option
            key={option}
            value={option}
            disabled={optionDisabled?.(option) ?? false}
          >
            {optionLabel(option)}
          </option>
        ))}
      </select>
    </Field>
  );
}
