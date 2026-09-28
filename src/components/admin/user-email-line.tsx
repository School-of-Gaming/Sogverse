"use client";

import { useRef, useState, type RefObject } from "react";
import { Loader2, MailCheck, MailX } from "lucide-react";
import { useTranslations } from "next-intl";
import { EditPencilButton } from "@/components/admin/edit-pencil-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/api-error";
import {
  adminUserEmailBody,
  useProfile,
  useUpdateUserEmail,
  USER_EMAIL_TAKEN,
} from "@/services/users";
import type { Profile } from "@/types";

/**
 * The address line under a person's name on their admin detail page, with its
 * verification mark and — where the address may be corrected here — a pencil
 * that opens the editor.
 *
 * **Why an admin can change it at all:** a parent who signs up with a typo in
 * their address can neither verify it nor reset a forgotten password, because
 * every mail we send goes to the typo. Nobody in the family can undo that, so
 * the fix has to be staff's; the route behind the dialog moves the sign-in
 * record and the profile together.
 *
 * **Every account's line carries the pencil, a gamer's included.** For a child
 * whose address is one of our synthetic handles the line shows that handle,
 * because that is what the editor would replace, and it carries no
 * verification mark: no inbox answers a synthetic address, so "not verified"
 * would be a fact about nothing (`showVerification`).
 *
 * **The same seam as the personal-details line.** The page hands down the row it
 * already read and the query is seeded with it, so the line paints complete; a
 * save refetches that query before the dialog closes, so closing reveals the new
 * address — and the "not verified" mark its trigger just set — in place.
 */
export function UserEmailLine({
  userId,
  initialProfile,
  showVerification,
}: {
  userId: string;
  initialProfile: Profile;
  /** False where the address is not a mailbox; see above. */
  showVerification: boolean;
}) {
  const t = useTranslations("admin.users");

  const { data } = useProfile(userId, { initialData: initialProfile });
  // The seed makes this unconditional in practice; the fallback is what tells
  // the compiler so, without an assertion.
  const profile = data ?? initialProfile;

  const [editing, setEditing] = useState(false);
  // Set by the form beside its own `committing` state; read here from an Escape
  // keypress or a backdrop click, which arrive outside React's render.
  const busyRef = useRef(false);

  function close() {
    busyRef.current = false;
    setEditing(false);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <p className="text-muted-foreground">{profile.email}</p>
        {/* The list shows only the positive case (a check that means somebody
            confirmed the address); this detail page states the answer both
            ways, because an admin looking at ONE user is asking the question
            and deserves a definite answer rather than having to know that
            silence means no. */}
        {showVerification &&
          (profile.email_verified_at ? (
            <MailCheck
              className="h-4 w-4 shrink-0 text-success"
              aria-label={t("emailVerified")}
            />
          ) : (
            <MailX
              className="h-4 w-4 shrink-0 text-warning"
              aria-label={t("emailNotVerified")}
            />
          ))}
        {/* Last in a left-packed row, so a save that changes the address's
            length moves it — the direct result of the admin confirming the
            dialog they opened from here, which the layout rule permits. */}
        <EditPencilButton
          label={t("emailEdit.edit")}
          onClick={() => setEditing(true)}
        />
      </div>

      <Dialog
        open={editing}
        // A save in flight owns the dialog until it resolves: Escape or a
        // backdrop click would otherwise unmount the form mid-write and leave
        // its outcome with nowhere to be reported.
        onOpenChange={(open) => {
          if (!open && busyRef.current) return;
          setEditing(open);
        }}
      >
        <UserEmailForm
          userId={userId}
          currentEmail={profile.email}
          busyRef={busyRef}
          onClose={close}
        />
      </Dialog>
    </>
  );
}

/**
 * Which sentence the form is showing under its field, if any. Each is a
 * different thing for the admin to do next, so they are distinct keys rather
 * than one error with its detail filled in.
 */
type EmailProblem = "invalid" | "taken" | "failed";

const PROBLEM_KEYS = {
  invalid: "emailEdit.invalid",
  taken: "emailEdit.taken",
  failed: "emailEdit.saveError",
} as const satisfies Record<EmailProblem, string>;

/**
 * The dialog's body: one address field and a save.
 *
 * The address is parsed with the route's own body schema before it is sent, so
 * what is judged here is exactly what the route would accept — trimmed, folded
 * to lowercase and fenced off our synthetic gamer domain — and an address that
 * normalises to the one already stored closes the dialog with no request.
 */
function UserEmailForm({
  userId,
  currentEmail,
  busyRef,
  onClose,
}: {
  userId: string;
  currentEmail: string;
  /** Set true for as long as a save is in flight; see the parent. */
  busyRef: RefObject<boolean>;
  onClose: () => void;
}) {
  const t = useTranslations("admin.users");
  const c = useTranslations("common");
  const updateEmail = useUpdateUserEmail();

  // Seeded once, because this component exists only while the dialog is open.
  const [value, setValue] = useState(currentEmail);

  // Per CLAUDE.md "Loading & Disabled State": live before any render after the
  // click. A save that lands closes the dialog, so the flag is left set on that
  // path and the unmount disposes of it; only a failure clears it.
  const [committing, setCommitting] = useState(false);
  const [problem, setProblem] = useState<EmailProblem | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (committing) return;

    const parsed = adminUserEmailBody.safeParse({ email: value });
    if (!parsed.success) {
      setProblem("invalid");
      return;
    }
    if (parsed.data.email === currentEmail) {
      onClose();
      return;
    }

    setProblem(null);
    setCommitting(true);
    // Beside the state, not after it: the parent reads this from an Escape or a
    // backdrop click that can arrive before React has rendered anything.
    busyRef.current = true;
    void updateEmail
      .mutateAsync({ userId, edit: parsed.data })
      .then(onClose)
      // The route's message is English for the log; only its code is read, to
      // tell the one refusal the admin can act on from everything else.
      .catch((caught: unknown) => {
        setProblem(
          caught instanceof ApiError && caught.code === USER_EMAIL_TAKEN
            ? "taken"
            : "failed",
        );
        setCommitting(false);
        busyRef.current = false;
      });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("emailEdit.title")}</DialogTitle>
        <DialogDescription>{t("emailEdit.description")}</DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-4 py-4">
          <Field label={t("emailEdit.label")} htmlFor="admin-user-email">
            <Input
              id="admin-user-email"
              type="email"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={committing}
              aria-invalid={problem === "invalid" || problem === "taken"}
            />
          </Field>

          {/* Below the field rather than above it: a sentence above would push
              the input the admin just typed into. */}
          {problem && (
            <Alert variant="destructive">
              <AlertDescription>{t(PROBLEM_KEYS[problem])}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={committing}
          >
            {c("cancel")}
          </Button>
          <Button type="submit" disabled={committing}>
            {committing && <Loader2 className="animate-spin" />}
            {committing ? c("saving") : c("save")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
