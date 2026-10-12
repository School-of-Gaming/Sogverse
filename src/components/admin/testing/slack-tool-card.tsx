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
import { testingSelectClass as selectClass } from "@/components/admin/testing/testing-locale-select";
import {
  SLACK_MESSAGE_MAX_LENGTH,
  type SendTestSlackMessageBody,
} from "@/services/slack/slack.contracts";
import { SlackService } from "@/services/slack/slack.service";

type SlackTemplate = SendTestSlackMessageBody["template"];

const TEMPLATES: readonly SlackTemplate[] = ["text", "subFlow"];

const TEMPLATE_LABEL_KEYS = {
  text: "slack.templatePlain",
  subFlow: "slack.templateSubFlow",
} as const satisfies Record<SlackTemplate, string>;

type SendResult =
  | { type: "success"; template: SlackTemplate }
  | { type: "error"; message: string };

/**
 * The admin testing page's Slack tool: a post to a channel from this
 * environment's Slack bot, proving the send works end to end — plain text, or
 * every message the staff channel can show about a substitution request, as a
 * set, like the Discord tool beside it.
 */
export function SlackToolCard() {
  const t = useTranslations("admin.testing");
  const c = useTranslations("common");

  const [channel, setChannel] = useState("");
  const [template, setTemplate] = useState<SlackTemplate>("text");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  async function send(body: SendTestSlackMessageBody) {
    setSending(true);
    setResult(null);
    try {
      await new SlackService().sendTestMessage(body);
      setResult({ type: "success", template: body.template });
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
    if (template === "text") {
      void send({ template, channel, text });
    } else {
      void send({ template, channel });
    }
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
          {/* The Discord tool's row: where it goes, then which template. */}
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
            <Field label={t("template")} htmlFor="slackTemplate">
              <select
                id="slackTemplate"
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
          </div>

          {template === "text" && (
            <div className="space-y-3 rounded-md border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("templateParameters")}
              </p>
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
            </div>
          )}

          {result && (
            <Alert variant={result.type === "success" ? "success" : "destructive"}>
              <AlertDescription>
                {result.type === "error"
                  ? result.message
                  : result.template === "text"
                    ? t("slack.sent")
                    : t("slack.subPreviewSent")}
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
