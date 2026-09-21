"use client";

import {
  useId,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { StatusLine } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { SUBSTITUTION_REASON_NOTE_MAX_LENGTH } from "@/services/session-substitution";
import type {
  SubstitutionRequestState,
  GeduAssignmentRole,
  SessionStaffing,
} from "@/lib/session-staffing";
import { cn, formatDateOnly } from "@/lib/utils";
import { Constants, type SubstitutionReason } from "@/types";
import {
  SessionCardMenu,
  type SessionCardMenuItem,
} from "@/components/gedu/session-feed";
import {
  GeduPickerSheet,
  type GeduPickerUnavailability,
} from "./gedu-picker-sheet";

/** What an admin decided, in the shape {@link SessionStaffingEditorProps.onSetSubstitution} takes. */
export interface SetSessionSubstitutionDraft {
  absentGeduId: string;
  subGeduId: string;
  /** Omitted rather than nulled — the RPC's parameter carries a default. */
  reason?: SubstitutionReason;
  reasonNote?: string;
}

export interface SessionStaffingEditorProps {
  /** The derivation for this one session — who is expected, what is outstanding. */
  staffing: SessionStaffing;
  /** Product-local `YYYY-MM-DD`: the session being staffed, as Postgres keys it. */
  sessionDate: string;
  /**
   * Seat a sub. **Resolves only once the document this card is built from has
   * been read again**, which is what lets the control below clear its
   * committing flag without re-enabling over stale staffing; rejects if the
   * write did not land.
   */
  onSetSubstitution: (draft: SetSessionSubstitutionDraft) => Promise<void>;
  /** Unseat one request's sub. Resolves and rejects on the same terms. */
  onClearSubstitution: (requestId: string) => Promise<void>;
  /** "Attending after all." Resolves and rejects on the same terms. */
  onWithdrawRequest: (requestId: string) => Promise<void>;
}

/**
 * The staffing an **admin** may edit on one session card — the office's half of
 * the substitution model, and the only surface where a sub is seated without an
 * offer.
 *
 * It is the node the admin group shell hands the shared session card through
 * `renderStaffingEditor`, and it lands in the same region as the gedu's own "I
 * can't make this session": the two are different answers to one question, and
 * the region's rule is that a surface declares its powers by what it supplies.
 * A gedu shell supplies the callbacks and no editor; this one supplies the
 * editor and no callbacks.
 *
 * **Every entry gets one, past and future alike.** The retroactive path is the
 * point of the admin editor: an off-platform substitution on a session that already
 * ran has to be recordable, because gedu invoicing reads who actually worked.
 * So nothing here consults a clock — the database's admin writers carry no
 * today-or-later guard, and a second date test in the browser would only be a
 * second answer free to disagree with it.
 *
 * **It is the same `⋯` a gedu's card carries**, and that is the owner's
 * decision rather than a convenience *(owner, 2026-09)*: one idiom for "what
 * else can I do with this session", whoever is looking. The visible buttons it
 * replaces spent a band of every admin card on actions that are rare even for
 * the office, and the card is shorter for losing them.
 *
 * **The names ride the labels where a session has more than one empty seat.**
 * The staffing note prints who is away, but a menu row reading "Clear
 * substitute" on a card with two absent gedus could not say whose, so with more
 * than one seat every row names its own.
 *
 * Where nobody is due and nobody has filed there is no action to offer, so the
 * menu is absent and the line saying why stands alone — an admin pressing it
 * would have reached a dialog that could not name an absent gedu.
 */
export function SessionStaffingEditor({
  staffing,
  sessionDate,
  onSetSubstitution,
  onClearSubstitution,
  onWithdrawRequest,
}: SessionStaffingEditorProps) {
  const t = useTranslations("admin.products.staffing");
  const [flow, setFlow] = useState<SetSubFlow | null>(null);
  const [pending, setPending] = useState<PendingRequestAction | null>(null);

  const seats = absentSeats(staffing);
  const noSeat = seats.length === 0;
  const openPicker = (seat: AbsentSeat) =>
    setFlow({ step: "picker", absent: seat, sub: null });

  /**
   * The seats something has actually been filed on — which is what decides
   * whether a row has to name the person it acts on.
   *
   * **It is the requests rather than the seats.** A seated substitute is
   * themselves expected, so a session with one absence has two seats and would
   * otherwise name every row on a card with only one thing going on. What a
   * reader can confuse is two *rows* acting on two different people, and that
   * is exactly when there is more than one live request.
   */
  const live = seats.filter((seat) => seat.request !== null);
  const named = live.length > 1;
  /**
   * The one seat whose substitute the top row would change: where a single
   * request has been answered, that row says so rather than offering to set a
   * substitute the session already has.
   */
  const onlyAnswered =
    live.length === 1 && live[0].request?.status === "substituted"
      ? live[0]
      : null;

  const items: SessionCardMenuItem[] = [];
  if (!noSeat) {
    items.push(
      onlyAnswered !== null
        ? {
            key: "set",
            label: t("changeSubstitute"),
            onSelect: () => openPicker(onlyAnswered),
          }
        : {
            key: "set",
            label: t("setSubstitute"),
            // One seat is not a question — the flow's first step exists only
            // to name which of several is empty, and with one it is known.
            onSelect: () =>
              setFlow(
                seats.length === 1
                  ? { step: "picker", absent: seats[0], sub: null }
                  : { step: "absent", absent: null, sub: null },
              ),
          },
    );
  }
  for (const seat of live) {
    const request = seat.request;
    if (request === null) continue;
    const name = seat.firstName;
    if (request.status === "substituted") {
      // Where several seats are out, each needs its own way straight to the
      // picker; where one is, the row above is already that way in.
      if (named) {
        items.push({
          key: `change:${request.id}`,
          label: t("changeSubstituteFor", { name }),
          onSelect: () => openPicker(seat),
        });
      }
      items.push({
        key: `clear:${request.id}`,
        label: named ? t("clearSubstituteFor", { name }) : t("clearSubstitute"),
        onSelect: () => setPending({ kind: "clear", request }),
      });
      continue;
    }
    items.push({
      key: `withdraw:${request.id}`,
      label: named ? t("withdrawRequestFor", { name }) : t("withdrawRequest"),
      onSelect: () => setPending({ kind: "withdraw", request }),
    });
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {noSeat && (
        <span className="text-xs text-muted-foreground">
          {t("nobodyExpectedHint")}
        </span>
      )}
      <SessionCardMenu label={t("menuLabel")} items={items} />

      {flow !== null && (
        <SetSubFlowOverlays
          flow={flow}
          setFlow={setFlow}
          staffing={staffing}
          seats={seats}
          sessionDate={sessionDate}
          onSetSubstitution={onSetSubstitution}
        />
      )}

      {pending !== null && (
        <RequestActionDialog
          pending={pending}
          sessionDate={sessionDate}
          onClose={() => setPending(null)}
          onConfirm={
            pending.kind === "clear" ? onClearSubstitution : onWithdrawRequest
          }
        />
      )}
    </div>
  );
}

/** Which of the two per-request writes is being confirmed, and on what. */
interface PendingRequestAction {
  kind: "clear" | "withdraw";
  request: SubstitutionRequestState;
}

/**
 * The confirm step in front of clearing a sub or withdrawing a request.
 *
 * **It holds**, because both writes change who is recorded as having worked a
 * session and the admin is usually answering somebody who is waiting on the
 * answer: a refusal has to be read in front of the button that caused it rather
 * than behind a dialog that has already gone.
 */
function RequestActionDialog({
  pending,
  sessionDate,
  onClose,
  onConfirm,
}: {
  pending: PendingRequestAction;
  sessionDate: string;
  onClose: () => void;
  onConfirm: (requestId: string) => Promise<void>;
}) {
  const t = useTranslations("admin.products.staffing");
  const date = useSessionDateLabel(sessionDate);

  const { kind, request } = pending;
  const sub = request.substituteId?.firstName ?? "";

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={kind === "clear" ? t("clearTitle") : t("withdrawTitle")}
      description={
        kind === "clear"
          ? t("clearBody", { sub, name: request.requestedBy.firstName, date })
          : t("withdrawBody", { name: request.requestedBy.firstName, date })
      }
      confirmLabel={kind === "clear" ? t("clearConfirm") : t("withdrawConfirm")}
      confirmVariant="default"
      holdWhileCommitting
      describeError={() =>
        kind === "clear" ? t("clearFailed") : t("withdrawFailed")
      }
      onConfirm={() => onConfirm(request.id)}
    />
  );
}

/**
 * Setting a sub, as a three-phase walk over one decision.
 *
 * `absent` and `confirm` are the dialog's two steps; `picker` is the sheet
 * between them. **The three are mutually exclusive on purpose** — the dialog is
 * closed while the sheet is open rather than sitting behind it — because the
 * two primitives answer Escape independently: the sheet is not in the dialogs'
 * register, so one keypress reaching both would take the half-finished dialog
 * down with the picker it opened.
 */
interface SetSubFlow {
  step: "absent" | "picker" | "confirm";
  /** Which seat is empty. Settled before the picker opens, so never null after it. */
  absent: AbsentSeat | null;
  /** The chosen sub, once the picker has closed on a selection. */
  sub: { id: string; firstName: string } | null;
}

function SetSubFlowOverlays({
  flow,
  setFlow,
  staffing,
  seats,
  sessionDate,
  onSetSubstitution,
}: {
  flow: SetSubFlow;
  /**
   * The state setter itself, rather than a plain callback, because one of the
   * transitions below has to read the value it is replacing — see the picker's
   * close handler.
   */
  setFlow: Dispatch<SetStateAction<SetSubFlow | null>>;
  staffing: SessionStaffing;
  seats: readonly AbsentSeat[];
  sessionDate: string;
  onSetSubstitution: (draft: SetSessionSubstitutionDraft) => Promise<void>;
}) {
  const t = useTranslations("admin.products.staffing");
  /**
   * The two optional answers, held for the whole walk rather than inside the
   * step that asks them.
   *
   * The dialog primitive renders nothing while it is closed, so a draft living
   * in the confirm step would be thrown away every time the admin went back to
   * change the sub — which is the one reason anybody walks back at all. This
   * component is mounted for the length of the flow and unmounted with it, so
   * the draft seeds itself cleanly for the next session's card without anything
   * clearing it.
   */
  const [reason, setReason] = useState<SubstitutionReason | null>(null);
  const [note, setNote] = useState("");
  const absent = flow.absent;

  return (
    <>
      <Dialog
        open={flow.step === "absent"}
        onOpenChange={(next) => {
          if (!next) setFlow(null);
        }}
      >
        <AbsentGeduStep
          seats={seats}
          sessionDate={sessionDate}
          initialId={absent?.id ?? null}
          onCancel={() => setFlow(null)}
          onChoose={(gedu) =>
            setFlow({ step: "picker", absent: gedu, sub: flow.sub })
          }
        />
      </Dialog>

      <GeduPickerSheet
        open={flow.step === "picker"}
        onOpenChange={(next) => {
          if (next) return;
          // **A selection closes the sheet too**, and it does so in the same
          // event, one line after it has moved the flow on to the confirm step.
          // So this reads the value it is replacing and stands down unless the
          // picker is still the step — otherwise a plain `setFlow` here would
          // undo the very choice that triggered it.
          //
          // A genuine close goes back to the question it came from, and cancels
          // outright where there was no question: a single-seat session opens
          // the picker directly, so there is nothing behind it.
          setFlow((current) => {
            if (current === null || current.step !== "picker") return current;
            return seats.length > 1 ? { ...current, step: "absent" } : null;
          });
        }}
        title={t("pickerTitle")}
        description={t("pickerDescription", { name: absent?.firstName ?? "" })}
        unavailable={buildUnavailability(staffing, absent?.id ?? null)}
        onSelect={(gedu) =>
          setFlow({
            step: "confirm",
            absent,
            sub: { id: gedu.id, firstName: gedu.first_name },
          })
        }
      />

      <Dialog
        open={flow.step === "confirm"}
        onOpenChange={(next) => {
          if (!next) setFlow(null);
        }}
      >
        {absent !== null && flow.sub !== null && (
          <ConfirmSubStep
            absent={absent}
            sub={flow.sub}
            sessionDate={sessionDate}
            reason={reason}
            onReasonChange={setReason}
            note={note}
            onNoteChange={setNote}
            onChangeSub={() => setFlow({ ...flow, step: "picker" })}
            onCancel={() => setFlow(null)}
            onConfirm={async (draft) => {
              await onSetSubstitution(draft);
              setFlow(null);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

/**
 * **Why the picker will not take a candidate, for this session.**
 *
 * Two reasons and no more, which is exactly the shape the sheet's own prop
 * takes: the gedu being substituted is `absent`, and anybody else already due at
 * this session is `expected` — seating one of them as somebody else's sub would
 * collapse two seats onto one person and make "who did which job" unanswerable.
 * Certification is the sheet's own refusal and is not restated here.
 */
function buildUnavailability(
  staffing: SessionStaffing,
  absentId: string | null,
): ReadonlyMap<string, GeduPickerUnavailability> {
  const map = new Map<string, GeduPickerUnavailability>();
  for (const gedu of staffing.expected) {
    map.set(gedu.id, gedu.id === absentId ? "absent" : "expected");
  }
  // The absent gedu is not always one of the expected: a seat that has already
  // filed is a seat this editor may still act on, and it is exactly the one
  // nobody may be seated as a sub for.
  if (absentId !== null) map.set(absentId, "absent");
  return map;
}

/**
 * A seat this session's staffing may be edited **for** — somebody whose place
 * a sub could be put in.
 *
 * It is not the same set as "expected", and the difference is the whole of what
 * the two context lines on the confirm step are about. A gedu who has already
 * filed is no longer expected — that is the derivation's own sentence — but
 * their seat is still the one an admin answers, by approving the open request
 * or by replacing the sub already in it. So the seats are the expected gedus
 * *plus* everyone holding a live request, which is precisely the set the
 * database's own writer accepts: it demands the absent gedu be expected only
 * where there is no substitution request in place.
 */
interface AbsentSeat {
  id: string;
  firstName: string;
  /** The pay class the substitution is for — the assignment's, or the request's. */
  role: GeduAssignmentRole;
  /** The live request on this seat, where one has been filed. */
  request: SubstitutionRequestState | null;
}

function absentSeats(staffing: SessionStaffing): readonly AbsentSeat[] {
  const seats = new Map<string, AbsentSeat>();
  for (const gedu of staffing.expected) {
    seats.set(gedu.id, { ...gedu, request: null });
  }
  for (const request of staffing.requests) {
    // A requester is never also expected, so this only ever adds; the guard is
    // for the compiler's peace of mind and costs nothing.
    if (seats.has(request.requestedBy.id)) continue;
    seats.set(request.requestedBy.id, {
      id: request.requestedBy.id,
      firstName: request.requestedBy.firstName,
      role: request.role,
      request,
    });
  }
  return [...seats.values()];
}

/**
 * Step one: which seat is empty.
 *
 * Rendered only where the session expects more than one gedu — with a single
 * seat there is no question to ask, and a dialog asking it would be a press
 * whose answer was already known. The roles are printed beside the names
 * because that is what tells two people on the same card apart when both are
 * due.
 */
function AbsentGeduStep({
  seats,
  sessionDate,
  initialId,
  onCancel,
  onChoose,
}: {
  seats: readonly AbsentSeat[];
  sessionDate: string;
  /** Who was chosen last time this step was up, on a walk back from the picker. */
  initialId: string | null;
  onCancel: () => void;
  onChoose: (seat: AbsentSeat) => void;
}) {
  const t = useTranslations("admin.products.staffing");
  const c = useTranslations("common");
  const date = useSessionDateLabel(sessionDate);
  const groupName = useId();
  const roleLabel = useRoleLabel();
  const [chosenId, setChosenId] = useState<string | null>(initialId);

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("absentStepTitle")}</DialogTitle>
        <DialogDescription>{t("absentStepBody", { date })}</DialogDescription>
      </DialogHeader>

      <div className="mt-4 flex flex-col gap-2.5">
        <Label id={`${groupName}-label`}>{t("absentLabel")}</Label>
        <div
          role="radiogroup"
          aria-labelledby={`${groupName}-label`}
          className="flex flex-col gap-2"
        >
          {seats.map((gedu) => {
            const selected = chosenId === gedu.id;
            return (
              <label
                key={gedu.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 text-sm transition-colors",
                  selected && "border-act",
                )}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={gedu.id}
                  className="h-4 w-4 shrink-0 accent-act"
                  checked={selected}
                  onChange={() => setChosenId(gedu.id)}
                />
                <span className="min-w-0 flex-1 font-medium">
                  {t("withRole", {
                    name: gedu.firstName,
                    role: roleLabel(gedu.role),
                  })}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {c("cancel")}
        </Button>
        <Button
          type="button"
          disabled={chosenId === null}
          onClick={() => {
            const seat = seats.find((candidate) => candidate.id === chosenId);
            if (seat !== undefined) onChoose(seat);
          }}
        >
          {c("continue")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/**
 * The last step: who is substituting whom, why, and what this press does to what is
 * already recorded.
 *
 * **It says what it is replacing.** An absent gedu with an open request is
 * being approved rather than filed for — the write fills that request in
 * place, so a second row is never created — and one already substituted is having
 * their sub swapped. Neither is something an admin should discover from the
 * card afterwards.
 *
 * The reason is optional here and required on the gedu's own path, and that
 * asymmetry is the retroactive case: an office recording an off-platform substitution
 * from three weeks ago may simply not know why somebody was away, and inventing
 * `other` for them would put a fact in the row that nobody stated.
 */
function ConfirmSubStep({
  absent,
  sub,
  sessionDate,
  reason,
  onReasonChange,
  note,
  onNoteChange,
  onChangeSub,
  onCancel,
  onConfirm,
}: {
  absent: AbsentSeat;
  sub: { id: string; firstName: string };
  sessionDate: string;
  /** `null` until the admin has chosen one, which the confirm waits for. */
  reason: SubstitutionReason | null;
  onReasonChange: (reason: SubstitutionReason) => void;
  note: string;
  onNoteChange: (note: string) => void;
  onChangeSub: () => void;
  onCancel: () => void;
  onConfirm: (draft: SetSessionSubstitutionDraft) => Promise<void>;
}) {
  const t = useTranslations("admin.products.staffing");
  const c = useTranslations("common");
  const date = useSessionDateLabel(sessionDate);
  const roleLabel = useRoleLabel();
  const groupName = useId();
  const noteId = useId();

  const [committing, setCommitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const remaining = SUBSTITUTION_REASON_NOTE_MAX_LENGTH - note.length;
  const trimmedNote = note.trim();

  const run = () => {
    setFailed(false);
    setCommitting(true);
    void onConfirm({
      absentGeduId: absent.id,
      subGeduId: sub.id,
      // The note is omitted rather than nulled where it is empty: the RPC's
      // parameter carries a trailing default precisely so a caller with
      // nothing to send can leave it out. The reason is never absent — the
      // button is disabled until one is chosen.
      ...(reason === null ? {} : { reason }),
      ...(trimmedNote === "" ? {} : { reasonNote: trimmedNote }),
    }).catch(() => {
      setCommitting(false);
      setFailed(true);
    });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("confirmTitle")}</DialogTitle>
        <DialogDescription>{t("confirmBody", { date })}</DialogDescription>
      </DialogHeader>

      <div className="mt-4 space-y-4">
        <dl className="space-y-1.5 text-sm">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-xs text-muted-foreground">{t("absentLabel")}</dt>
            <dd className="font-medium">
              {t("withRole", {
                name: absent.firstName,
                role: roleLabel(absent.role),
              })}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="text-xs text-muted-foreground">{t("subLabel")}</dt>
            <dd className="font-medium">{sub.firstName}</dd>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={committing}
              onClick={onChangeSub}
            >
              {t("changeChoice")}
            </Button>
          </div>
        </dl>

        {absent.request !== null && (
          <p className="text-xs text-muted-foreground">
            {absent.request.status === "substituted" &&
            absent.request.substituteId !== null
              ? t("replacesCurrentSub", {
                  name: absent.request.substituteId.firstName,
                })
              : t("approvesOpenRequest")}
          </p>
        )}

        <div className="flex flex-col gap-2.5">
          <Label id={`${groupName}-label`}>{t("reasonLabel")}</Label>
          <div
            role="radiogroup"
            aria-labelledby={`${groupName}-label`}
            className="flex flex-wrap gap-2"
          >
            {SUBSTITUTION_REASONS.map((value) => {
              const selected = reason === value;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors",
                    selected && "border-act",
                    committing && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="radio"
                    name={groupName}
                    value={value}
                    className="h-4 w-4 shrink-0 accent-act"
                    checked={selected}
                    disabled={committing}
                    onChange={() => onReasonChange(value)}
                  />
                  <span className="font-medium">
                    {value === "sick" ? t("reasonSick") : t("reasonOther")}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <Field
          label={t("noteLabel")}
          htmlFor={noteId}
          optional
          hint={t("noteRemaining", { count: Math.max(remaining, 0) })}
        >
          <Textarea
            id={noteId}
            rows={2}
            maxLength={SUBSTITUTION_REASON_NOTE_MAX_LENGTH}
            disabled={committing}
            placeholder={t("notePlaceholder")}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
          />
        </Field>

        {failed && (
          <StatusLine status="destructive" size="xs" role="alert">
            {t("setFailed")}
          </StatusLine>
        )}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={committing}
          onClick={onCancel}
        >
          {c("cancel")}
        </Button>
        <Button
          type="button"
          // **Nothing is chosen to begin with, and the press waits for a
          // choice.** A pre-selected "Sick" would write health data about a
          // contractor that nobody stated, which is the one direction this
          // field must not fail in.
          disabled={committing || reason === null}
          onClick={run}
          className="gap-1.5"
        >
          {committing && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          {t("confirmAction")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/**
 * The categories, read off the generated enum rather than retyped — the same
 * two, in the same order, the gedu's own dialog offers.
 *
 * **There is no "not stated" any more** *(owner, 2026-09)*: an admin seating a
 * substitute states why, exactly as a gedu filing an absence does. The database
 * still accepts a null reason, which is what keeps every row filed before this
 * change readable; the interface simply never sends one.
 */
const SUBSTITUTION_REASONS = Constants.public.Enums.substitution_reason;

/**
 * The session's own calendar date, in words.
 *
 * A bare `YYYY-MM-DD` with no time of day, so it is UTC-pinned at both ends —
 * re-anchoring it to the reader's zone would shift it off by one and name a
 * different session than the card it was opened from.
 */
function useSessionDateLabel(sessionDate: string): string {
  const locale = useLocale();
  return formatDateOnly(sessionDate, locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** The pay class, in the words the admin surfaces already use for it. */
function useRoleLabel(): (role: GeduAssignmentRole) => string {
  const tRole = useTranslations("admin.geduRole");
  return (role) => tRole(role);
}
