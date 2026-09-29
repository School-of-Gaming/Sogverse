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
import { gamerUsernameFromEmail } from "@/lib/gamer-sign-in";
import {
  adminUserEmailBody,
  useProfile,
  useUpdateUserSignInAddress,
  USER_EMAIL_TAKEN,
} from "@/services/users";
import type { Profile } from "@/types";

/**
 * The address line under a person's name on their admin detail page, with its
 * verification mark and — for an adult — a pencil that opens the editor.
 *
 * **Why an admin can change it at all:** a parent who signs up with a typo in
 * their address can neither verify it nor reset a forgotten password, because
 * every mail we send goes to the typo. Nobody in the family can undo that, so
 * the fix has to be staff's; the route behind the dialog moves the sign-in
 * record and the profile together.
 *
 * **Only a mailbox gets this line.** A child whose address is one of our
 * synthetic handles has nothing here worth reading, so the page does not render
 * it for them. A child in `email` mode does get it, without the pencil: a
 * gamer's page carries one editor, the personal-details dialog, and their
 * address is one of its fields (`editable`).
 *
 * **The same seam as the personal-details line.** The page hands down the row it
 * already read and the query is seeded with it, so the line paints complete; a
 * save refetches that query before the dialog closes, so closing reveals the new
 * address — and the "not verified" mark its trigger just set — in place.
 */
export function UserEmailLine({
  userId,
  initialProfile,
  editable,
}: {
  userId: string;
  initialProfile: Profile;
  /** False for a gamer, whose address is edited in the personal-details dialog. */
  editable: boolean;
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
        {profile.email_verified_at ? (
          <MailCheck
            className="h-4 w-4 shrink-0 text-success"
            aria-label={t("emailVerified")}
          />
        ) : (
          <MailX
            className="h-4 w-4 shrink-0 text-warning"
            aria-label={t("emailNotVerified")}
          />
        )}
        {/* Last in a left-packed row, so a save that changes the address's
            length moves it — the direct result of the admin confirming the
            dialog they opened from here, which the layout rule permits. */}
        {editable && (
          <EditPencilButton
            label={t("emailEdit.edit")}
            onClick={() => setEditing(true)}
          />
        )}
      </div>

      {editable && (
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
      )}
    </>
  );
}

/**
 * A username-mode child's username, which lives in the local part of their
 * synthetic address and nowhere else. Labelled, so it is not read as a mangled
 * email; no verification mark, because there is no inbox behind it to have
 * confirmed anything; no pencil, because the personal-details dialog edits it.
 *
 * A client island on the same seeded profile query as the address line, so a
 * rename from that dialog restates itself here when the dialog closes.
 */
export function GamerUsernameLine({
  userId,
  initialProfile,
}: {
  userId: string;
  initialProfile: Profile;
}) {
  const t = useTranslations("admin.users");
  const { data } = useProfile(userId, { initialData: initialProfile });
  const username = gamerUsernameFromEmail((data ?? initialProfile).email);
  if (!username) return null;

  return (
    <p className="flex items-baseline gap-1.5 text-muted-foreground">
      <span className="text-[10px] uppercase tracking-wide">
        {t("usernameLabel")}
      </span>
      <span>{username}</span>
    </p>
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
 * An address that normalises to the one already stored closes the dialog with
 * no request, and that is checked before the address is parsed. Otherwise it is
 * parsed with the route's own body schema before it is sent, so what is judged
 * here is exactly what the route would accept — trimmed, folded to lowercase and
 * fenced off our synthetic gamer domain.
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
  const updateAddress = useUpdateUserSignInAddress();

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

    if (value.trim().toLowerCase() === currentEmail.toLowerCase()) {
      onClose();
      return;
    }
    const parsed = adminUserEmailBody.safeParse({ email: value });
    if (!parsed.success) {
      setProblem("invalid");
      return;
    }

    setProblem(null);
    setCommitting(true);
    // Beside the state, not after it: the parent reads this from an Escape or a
    // backdrop click that can arrive before React has rendered anything.
    busyRef.current = true;
    void updateAddress
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
