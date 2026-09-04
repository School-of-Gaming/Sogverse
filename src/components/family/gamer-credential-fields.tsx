"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Field } from "@/components/ui/field";
import {
  GAMER_USERNAME_MAX_LENGTH,
  GAMER_USERNAME_PATTERN,
  normalizeGamerUsername,
} from "@/lib/gamer-sign-in";
import type { GamerSignIn } from "@/types";

/**
 * The credential a child's sign-in mode asks for, and the rules for judging it.
 *
 * Two surfaces put a child into `username` or `email` mode — the add-gamer
 * dialog's second page and the settings card on the child's own page — and both
 * have to ask for exactly what the mode needs, in the same words, with the same
 * refusals. The wire contracts already state those rules once
 * (`gamers.contracts.ts`); this is the same rules on the near side of the
 * request, so a parent is told what is wrong before a round trip rather than
 * after one.
 */

/**
 * Mirrors `accountPasswordValue`, which is what the route actually enforces.
 *
 * A child's password is held to the same floor as an adult's: it is a real
 * credential on a real account, and the fact that a parent typed it changes
 * nothing about what it protects.
 */
export const GAMER_PASSWORD_MIN_LENGTH = 8;

/**
 * Which field is wrong and which sentence says so — a key in the `gamerSignIn`
 * namespace, never the sentence itself.
 *
 * Returning a key rather than translated copy is what lets one validator serve
 * two surfaces that hold their own translators, and it keeps the copy in the
 * catalogue where the other four locales can find it.
 *
 * **The `…Taken` pair are in the union without being reachable from the
 * validator below**, and that is the point: they are the two refusals only the
 * server can make, and both surfaces set them onto exactly this slot when a 409
 * comes back. One shape for "the credential field is wrong", however the wrong
 * was discovered.
 */
export interface GamerCredentialProblem {
  field: "username" | "password" | "email";
  key:
    | "usernameRequired"
    | "usernameInvalid"
    | "usernameTaken"
    | "passwordTooShort"
    | "emailRequired"
    | "emailInvalid"
    | "emailTaken";
}

/**
 * A pragmatic address check, and deliberately not RFC 5322.
 *
 * The authority on whether an address exists is the mailbox that either answers
 * the verification mail or does not, and this only catches the typo a parent can
 * see for themselves — a missing `@`, a missing dot, a stray space. Anything
 * stricter starts refusing addresses that work.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The three rules, one per field.
 *
 * The username rule is exported on its own as well as through the combined
 * check, because the card that lets a parent correct a mistyped username asks
 * about exactly that one field and would otherwise have to fake the other two
 * to reach the rule it wants.
 */
export function findGamerUsernameProblem(
  raw: string,
): GamerCredentialProblem | null {
  const username = normalizeGamerUsername(raw);
  if (username.length === 0) {
    return { field: "username", key: "usernameRequired" };
  }
  if (!GAMER_USERNAME_PATTERN.test(username)) {
    return { field: "username", key: "usernameInvalid" };
  }
  return null;
}

export function findGamerPasswordProblem(
  password: string,
): GamerCredentialProblem | null {
  if (password.length < GAMER_PASSWORD_MIN_LENGTH) {
    return { field: "password", key: "passwordTooShort" };
  }
  return null;
}

function findGamerEmailProblem(
  raw: string,
): GamerCredentialProblem | null {
  const email = raw.trim();
  if (email.length === 0) return { field: "email", key: "emailRequired" };
  if (!EMAIL_SHAPE.test(email)) return { field: "email", key: "emailInvalid" };
  return null;
}

/** What the mode's fields have to satisfy, or `null` when they do. */
export function findGamerCredentialProblem(input: {
  signIn: GamerSignIn;
  username: string;
  password: string;
  email: string;
}): GamerCredentialProblem | null {
  if (input.signIn === "username") {
    return (
      findGamerUsernameProblem(input.username) ??
      findGamerPasswordProblem(input.password)
    );
  }
  if (input.signIn === "email") return findGamerEmailProblem(input.email);
  return null;
}

/**
 * The fields themselves.
 *
 * **The password opens in clear and has no confirmation field.** Both follow
 * from who is typing it: a parent choosing a password *for* their child has to
 * read it back to them, so masking hides it from the one person it is being
 * written for, and a second box to retype it guards against a typo the parent
 * can already see. Neither is a relaxation of anything — the account still holds
 * an eight-character minimum, and the field still has its hide toggle.
 *
 * `idPrefix` keeps two instances (the dialog's and the settings card's, which
 * never coexist today) from minting the same `id`.
 *
 * **No hint under any of these fields** (owner ruling). A hint here spends three
 * lines telling a parent in advance what the validator will tell them precisely,
 * on submit, only if it turns out to matter — and every one of those lines is
 * paid for twice on a phone, where the sentences wrap and push the footer down.
 * The refusals are unchanged and still say exactly what is wrong. This is about
 * the text under the *fields*: the sentence under each sign-in radio is what
 * tells a parent what a mode does, and it stays.
 *
 * **Nothing here takes focus on mount.** On both surfaces these fields are
 * revealed by a radio the parent has just picked, and pulling focus out of the
 * radio group would take their arrow keys with it.
 */
export function GamerCredentialFields({
  signIn,
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  email,
  onEmailChange,
  disabled = false,
  problem,
  idPrefix,
}: {
  signIn: GamerSignIn;
  username: string;
  onUsernameChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  disabled?: boolean;
  /** The one thing currently wrong, already translated, or null. */
  problem: { field: GamerCredentialProblem["field"]; message: string } | null;
  idPrefix: string;
}) {
  const t = useTranslations("gamerSignIn");
  const c = useTranslations("common");

  /**
   * The refusal, if it belongs to this field.
   *
   * **It is rendered inside the `Field`, through the render-prop form.** The
   * sentence used to be a sibling below the field, with no id and nothing
   * pointing at it — so a control marked `aria-invalid` announced that it was
   * wrong and never said what was wrong with it. The only ids that can name a
   * node inside a field come from the field itself, which is what the render
   * prop hands over; the error id is minted off `labelId` so it is unique per
   * instance even where two cards share an `idPrefix`.
   */
  const errorFor = (field: GamerCredentialProblem["field"]) =>
    problem?.field === field ? problem.message : null;

  if (signIn === "username") {
    return (
      <>
        <Field label={t("usernameLabel")} htmlFor={`${idPrefix}-username`}>
          {({ labelId }) => {
            const message = errorFor("username");
            const errorId = `${labelId}-error`;
            return (
              <>
                <Input
                  id={`${idPrefix}-username`}
                  value={username}
                  // Folded on the way in rather than on the way out, so what the
                  // parent reads back to their child is the string the account
                  // will actually hold. The API normalises again; this is about
                  // what is on screen.
                  onChange={(e) =>
                    onUsernameChange(normalizeGamerUsername(e.target.value))
                  }
                  placeholder={t("usernamePlaceholder")}
                  disabled={disabled}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  // The bound belongs to the pattern that judges the value, so
                  // it is read from there rather than spelled again here.
                  maxLength={GAMER_USERNAME_MAX_LENGTH}
                  aria-invalid={message !== null || undefined}
                  aria-describedby={message !== null ? errorId : undefined}
                />
                {message !== null && (
                  <p id={errorId} role="alert" className="text-sm text-destructive">
                    {message}
                  </p>
                )}
              </>
            );
          }}
        </Field>

        <Field label={c("password")} htmlFor={`${idPrefix}-password`}>
          {({ labelId }) => {
            const message = errorFor("password");
            const errorId = `${labelId}-error`;
            return (
              <>
                <PasswordInput
                  id={`${idPrefix}-password`}
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  disabled={disabled}
                  defaultVisible
                  autoComplete="new-password"
                  aria-invalid={message !== null || undefined}
                  aria-describedby={message !== null ? errorId : undefined}
                />
                {message !== null && (
                  <p id={errorId} role="alert" className="text-sm text-destructive">
                    {message}
                  </p>
                )}
              </>
            );
          }}
        </Field>
      </>
    );
  }

  if (signIn === "email") {
    return (
      <Field label={c("email")} htmlFor={`${idPrefix}-email`}>
        {({ labelId }) => {
          const message = errorFor("email");
          const errorId = `${labelId}-error`;
          return (
            <>
              <Input
                id={`${idPrefix}-email`}
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder={t("emailPlaceholder")}
                disabled={disabled}
                autoComplete="off"
                aria-invalid={message !== null || undefined}
                aria-describedby={message !== null ? errorId : undefined}
              />
              {message !== null && (
                <p id={errorId} role="alert" className="text-sm text-destructive">
                  {message}
                </p>
              )}
            </>
          );
        }}
      </Field>
    );
  }

  return null;
}
