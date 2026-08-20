"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/providers";
import { SENDER_EMAIL, SENDER_NAME } from "@/lib/constants";
import { SUPPORTED_LOCALES, LOCALE_CONFIG, DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "@/lib/constants/locales";
import { useLanguageNames } from "@/hooks/use-language-names";
import { findOption } from "@/lib/utils";
import { templateRegistry, type TemplateField } from "@/lib/email-templates/registry";

const EMAIL_PROVIDERS = ["brevo", "klaviyo"] as const;
type EmailProvider = (typeof EMAIL_PROVIDERS)[number];
const EMAIL_MODES = ["custom", "template"] as const;
type EmailMode = (typeof EMAIL_MODES)[number];

interface EmailResult {
  type: "success" | "error";
  message: string;
}

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function isSelectField(field: TemplateField): field is Extract<TemplateField, { type: "select" }> {
  return "type" in field && field.type === "select";
}

function isTextareaField(field: TemplateField): field is Extract<TemplateField, { type: "textarea" }> {
  return "type" in field && field.type === "textarea";
}

// --- Page ---

export default function TestingPage() {
  const t = useTranslations('admin.testing');
  const languageName = useLanguageNames();
  const c = useTranslations('common');
  const { profile } = useAuth();

  const [mode, setMode] = useState<EmailMode>("template");
  const [provider, setProvider] = useState<EmailProvider>("brevo");
  const [toEmail, setToEmail] = useState(profile?.email ?? "");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<EmailResult | null>(null);

  // Custom mode state
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");

  // Template mode state
  const templateKeys = Object.keys(templateRegistry);
  const [templateName, setTemplateName] = useState(templateKeys[0]);
  const [templateParams, setTemplateParams] = useState<Record<string, string>>({});
  const [templateLocale, setTemplateLocale] = useState<SupportedLocale>(DEFAULT_LOCALE);

  const selectedTemplate = templateRegistry[templateName];

  function handleModeChange(newMode: EmailMode) {
    setMode(newMode);
    setResult(null);
  }

  function handleTemplateChange(name: string) {
    setTemplateName(name);
    setTemplateParams({});
    setResult(null);
  }

  function updateParam(key: string, value: string) {
    setTemplateParams((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);

    try {
      let response: Response;

      if (mode === "custom") {
        response = await fetch("/api/admin/send-test-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "custom",
            provider,
            toEmail,
            subject,
            body,
            ...(replyToEmail && { replyToEmail }),
          }),
        });
      } else {
        response = await fetch("/api/admin/send-test-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "template",
            template: templateName,
            toEmail,
            locale: templateLocale,
            params: (() => {
              const raw = Object.fromEntries(
                selectedTemplate.fields.map((f) => [
                  f.key,
                  templateParams[f.key] || (isSelectField(f) ? f.options[0].value : f.placeholder),
                ]),
              );
              return selectedTemplate.resolveParams ? selectedTemplate.resolveParams(raw) : raw;
            })(),
          }),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        setResult({ type: "error", message: data.error });
      } else {
        setResult({
          type: "success",
          message: t('emailSentSuccess', { messageId: data.messageId }),
        });
      }
    } catch {
      setResult({ type: "error", message: t('failedToSendRequest') });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('description')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>{t('emailTool')}</CardTitle>
          </div>
          <CardDescription>
            {t('emailToolDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Provider + Mode */}
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t('provider')} htmlFor="provider">
                <select
                  id="provider"
                  value={provider}
                  onChange={(e) => {
                    const value = findOption(EMAIL_PROVIDERS, e.target.value);
                    if (value) setProvider(value);
                  }}
                  className={selectClass}
                >
                  <option value="brevo">{t('brevo')}</option>
                  <option value="klaviyo" disabled>
                    {t('klaviyoComingSoon')}
                  </option>
                </select>
              </Field>
              <Field label={t('content')} htmlFor="mode">
                <select
                  id="mode"
                  value={mode}
                  onChange={(e) => {
                    const value = findOption(EMAIL_MODES, e.target.value);
                    if (value) handleModeChange(value);
                  }}
                  className={selectClass}
                >
                  <option value="template">{t('template')}</option>
                  <option value="custom">{t('custom')}</option>
                </select>
              </Field>
            </div>

            {/* To Email */}
            <Field label={t('toEmail')} htmlFor="toEmail">
              <Input
                id="toEmail"
                type="text"
                required
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder={t('toEmailPlaceholder')}
              />
            </Field>

            {/* Template mode fields */}
            {mode === "template" && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={t('template')} htmlFor="template">
                    <select
                      id="template"
                      value={templateName}
                      onChange={(e) => handleTemplateChange(e.target.value)}
                      className={selectClass}
                    >
                      {Object.entries(templateRegistry).map(([key, def]) => (
                        <option key={key} value={key}>
                          {def.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('language')} htmlFor="templateLocale">
                    <select
                      id="templateLocale"
                      value={templateLocale}
                      onChange={(e) => {
                        if (isSupportedLocale(e.target.value)) setTemplateLocale(e.target.value);
                      }}
                      className={selectClass}
                    >
                      {SUPPORTED_LOCALES.map((opt) => (
                        <option key={opt} value={opt}>
                          {LOCALE_CONFIG[opt].nativeLabel} ({languageName(opt, LOCALE_CONFIG[opt].label)})
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="space-y-3 rounded-md border border-border p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('templateParameters')}
                    </p>
                    {selectedTemplate.fields.map((field) => (
                      <Field
                        key={field.key}
                        label={field.label}
                        htmlFor={`param-${field.key}`}
                      >
                        {isSelectField(field) ? (
                          <select
                            id={`param-${field.key}`}
                            value={templateParams[field.key] ?? field.options[0].value}
                            onChange={(e) => updateParam(field.key, e.target.value)}
                            className={selectClass}
                          >
                            {field.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : isTextareaField(field) ? (
                          <Textarea
                            id={`param-${field.key}`}
                            rows={10}
                            value={templateParams[field.key] ?? ""}
                            onChange={(e) => updateParam(field.key, e.target.value)}
                            placeholder={field.placeholder}
                          />
                        ) : (
                          <Input
                            id={`param-${field.key}`}
                            value={templateParams[field.key] ?? ""}
                            onChange={(e) => updateParam(field.key, e.target.value)}
                            placeholder={field.placeholder}
                          />
                        )}
                      </Field>
                    ))}
                  </div>
              </>
            )}

            {/* Custom mode fields */}
            {mode === "custom" && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label={t('fromEmail')} htmlFor="fromEmail">
                    <Input
                      id="fromEmail"
                      type="email"
                      value={SENDER_EMAIL}
                      disabled
                    />
                  </Field>
                  <Field label={t('fromName')} htmlFor="fromName">
                    <Input
                      id="fromName"
                      value={SENDER_NAME}
                      disabled
                    />
                  </Field>
                </div>

                <Field label={t('subject')} htmlFor="subject">
                  <Input
                    id="subject"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t('subjectPlaceholder')}
                  />
                </Field>

                <Field label={t('body')} htmlFor="body">
                  <Textarea
                    id="body"
                    required
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={t('bodyPlaceholder')}
                    rows={5}
                  />
                </Field>

                <Field label={t('replyTo')} htmlFor="replyToEmail" optional>
                  <Input
                    id="replyToEmail"
                    type="email"
                    value={replyToEmail}
                    onChange={(e) => setReplyToEmail(e.target.value)}
                    placeholder={t('replyToPlaceholder')}
                  />
                </Field>
              </>
            )}

            {/* Result banner */}
            {result && (
              <div
                className={`rounded-md p-3 text-sm ${
                  result.type === "success"
                    ? "bg-success/10 text-success"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {result.message}
              </div>
            )}

            <Button type="submit" disabled={sending}>
              {sending ? c('sending') : t('sendTestEmail')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

