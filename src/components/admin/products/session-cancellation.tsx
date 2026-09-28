"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { StatusLine } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  SessionCardMenu,
  type SessionCardMenuItem,
} from "@/components/gedu/session-feed";
import { formatDateOnly } from "@/lib/utils";
import { isSessionHasRecordError } from "@/services/admin-sessions";
import {
  SessionStaffingEditor,
  type SessionStaffingEditorProps,
} from "./session-staffing-editor";

/** The database's cap on a cancellation reason. */
const CANCELLATION_REASON_MAX_LENGTH = 500;

/**
 * The admin's `⋯` on a session that is going to run, or ran: the staffing rows,
 * then "Cancel session" where the session may be cancelled.
 *
 * **One menu per card.** The cancel row joins the staffing editor's own menu
 * rather than drawing a second `⋯` beside it.
 *
 * **Not offered on a session with a record.** A stored report, note, photo or
 * attendance mark says the session ran, and the database refuses to cancel it;
 * a row that could only ever be refused is not offered, which is the menu's own
 * rule — it has no disabled state, because a row is a promise.
 */
export function AdminSessionMenu({
  cancellable,
  onCancelSession,
  ...staffing
}: Omit<SessionStaffingEditorProps, "extraItems" | "extraFlowOpen"> & {
  /** Whether the date has no stored record, so a cancel would be accepted. */
  cancellable: boolean;
  /**
   * Cancel with this reason. Resolves only once the card has been rebuilt from
   * the new answer; rejects when the write did not land.
   */
  onCancelSession: (reason: string) => Promise<void>;
}) {
  const t = useTranslations("admin.products.cancellation");
  const [cancelling, setCancelling] = useState(false);

  const items: SessionCardMenuItem[] = cancellable
    ? [
        {
          key: "cancel-session",
          label: t("cancelSession"),
          onSelect: () => setCancelling(true),
        },
      ]
    : [];

  return (
    <>
      <SessionStaffingEditor
        {...staffing}
        extraItems={items}
        extraFlowOpen={cancelling}
      />
      {cancelling && (
        <CancelSessionDialog
          mode="cancel"
          sessionDate={staffing.sessionDate}
          initialReason=""
          onClose={() => setCancelling(false)}
          onSubmit={onCancelSession}
        />
      )}
    </>
  );
}

/**
 * The admin's `⋯` on a cancelled session: change the reason, or restore it.
 *
 * Changing the reason is the same write as cancelling — the RPC is an upsert —
 * so it opens the same dialog with the current reason in it.
 */
export function AdminCancelledSessionMenu({
  sessionDate,
  reason,
  onCancelSession,
  onRestoreSession,
}: {
  sessionDate: string;
  reason: string | null;
  onCancelSession: (reason: string) => Promise<void>;
  /** Resolves and rejects on the same terms as the cancel. */
  onRestoreSession: () => Promise<void>;
}) {
  const t = useTranslations("admin.products.cancellation");
  const [open, setOpen] = useState<"reason" | "restore" | null>(null);
  const date = useSessionDateLabel(sessionDate);

  const items: SessionCardMenuItem[] = [
    {
      key: "change-reason",
      label: reason === null ? t("addReason") : t("changeReason"),
      onSelect: () => setOpen("reason"),
    },
    {
      key: "restore-session",
      label: t("restoreSession"),
      onSelect: () => setOpen("restore"),
    },
  ];

  return (
    <>
      <SessionCardMenu
        label={t("menuLabel")}
        items={items}
        flowOpen={open !== null}
      />
      {open === "reason" && (
        <CancelSessionDialog
          mode="reason"
          sessionDate={sessionDate}
          initialReason={reason ?? ""}
          onClose={() => setOpen(null)}
          onSubmit={onCancelSession}
        />
      )}
      {/* A pure confirm whose refusal the admin has to read before moving on,
          so it holds across the write rather than closing on the press. */}
      <ConfirmDialog
        open={open === "restore"}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        title={t("restoreTitle")}
        description={t("restoreBody", { date })}
        confirmLabel={t("restoreConfirm")}
        confirmVariant="default"
        holdWhileCommitting
        describeError={() => t("restoreFailed")}
        onConfirm={onRestoreSession}
      />
    </>
  );
}

/**
 * Cancelling a session, or changing a cancelled one's reason.
 *
 * **It carries form content, so it keeps its committing flag inline** and
 * closes itself: the reason field is disabled by the same flag the buttons are,
 * and the dialog closes only once the card behind it has been rebuilt. A
 * refusal keeps it open with one line saying why — the "already has a record"
 * refusal in words the admin can act on, since the card they opened it from can
 * be a moment out of date.
 */
function CancelSessionDialog({
  mode,
  sessionDate,
  initialReason,
  onClose,
  onSubmit,
}: {
  mode: "cancel" | "reason";
  sessionDate: string;
  initialReason: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const t = useTranslations("admin.products.cancellation");
  const c = useTranslations("common");
  const date = useSessionDateLabel(sessionDate);
  const reasonId = useId();

  const [reason, setReason] = useState(initialReason);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    setCommitting(true);
    onSubmit(reason.trim()).then(
      // Left set on success: the dialog unmounts with the close.
      onClose,
      (cause: unknown) => {
        setCommitting(false);
        setError(
          isSessionHasRecordError(cause) ? t("hasRecord") : t("cancelFailed"),
        );
      },
    );
  };

  const remaining = CANCELLATION_REASON_MAX_LENGTH - reason.length;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !committing) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "cancel" ? t("cancelTitle") : t("reasonTitle")}
          </DialogTitle>
          <DialogDescription>
            {mode === "cancel"
              ? t("cancelBody", { date })
              : t("reasonBody", { date })}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <Field
            label={t("reasonLabel")}
            htmlFor={reasonId}
            optional
            hint={t("reasonHint", { count: Math.max(remaining, 0) })}
          >
            <Textarea
              id={reasonId}
              rows={3}
              maxLength={CANCELLATION_REASON_MAX_LENGTH}
              disabled={committing}
              placeholder={t("reasonPlaceholder")}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>

          {error !== null && (
            <StatusLine status="destructive" size="xs" role="alert">
              {error}
            </StatusLine>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={committing}
            onClick={onClose}
          >
            {mode === "cancel" ? t("keepSession") : c("cancel")}
          </Button>
          <Button
            type="button"
            variant={mode === "cancel" ? "destructive" : "default"}
            disabled={committing}
            onClick={run}
            className="gap-1.5"
          >
            {committing && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
            {mode === "cancel" ? t("cancelConfirm") : t("reasonConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The session's own calendar date, in words — UTC-pinned at both ends, since a
 * bare date re-anchored to the reader's zone would name a different session.
 */
function useSessionDateLabel(sessionDate: string): string {
  const locale = useLocale();
  return formatDateOnly(sessionDate, locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
