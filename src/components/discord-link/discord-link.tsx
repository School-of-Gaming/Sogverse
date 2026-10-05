"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import discordSymbol from "@/assets/partners/discord-symbol-blurple.svg";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { codeTag } from "@/components/ui/inline-code";
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
 * link the named Discord account to this account. The name is the point: a
 * Gedu sent a link someone else minted can see that it is not theirs.
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
  discordUsername,
}: {
  token: string;
  role: DiscordLinkRole;
  /** The Discord account the token was minted for, read by the page. */
  discordUsername: string;
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
      <DiscordSymbol />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t.rich("body", {
            username: discordUsername,
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
      title={t(`${reason}.title`)}
      body={t.rich(`${reason}.body`, { code: codeTag })}
    />
  );
}

/** A customer or a gamer: refused, with no button, before anything is read. */
export function DiscordLinkRefused() {
  const t = useTranslations("discordLink.refused");
  return (
    <Outcome title={t("title")} body={t("body")} />
  );
}

/**
 * Discord's own symbol, as Discord ships it, at the head of every card on the
 * page — the page is about a Discord account whatever its outcome, and the
 * title beside it says which outcome. Decorative: the copy names Discord.
 * Height only, so the width follows the file's proportions; `unoptimized`
 * because the optimizer refuses SVG.
 */
function DiscordSymbol() {
  return (
    <Image src={discordSymbol} alt="" height={40} unoptimized aria-hidden />
  );
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
      <DiscordSymbol />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>
  );
}
