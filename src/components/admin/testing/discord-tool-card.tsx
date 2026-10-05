"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription, StatusLine } from "@/components/ui/alert";
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
import {
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
  isSupportedLocale,
} from "@/lib/constants/locales";
import { getClient } from "@/lib/supabase/client";
import { useAuth } from "@/providers";
import {
  DISCORD_MESSAGE_MAX_LENGTH,
  type SendTestDiscordMessageBody,
} from "@/services/discord-link/discord-link.contracts";
import { useLinkedDiscordAccounts } from "@/services/discord-link/discord-link.queries";
import { DiscordLinkService } from "@/services/discord-link/discord-link.service";

type SendResult =
  | { type: "success"; kind: SendTestDiscordMessageBody["kind"]; jumpUrl: string }
  | { type: "error"; message: string };

/**
 * The admin testing page's Discord tool: a DM from this environment's bot to a
 * linked account, proving the send works end to end — plain text, or a preview
 * of the `/sub` command's first step over sample sessions.
 */
export function DiscordToolCard({ selectClass }: { selectClass: string }) {
  const t = useTranslations("admin.testing");
  const c = useTranslations("common");
  const { profile } = useAuth();
  const { data: accounts } = useLinkedDiscordAccounts();

  const [chosenProfileId, setChosenProfileId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  // "" is the recipient's own locale, which the /sub preview then takes from them.
  const [previewLocale, setPreviewLocale] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  // The admin's own link until they pick someone else, else the first in the
  // list: sending to yourself is the usual test.
  const recipientId =
    chosenProfileId ??
    accounts?.find((account) => account.profileId === profile?.id)?.profileId ??
    accounts?.[0]?.profileId ??
    "";
  const noneLinked = accounts !== undefined && accounts.length === 0;

  async function send(body: SendTestDiscordMessageBody) {
    setSending(true);
    setResult(null);
    try {
      const sent = await new DiscordLinkService(getClient()).sendTestMessage(body);
      setResult({ type: "success", kind: body.kind, jumpUrl: sent.jumpUrl });
    } catch (error) {
      // The route's own message, Discord's refusal included: this is admin
      // developer tooling, and "Cannot send messages to this user" is the
      // whole of what makes a failure here useful.
      setResult({
        type: "error",
        message: error instanceof Error ? error.message : t("failedToSendRequest"),
      });
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send({ kind: "text", profileId: recipientId, content });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <CardTitle>{t("discord.tool")}</CardTitle>
        </div>
        <CardDescription>{t("discord.toolDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t("discord.recipient")} htmlFor="discordRecipient">
            <select
              id="discordRecipient"
              required
              value={recipientId}
              onChange={(e) => setChosenProfileId(e.target.value)}
              disabled={noneLinked}
              className={selectClass}
            >
              {accounts?.map((account) => (
                <option key={account.profileId} value={account.profileId}>
                  {t("discord.recipientOption", {
                    name: account.name,
                    discordUsername: account.discordUsername,
                  })}
                </option>
              ))}
            </select>
          </Field>
          {noneLinked && (
            <StatusLine status="info" muted>
              {t("discord.noLinkedAccounts")}
            </StatusLine>
          )}

          <Field label={t("discord.message")} htmlFor="discordContent">
            <Textarea
              id="discordContent"
              required
              rows={5}
              maxLength={DISCORD_MESSAGE_MAX_LENGTH}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("discord.messagePlaceholder")}
            />
          </Field>

          <Field label={t("discord.previewLocale")} htmlFor="discordPreviewLocale">
            <select
              id="discordPreviewLocale"
              value={previewLocale}
              onChange={(e) => setPreviewLocale(e.target.value)}
              className={selectClass}
            >
              <option value="">{t("discord.recipientsLocale")}</option>
              {SUPPORTED_LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                  {LOCALE_CONFIG[locale].nativeLabel}
                </option>
              ))}
            </select>
          </Field>

          {result && (
            <Alert variant={result.type === "success" ? "success" : "destructive"}>
              <AlertDescription>
                {result.type === "success" ? (
                  <>
                    {result.kind === "text"
                      ? t("discord.sent")
                      : t("discord.subPreviewSent")}{" "}
                    <a
                      href={result.jumpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline underline-offset-2"
                    >
                      {t("discord.openInDiscord")}
                    </a>
                  </>
                ) : (
                  result.message
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Two sends, neither the other's alternative. The preview needs no
              message, so it is not a submit and the text's required field does
              not hold it back. */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="submit"
              disabled={sending || noneLinked || recipientId === ""}
            >
              {sending ? c("sending") : t("discord.send")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={sending || noneLinked || recipientId === ""}
              onClick={() =>
                void send({
                  kind: "subPreview",
                  profileId: recipientId,
                  ...(isSupportedLocale(previewLocale) && { locale: previewLocale }),
                })
              }
            >
              {t("discord.sendSubPreview")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
