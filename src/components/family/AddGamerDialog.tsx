"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateGamer } from "@/services/gamers";
import { usePinStatus, pinKeys } from "@/services/pin";
import { PinUnlockFlow } from "@/components/pin";
import { useRequiredAuth } from "@/providers/auth-provider";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  assembleGamerDateOfBirth,
  gamerBirthYearOptions,
} from "./add-gamer-dialog-helpers";

type Gender = "boy" | "girl" | "non_binary";

interface AddGamerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (gamerId: string) => void;
}

/**
 * Reusable dialog for creating a gamer linked to the current parent.
 *
 * The form intentionally only asks for first name, birth month, birth year, and
 * an optional gender — no username / password / email. Gamers under this model
 * always sign in via account-switching from their parent's account.
 *
 * Designed for reuse: family selector wires it now; product / club / camp /
 * event detail pages should pass `open` / `onOpenChange` to drop it in when a
 * parent without gamers tries to sign up.
 *
 * Adding a gamer requires an unlocked parent session, so this component is the
 * single chokepoint that enforces it: it never renders the form for a locked
 * session. Every call site gets the gate for free — see `AddGamerGate`.
 */
export function AddGamerDialog({ open, onOpenChange, onCreated }: AddGamerDialogProps) {
  if (!open) return null;
  return <AddGamerGate onOpenChange={onOpenChange} onCreated={onCreated} />;
}

/**
 * The PIN gate that fronts the form. Reaching the create-gamer API requires a
 * PIN-unlocked customer session (`requireRole("customer")`); discovering that
 * only on submit — after the parent fills the whole form — is the bad UX this
 * exists to prevent. So we resolve the session's PIN state up front and:
 *   - unlocked            → render the form.
 *   - locked, no PIN yet  → create-a-PIN pad, then the form.
 *   - locked, PIN set     → enter-PIN pad (+ forgot link), then the form.
 *
 * `unlocked` can't be read from the browser (HttpOnly cookie), so it comes from
 * `usePinStatus`. On a successful unlock the verify/setPin response has already
 * set the cookie, so the next create-gamer fetch carries it — no reload needed.
 * We seed the status cache so the view swaps to the form and a reopen stays
 * unlocked rather than re-prompting.
 */
function AddGamerGate({ onOpenChange, onCreated }: Omit<AddGamerDialogProps, "open">) {
  const queryClient = useQueryClient();
  const { data: status, isError } = usePinStatus();

  // Status in flight (or failed): show the dialog shell with a no-interaction
  // skeleton, so the form/pad simply appears in its final place when it lands
  // (no-layout-shift rule — a skeleton with nothing clickable constrains nothing).
  if (!status) {
    return (
      <GateShell onOpenChange={onOpenChange}>
        <GatePlaceholder error={isError} onClose={() => onOpenChange(false)} />
      </GateShell>
    );
  }

  if (status.unlocked) {
    return <AddGamerForm onOpenChange={onOpenChange} onCreated={onCreated} />;
  }

  return (
    <GateShell onOpenChange={onOpenChange}>
      <PinUnlockFlow
        pinIsSet={status.isSet}
        onUnlocked={() => {
          // Swap to the form now AND keep a reopen unlocked. setQueryData
          // re-renders this gate (status.unlocked → true), unmounting the pad —
          // which is what holds its disabled state through the swap.
          queryClient.setQueryData(pinKeys.status(), { isSet: true, unlocked: true });
        }}
      />
    </GateShell>
  );
}

/** Dialog shell for the pre-form states (loading + PIN pad), sized to the pad. */
function GateShell({
  onOpenChange,
  children,
}: {
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex justify-center px-2 py-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/** Loading spinner, or an error + close button if the status fetch failed. */
function GatePlaceholder({ error, onClose }: { error: boolean; onClose: () => void }) {
  const t = useTranslations("family.addGamerForm");
  const c = useTranslations("common");
  if (error) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-destructive">{t("genericError")}</p>
        <Button variant="outline" onClick={onClose}>
          {c("cancel")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex min-h-[16rem] items-center justify-center" aria-hidden="true">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function AddGamerForm({
  onOpenChange,
  onCreated,
}: Omit<AddGamerDialogProps, "open">) {
  const t = useTranslations("family.addGamerForm");
  const c = useTranslations("common");
  const locale = useLocale();
  const { user } = useRequiredAuth();
  const createGamer = useCreateGamer();

  const [firstName, setFirstName] = useState("");
  const [month, setMonth] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per CLAUDE.md "Loading & Disabled State": a local flag set BEFORE
  // mutate runs, only cleared on outcomes that need the user to retry.
  // On success we close the dialog so the unmount handles cleanup.
  const [committing, setCommitting] = useState(false);

  const years = useMemo(() => gamerBirthYearOptions(), []);

  const months = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "long" });
    return Array.from({ length: 12 }, (_, i) => ({
      value: i + 1,
      label: fmt.format(new Date(2000, i, 1)),
    }));
  }, [locale]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (committing) return;

    const trimmedName = firstName.trim();
    if (trimmedName.length < DISPLAY_NAME_MIN) {
      setError(t("firstNameTooShort"));
      return;
    }
    if (trimmedName.length > DISPLAY_NAME_MAX) {
      setError(t("firstNameTooLong"));
      return;
    }
    if (!month) {
      setError(t("birthMonthRequired"));
      return;
    }
    if (!year) {
      setError(t("birthYearRequired"));
      return;
    }

    setError(null);
    setCommitting(true);

    const dateOfBirth = assembleGamerDateOfBirth(Number(year), Number(month));

    try {
      const result = await createGamer.mutateAsync({
        parentId: user.id,
        input: {
          firstName: trimmedName,
          dateOfBirth,
          gender,
        },
      });
      onCreated?.(result.gamer.id);
      onOpenChange(false);
      // Intentionally not clearing `committing` — the dialog unmounts.
    } catch (err) {
      setCommitting(false);
      setError(err instanceof Error ? err.message : t("genericError"));
    }
  }

  // Matches the styling used by other selects in the codebase
  // (see admin/location-form-dialog.tsx). Aligned with Input's height/border
  // so the form reads as a single coherent column.
  const selectClassName =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="add-gamer-first-name">{t("firstNameLabel")}</Label>
              <Input
                id="add-gamer-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t("firstNamePlaceholder")}
                disabled={committing}
                autoFocus
                autoComplete="off"
                required
                minLength={DISPLAY_NAME_MIN}
                maxLength={DISPLAY_NAME_MAX}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="add-gamer-month">{t("birthMonthLabel")}</Label>
                <select
                  id="add-gamer-month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  disabled={committing}
                  className={selectClassName}
                  required
                >
                  <option value="">{t("birthMonthPlaceholder")}</option>
                  {months.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-gamer-year">{t("birthYearLabel")}</Label>
                <select
                  id="add-gamer-year"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  disabled={committing}
                  className={selectClassName}
                  required
                >
                  <option value="">{t("birthYearPlaceholder")}</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                {t("genderLabel")}{" "}
                <span className="font-normal text-muted-foreground">
                  ({t("genderOptional")})
                </span>
              </Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <GenderButton
                  selected={gender === "boy"}
                  disabled={committing}
                  onClick={() => setGender(gender === "boy" ? null : "boy")}
                  label={t("genderBoy")}
                />
                <GenderButton
                  selected={gender === "girl"}
                  disabled={committing}
                  onClick={() => setGender(gender === "girl" ? null : "girl")}
                  label={t("genderGirl")}
                />
                <GenderButton
                  selected={gender === "non_binary"}
                  disabled={committing}
                  onClick={() => setGender(gender === "non_binary" ? null : "non_binary")}
                  label={t("genderNonBinary")}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={committing}
            >
              {c("cancel")}
            </Button>
            <Button type="submit" disabled={committing}>
              {committing && <Loader2 className="animate-spin" />}
              {committing ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GenderButton({
  selected,
  disabled,
  onClick,
  label,
}: {
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex h-10 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {label}
    </button>
  );
}
