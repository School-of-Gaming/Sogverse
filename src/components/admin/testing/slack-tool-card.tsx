"use client";

import { useState } from "react";
import { Hash } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SLACK_MESSAGE_MAX_LENGTH } from "@/services/slack/slack.contracts";
import { SlackService } from "@/services/slack/slack.service";

type SendResult =
  | { type: "success"; permalink: string }
  | { type: "error"; message: string };

/**
 * The admin testing page's Slack tool: plain text posted to a channel from
 * this environment's Slack bot, proving the send works end to end.
 */
export function SlackToolCard() {
  const t = useTranslations("admin.testing");
  const c = useTranslations("common");

  const [channel, setChannel] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  async function send() {
    setSending(true);
    setResult(null);
    try {
      const sent = await new SlackService().sendTestMessage({ channel, text });
      setResult({ type: "success", permalink: sent.permalink });
    } catch (error) {
      // The route's own message, Slack's refusal included: this is admin
      // developer tooling, and "channel_not_found" is the whole of what makes
      // a failure here useful.
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
    void send();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Hash className="h-5 w-5" />
          <CardTitle>{t("slack.tool")}</CardTitle>
        </div>
        <CardDescription>{t("slack.toolDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t("slack.channel")} htmlFor="slackChannel">
              <Input
                id="slackChannel"
                required
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder={t("slack.channelPlaceholder")}
              />
            </Field>
          </div>
          <Field label={t("slack.message")} htmlFor="slackText">
            <Textarea
              id="slackText"
              required
              rows={5}
              maxLength={SLACK_MESSAGE_MAX_LENGTH}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("slack.messagePlaceholder")}
            />
          </Field>

          {result && (
            <Alert variant={result.type === "success" ? "success" : "destructive"}>
              <AlertDescription>
                {result.type === "success" ? (
                  <>
                    {t("slack.sent")}{" "}
                    <a
                      href={result.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline underline-offset-2"
                    >
                      {t("slack.openInSlack")}
                    </a>
                  </>
                ) : (
                  result.message
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="submit" disabled={sending}>
              {sending ? c("sending") : t("slack.send")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
