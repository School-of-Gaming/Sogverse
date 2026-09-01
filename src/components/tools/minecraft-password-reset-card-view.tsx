"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { MINECRAFT_EDUCATION_DOMAINS } from "@/lib/constants/minecraft-education";
import { cn } from "@/lib/utils";
import {
  MINECRAFT_PASSWORD_RESET_MAX_USERNAMES,
  type MinecraftPasswordResetFailure,
  type MinecraftPasswordResetResult,
} from "@/services/minecraft-education/minecraft-education.contracts";
import { parseUsernameInput } from "./parse-username-input";

export interface MinecraftPasswordResetCardViewProps {
  /**
   * The results of the last submit, or `null` before there has been one. An
   * empty array is not the same thing and cannot happen — a submit always
   * carries at least one username and answers one row per username.
   */
  results: readonly MinecraftPasswordResetResult[] | null;
  /** The submit is in flight: the button is disabled and spins. */
  submitting: boolean;
  /** Already-translated failure message for the *request*, or `null`. */
  error: string | null;
  onSubmit: (usernames: string[]) => void;
}

/**
 * Presentational core of the Minecraft Education password-reset tool, rendered
 * unchanged on the gedu dashboard and the admin tools page.
 *
 * It owns the textarea and what can be decided from it — duplicates, addresses
 * on a domain this tool does not reset, the batch cap — and nothing else: no
 * fetch, no mutation, no router. That is what lets the style guide drive it from
 * fixture results with the action inert, and it is why the two surfaces are
 * looking at the same component rather than at two copies of one.
 *
 * The results appear below the form only once a submit has answered, and no
 * space is held open for them before that. They are the direct result of a
 * button the reader just pressed, so the page growing under them is the change
 * they asked for; a reserved slot would instead be a permanent hole beside a
 * form that has never been used.
 */
export function MinecraftPasswordResetCardView({
  results,
  submitting,
  error,
  onSubmit,
}: MinecraftPasswordResetCardViewProps) {
  const t = useTranslations("tools.minecraftPasswordReset");
  const [raw, setRaw] = useState("");

  const { usernames, unsupportedDomain } = parseUsernameInput(raw);
  // The domains are named in the copy rather than baked into it: the hint and
  // the warning both have to stay true if the tenant ever gains a third, and a
  // list hardcoded in five locales would not.
  const domains = MINECRAFT_EDUCATION_DOMAINS.map((d) => `@${d}`).join(", ");
  const tooMany = usernames.length > MINECRAFT_PASSWORD_RESET_MAX_USERNAMES;
  const canSubmit = usernames.length > 0 && !tooMany && !submitting;

  // `flatMap` rather than `filter` so the success branch is narrowed for the
  // copy-all lines below, which read `password`.
  const successes = (results ?? []).flatMap((result) =>
    result.ok ? [result] : [],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            onSubmit(usernames);
          }}
        >
          <Field
            label={t("inputLabel")}
            htmlFor="minecraft-password-reset-usernames"
            hint={t("inputHint", { domains })}
          >
            {({ hintId }) => (
              <Textarea
                id="minecraft-password-reset-usernames"
                rows={4}
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                placeholder={t("inputPlaceholder")}
                spellCheck={false}
                autoCapitalize="none"
                aria-describedby={hintId}
                className="font-mono"
              />
            )}
          </Field>

          {unsupportedDomain.length > 0 && (
            <p className="flex items-start gap-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {t("unsupportedDomainEntries", {
                  count: unsupportedDomain.length,
                  entries: unsupportedDomain.join(", "),
                  domains,
                })}
              </span>
            </p>
          )}

          {tooMany && (
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {t("tooMany", {
                  max: MINECRAFT_PASSWORD_RESET_MAX_USERNAMES,
                  count: usernames.length,
                })}
              </span>
            </p>
          )}

          {/* Centered to match the instant room card's action, the panel
              rendered directly below this one on the gedu dashboard. */}
          <div className="flex justify-center">
            <Button type="submit" disabled={!canSubmit} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting
                ? t("submitting")
                : t("submit", { count: usernames.length })}
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>

        {results !== null && (
          <div className="space-y-3 border-t border-border pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                {t("resultsHeading")}
              </h3>
              {successes.length > 0 && (
                <CopyAllButton
                  lines={successes.map(
                    (result) => `${result.username}: ${result.password}`,
                  )}
                />
              )}
            </div>

            <ul className="space-y-2">
              {results.map((result, index) => (
                <li
                  // Two rows can legitimately carry the same username — the
                  // submitted list is de-duplicated, but a fixture or a future
                  // caller need not be — so the index is the only stable key.
                  key={`${result.username}-${index}`}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border px-3 py-2",
                    result.ok
                      ? "border-border bg-muted/30"
                      : "border-destructive bg-muted",
                  )}
                >
                  {result.ok ? (
                    <>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {result.upn}
                        </p>
                        {result.forceChange && (
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                            {t("mustChangeOnFirstSignIn")}
                          </p>
                        )}
                      </div>
                      <PasswordChip
                        upn={result.upn}
                        password={result.password}
                      />
                    </>
                  ) : (
                    <>
                      <p className="min-w-0 truncate text-sm font-medium">
                        {result.username}
                      </p>
                      <p className="text-sm text-destructive">
                        <FailureMessage failure={result.error} />
                      </p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The new password, click to copy.
 *
 * The label and the code never change when it is copied — only the icon swaps
 * for a same-sized one and the border recolours — so a row never moves under a
 * reader mid-list.
 */
function PasswordChip({ upn, password }: { upn: string; password: string }) {
  const t = useTranslations("tools.minecraftPasswordReset");
  const { copied, copy } = useCopyToClipboard();

  return (
    <button
      type="button"
      onClick={() => void copy(password)}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        copied && "border-success text-success",
      )}
      // The visible content is the password itself, which a screen reader would
      // otherwise announce with no hint that it can be copied or whose it is.
      aria-label={copied ? t("copied") : t("copyPasswordFor", { upn })}
      title={copied ? t("copied") : t("copyPasswordFor", { upn })}
    >
      <span>{password}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5 opacity-60" aria-hidden />
      )}
    </button>
  );
}

/** `username: password`, one per line — the shape a session chat wants. */
function CopyAllButton({ lines }: { lines: readonly string[] }) {
  const t = useTranslations("tools.minecraftPasswordReset");
  const { copied, copy } = useCopyToClipboard();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void copy(lines.join("\n"))}
      className={cn("gap-1.5", copied && "border-success text-success")}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden />
      ) : (
        <Copy className="h-4 w-4" aria-hidden />
      )}
      {copied ? t("copied") : t("copyAll", { count: lines.length })}
    </Button>
  );
}

/** One failure code, in the reader's language. */
function FailureMessage({
  failure,
}: {
  failure: MinecraftPasswordResetFailure;
}) {
  const t = useTranslations("tools.minecraftPasswordReset.errors");

  switch (failure.code) {
    case "invalid_username":
      return <>{t("invalidUsername")}</>;
    case "unsupported_domain":
      return (
        <>
          {t("unsupportedDomain", {
            domains: failure.domains.map((domain) => `@${domain}`).join(", "),
          })}
        </>
      );
    case "not_found":
      return (
        <>
          {t("notFound", {
            domains: failure.domains.map((domain) => `@${domain}`).join(", "),
          })}
        </>
      );
    case "azure_auth":
      return <>{t("azureAuth")}</>;
    case "graph_error":
      return <>{t("graphError", { status: failure.status })}</>;
  }
}
