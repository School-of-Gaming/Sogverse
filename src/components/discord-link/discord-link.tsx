"use client";

import { useState } from "react";
import { CircleCheck, Link2, Loader2, ShieldX, TimerOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { parseJsonResponse, readApiError } from "@/lib/api/json-response";
import { ROUTES } from "@/lib/constants";
import {
  DISCORD_LINK_ERROR_CODES,
  discordLinkResponse,
  type DiscordLinkBody,
} from "@/services/discord-link/discord-link.contracts";

/** The two roles that can hold a Discord link. */
export type DiscordLinkRole = "admin" | "gedu";

/** Why a token can no longer be spent; both send the reader back to Discord. */
type DeadLink = "used" | "expired" | "missingToken";

type LinkResult =
  | { kind: "linked"; username: string }
  | { kind: "dead"; reason: DeadLink };

/**
 * The question a Gedu or an admin answers after running `/link` in Discord:
 * link the Discord account that asked to this account.
 *
 * Nothing is spent until the button is pressed — the page's GET only renders,
 * so a preview bot or a scanner opening the URL leaves the token alone. The
 * answer replaces the card in place: linked, or a dead link that sends the
 * reader back to Discord. A failure that is neither keeps the card and its
 * button, so the reader can try again with the same token.
 */
export function DiscordLinkConfirm({
  token,
  role,
}: {
  token: string;
  role: DiscordLinkRole;
}) {
  const t = useTranslations("discordLink.confirm");
  const [committing, setCommitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [outcome, setOutcome] = useState<LinkResult | null>(null);

  async function link() {
    setCommitting(true);
    setFailed(false);
    try {
      const response = await fetch("/api/discord/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token } satisfies DiscordLinkBody),
      });
      if (response.ok) {
        const { discordUsername } = await parseJsonResponse(
          response,
          discordLinkResponse,
        );
        // The card is swapped for the result; the latch stays set.
        setOutcome({ kind: "linked", username: discordUsername });
        return;
      }
      const error = await readApiError(response, "Failed to link Discord");
      if (error.code === DISCORD_LINK_ERROR_CODES.notFound) {
        setOutcome({ kind: "dead", reason: "used" });
        return;
      }
      if (error.code === DISCORD_LINK_ERROR_CODES.expired) {
        setOutcome({ kind: "dead", reason: "expired" });
        return;
      }
      throw error;
    } catch {
      setFailed(true);
      setCommitting(false);
    }
  }

  if (outcome?.kind === "linked") {
    return <DiscordLinkLinked username={outcome.username} role={role} />;
  }
  if (outcome?.kind === "dead") return <DiscordLinkDead reason={outcome.reason} />;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
      <Link2 className="h-12 w-12 text-act" aria-hidden />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("body")}</p>
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

function DiscordLinkLinked({
  username,
  role,
}: {
  username: string;
  role: DiscordLinkRole;
}) {
  const t = useTranslations("discordLink.linked");
  return (
    <Outcome
      icon={<CircleCheck className="h-12 w-12 text-act" aria-hidden />}
      title={t("title", { username })}
      body={t("body")}
    >
      {role === "admin" ? (
        <Link href={ROUTES.admin.dashboard} className={buttonVariants()}>
          {t("goToDashboard")}
        </Link>
      ) : (
        <Link href={ROUTES.gedu.dashboard} className={buttonVariants()}>
          {t("goToMySog")}
        </Link>
      )}
    </Outcome>
  );
}

/**
 * A token that can no longer be spent — used, expired, or missing from the
 * address. Each link works once, so the only way on is a fresh `/link`.
 */
export function DiscordLinkDead({ reason }: { reason: DeadLink }) {
  const t = useTranslations("discordLink");
  return (
    <Outcome
      icon={<TimerOff className="h-12 w-12 text-muted-foreground" aria-hidden />}
      title={t(`${reason}.title`)}
      body={t(`${reason}.body`)}
    />
  );
}

/** A customer or a gamer: refused, with no button, before anything is read. */
export function DiscordLinkRefused() {
  const t = useTranslations("discordLink.refused");
  return (
    <Outcome
      icon={<ShieldX className="h-12 w-12 text-muted-foreground" aria-hidden />}
      title={t("title")}
      body={t("body")}
    />
  );
}

function Outcome({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      {icon}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>
  );
}
