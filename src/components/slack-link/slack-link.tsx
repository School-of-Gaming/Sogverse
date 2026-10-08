"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { codeTag } from "@/components/ui/inline-code";
import { Link } from "@/i18n/navigation";
import { parseJsonResponse, readApiError } from "@/lib/api/json-response";
import { ROUTES } from "@/lib/constants";
import {
  SLACK_LINK_ERROR_CODES,
  slackLinkResponse,
  type SlackLinkBody,
} from "@/services/slack-link/slack-link.contracts";

/** Why a token can no longer be spent; each sends the reader back to Slack. */
type DeadLink = "used" | "expired" | "missingToken";

type LinkResult =
  | { kind: "linked"; username: string }
  | { kind: "dead"; reason: DeadLink };

/**
 * The question an admin answers after running the link command in Slack: link
 * the named Slack account to this admin account, so its Accept buttons approve
 * substitutes as them. The name is the point: an admin sent a link someone
 * else minted can see that it is not theirs.
 *
 * Nothing is spent until the button is pressed. The answer replaces the card
 * in place: linked, or a dead link that sends the reader back to Slack. A
 * failure that is neither keeps the card and its button, so the reader can
 * try again with the same token.
 */
export function SlackLinkConfirm({
  token,
  slackUsername,
}: {
  token: string;
  /** The Slack account the token was minted for, read by the page. */
  slackUsername: string;
}) {
  const t = useTranslations("slackLink.confirm");
  const [committing, setCommitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [outcome, setOutcome] = useState<LinkResult | null>(null);

  async function link() {
    setCommitting(true);
    setFailed(false);
    try {
      const response = await fetch("/api/slack/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token } satisfies SlackLinkBody),
      });
      if (response.ok) {
        const { slackUsername } = await parseJsonResponse(response, slackLinkResponse);
        // The card is swapped for the result; the latch stays set.
        setOutcome({ kind: "linked", username: slackUsername });
        return;
      }
      const error = await readApiError(response, "Failed to link Slack");
      if (error.code === SLACK_LINK_ERROR_CODES.notFound) {
        setOutcome({ kind: "dead", reason: "used" });
        return;
      }
      if (error.code === SLACK_LINK_ERROR_CODES.expired) {
        setOutcome({ kind: "dead", reason: "expired" });
        return;
      }
      throw error;
    } catch {
      setFailed(true);
      setCommitting(false);
    }
  }

  if (outcome?.kind === "linked") return <SlackLinkLinked username={outcome.username} />;
  if (outcome?.kind === "dead") return <SlackLinkDead reason={outcome.reason} />;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t.rich("body", {
            username: slackUsername,
            b: (chunks) => <b className="font-semibold text-foreground">{chunks}</b>,
          })}
        </p>
      </div>

      {failed ? (
        <Alert variant="destructive" className="text-left">
          <AlertDescription>{t("failed")}</AlertDescription>
        </Alert>
      ) : null}

      <Button disabled={committing} onClick={() => void link()}>
        {committing ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t("action")}
      </Button>
    </div>
  );
}

function SlackLinkLinked({ username }: { username: string }) {
  const t = useTranslations("slackLink.linked");
  return (
    <Outcome title={t("title", { username })} body={t("body")}>
      <Link href={ROUTES.admin.dashboard} className={buttonVariants()}>
        {t("goToDashboard")}
      </Link>
    </Outcome>
  );
}

/**
 * A token that can no longer be spent — used, expired, or missing from the
 * address. Each link works once, so the only way on is a fresh one from Slack.
 */
export function SlackLinkDead({ reason }: { reason: DeadLink }) {
  const t = useTranslations("slackLink");
  return <Outcome title={t(`${reason}.title`)} body={t.rich(`${reason}.body`, { code: codeTag })} />;
}

/** Anyone but an admin: refused, with no button, before anything is read. */
export function SlackLinkRefused() {
  const t = useTranslations("slackLink.refused");
  return <Outcome title={t("title")} body={t("body")} />;
}

function Outcome({
  title,
  body,
  children,
}: {
  title: string;
  body: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>
  );
}
