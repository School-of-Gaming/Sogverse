"use client";

import { useEffect, useState } from "react";
import { Mail, MonitorPlay, RefreshCw } from "lucide-react";
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
import {
  templateRegistry,
  type TemplateDefinition,
  type TemplateField,
} from "@/lib/email-templates/registry";
import { getEmailTranslator } from "@/lib/email-templates/translator";

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

/**
 * What an untouched field posts: a select its first option, a text input its
 * placeholder — and a textarea whatever it holds, empty included, so its
 * placeholder can be a hint and an empty value can mean "none".
 */
function fieldValue(field: TemplateField, typed: string | undefined): string {
  switch (field.type) {
    case "select":
      return typed || field.options[0].value;
    case "textarea":
      return typed ?? "";
    default:
      return typed || field.placeholder;
  }
}

/**
 * The form's values as the template takes them — every field resolved to what
 * an untouched one posts, then run through the entry's own resolver.
 *
 * Shared by the send and the preview on purpose: a preview built from a
 * different param bag than the send is a picture of a mail nobody receives,
 * which is the one thing a preview must never be.
 */
function templateApiParams(
  definition: TemplateDefinition,
  typed: Record<string, string>,
): Record<string, string | boolean | null> {
  const raw = Object.fromEntries(
    definition.fields.map((field) => [field.key, fieldValue(field, typed[field.key])]),
  );
  return definition.resolveParams ? definition.resolveParams(raw) : raw;
}

/**
 * What the preview is currently showing — a snapshot of the form, not a live
 * view of it.
 *
 * The distinction is the whole design of the panel below. Re-rendering on every
 * keystroke would reload the iframe and throw away wherever the reader had
 * scrolled to in the mail, which is exactly what someone editing the report
 * markdown is watching. So the snapshot is replaced on the two choices that
 * change *which* mail is on screen — the template and the locale — and on the
 * refresh button for everything else.
 */
interface PreviewRequest {
  template: string;
  locale: SupportedLocale;
  params: Record<string, string>;
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

  // Preview state
  const [previewRequest, setPreviewRequest] = useState<PreviewRequest>(() => ({
    template: templateKeys[0],
    locale: DEFAULT_LOCALE,
    params: {},
  }));
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const selectedTemplate = templateRegistry[templateName];

  /**
   * Render the snapshot with the same registry call the send route makes —
   * but in the preview context, so a fixture whose art lives on this dev
   * server is resolved against *this browser's* origin instead of being
   * dropped as unreachable. The mail a recipient would get is the send's job;
   * the mail as it was designed is this one's.
   *
   * The translator is an awaited dynamic import of one locale's messages, so
   * this is a chunk fetch rather than a round trip: nothing is drawn while it
   * is in flight, inside a box that is already its final size.
   */
  useEffect(() => {
    // A cancellation token rather than a boolean the cleanup closes over: two
    // requests can be in flight across a locale change, and the one that
    // resolves second must not be the one that paints.
    const superseded = new AbortController();
    void (async () => {
      try {
        const t = await getEmailTranslator(previewRequest.locale);
        if (superseded.signal.aborted) return;
        const definition = templateRegistry[previewRequest.template];
        const rendered = definition.render(
          templateApiParams(definition, previewRequest.params),
          t,
          previewRequest.locale,
          { to: "preview", origin: window.location.origin },
        );
        setPreview({ subject: rendered.subject, html: rendered.html });
        setPreviewError(null);
      } catch (error) {
        if (superseded.signal.aborted) return;
        setPreview(null);
        // The raw message, like the send result banner beside it: a zod path is
        // what tells the admin which field they mistyped, and this page is
        // developer-facing tooling.
        setPreviewError(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => {
      superseded.abort();
    };
  }, [previewRequest]);

  function handleModeChange(newMode: EmailMode) {
    setMode(newMode);
    setResult(null);
  }

  function handleTemplateChange(name: string) {
    setTemplateName(name);
    setTemplateParams({});
    setResult(null);
    // A different template is a different mail, so the snapshot follows it
    // rather than sitting there describing the previous one. Its params are
    // cleared above, so the preview shows what an untouched form would send.
    setPreviewRequest({ template: name, locale: templateLocale, params: {} });
  }

  function handleTemplateLocaleChange(locale: SupportedLocale) {
    setTemplateLocale(locale);
    setPreviewRequest({ template: templateName, locale, params: templateParams });
  }

  function refreshPreview() {
    setPreviewRequest({ template: templateName, locale: templateLocale, params: templateParams });
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
            params: templateApiParams(selectedTemplate, templateParams),
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
                        if (isSupportedLocale(e.target.value)) {
                          handleTemplateLocaleChange(e.target.value);
                        }
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

                {/* A template with no parameters gets no panel: an empty bordered
                    box under a "parameters" heading reads as a form that failed
                    to load, rather than as a template that takes none. */}
                {selectedTemplate.fields.length > 0 && (
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
                        {field.type === "select" ? (
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
                        ) : field.type === "textarea" ? (
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
                )}
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

      {/* The preview, for template mode only: free-form mode's body is the
          typed text with its line breaks, which the textarea above already
          shows. A registered template is the case where what you asked for and
          what arrives are two different documents. */}
      {mode === "template" && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <MonitorPlay className="h-5 w-5" />
                  <CardTitle>{t('preview')}</CardTitle>
                </div>
                <CardDescription>{t('previewDescription')}</CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={refreshPreview}>
                <RefreshCw />
                {t('refreshPreview')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* The subject is half of what a template produces and the only
                half a rendered body cannot show. Its label is always on
                screen and the line under it holds a line's height whether or
                not it has words in it, so the panel below never moves. */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t('subject')}
              </p>
              <p className="min-h-5 text-sm">{preview?.subject ?? ""}</p>
            </div>
            {/* Sandboxed, and `allow-same-origin` is load-bearing rather than a
                relaxation: scripts stay off (the mail has none, and without
                `allow-scripts` nothing in here can run), while the origin is
                what the inherited CSP's `img-src 'self'` is matched against —
                an opaque origin would block the very photographs this panel
                exists to show. The box carries its final height before
                anything is drawn in it, so neither the first render nor a
                refusal moves the page. */}
            <div className="h-[720px] overflow-hidden rounded-md border border-border bg-background">
              {previewError ? (
                <p className="p-4 text-sm text-destructive">
                  {t('previewError', { message: previewError })}
                </p>
              ) : preview ? (
                <iframe
                  title={t('preview')}
                  srcDoc={preview.html}
                  sandbox="allow-same-origin"
                  className="h-full w-full border-0"
                />
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

