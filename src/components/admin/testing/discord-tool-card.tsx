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
  TestingLocaleSelect,
  testingSelectClass as selectClass,
} from "@/components/admin/testing/testing-locale-select";
import { DEFAULT_LOCALE, type SupportedLocale } from "@/lib/constants/locales";
import { getClient } from "@/lib/supabase/client";
import { useAuth } from "@/providers";
import {
  DISCORD_MESSAGE_MAX_LENGTH,
  type SendTestDiscordMessageBody,
} from "@/services/discord-link/discord-link.contracts";
import { useLinkedDiscordAccounts } from "@/services/discord-link/discord-link.queries";
import { DiscordLinkService } from "@/services/discord-link/discord-link.service";

type DiscordTemplate = SendTestDiscordMessageBody["template"];

const TEMPLATES: readonly DiscordTemplate[] = ["text", "subSessions", "subNotLinked"];

const TEMPLATE_LABEL_KEYS = {
  text: "discord.templatePlain",
  subSessions: "discord.templateSubSessions",
  subNotLinked: "discord.templateSubNotLinked",
} as const satisfies Record<DiscordTemplate, string>;

type SendResult =
  | { type: "success"; template: DiscordTemplate; jumpUrl: string }
  | { type: "error"; message: string };

/**
 * The admin testing page's Discord tool: a DM from this environment's bot to a
 * linked account, proving the send works end to end — a template chosen from
 * plain text and the `/sub` command's two answers, like the email tool beside it.
 */
export function DiscordToolCard() {
  const t = useTranslations("admin.testing");
  const c = useTranslations("common");
  const { profile } = useAuth();
  const { data: accounts } = useLinkedDiscordAccounts();

  const [chosenProfileId, setChosenProfileId] = useState<string | null>(null);
  const [template, setTemplate] = useState<DiscordTemplate>("text");
  const [content, setContent] = useState("");
  const [previewLocale, setPreviewLocale] = useState<SupportedLocale>(DEFAULT_LOCALE);
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
      setResult({ type: "success", template: body.template, jumpUrl: sent.jumpUrl });
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
    if (template === "text") {
      void send({ template, profileId: recipientId, content });
    } else {
      void send({ template, profileId: recipientId, locale: previewLocale });
    }
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
          {/* The email tool's row: who it goes to and which template. The
              language belongs to the /sub templates only (plain text goes as
              typed), so it joins the row last, after the template that decides
              it: choosing a template never moves the select just used. */}
          <div className="grid gap-4 md:grid-cols-3">
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
            <Field label={t("template")} htmlFor="discordTemplate">
              <select
                id="discordTemplate"
                value={template}
                onChange={(e) => {
                  const chosen = TEMPLATES.find((value) => value === e.target.value);
                  if (chosen) setTemplate(chosen);
                }}
                className={selectClass}
              >
                {TEMPLATES.map((value) => (
                  <option key={value} value={value}>
                    {t(TEMPLATE_LABEL_KEYS[value])}
                  </option>
                ))}
              </select>
            </Field>
            {template !== "text" && (
              <TestingLocaleSelect
                id="discordPreviewLocale"
                value={previewLocale}
                onChange={setPreviewLocale}
              />
            )}
          </div>
          {noneLinked && (
            <StatusLine status="info" muted>
              {t("discord.noLinkedAccounts")}
            </StatusLine>
          )}

          {template === "text" && (
            <div className="space-y-3 rounded-md border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("templateParameters")}
              </p>
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
            </div>
          )}

          {result && (
            <Alert variant={result.type === "success" ? "success" : "destructive"}>
              <AlertDescription>
                {result.type === "success" ? (
                  <>
                    {result.template === "text"
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

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="submit"
              disabled={sending || noneLinked || recipientId === ""}
            >
              {sending ? c("sending") : t("discord.send")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
