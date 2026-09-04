"use client";

import { useRef, useState } from "react";
import { Mail, MonitorPlay } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/providers";
import { SUPPORTED_LOCALES, LOCALE_CONFIG, DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "@/lib/constants/locales";
import { useLanguageNames } from "@/hooks/use-language-names";
import { cn } from "@/lib/utils";
import {
  templateRegistry,
  type TemplateDefinition,
  type TemplateField,
} from "@/lib/email-templates/registry";
import type { RenderedAttachment } from "@/lib/email-templates/attachments";
import { getEmailTranslator } from "@/lib/email-templates/translator";

/**
 * The two viewports the preview frame can be given.
 *
 * A mail is not one document: the shared layout stacks the session-report photo
 * pairs full-width below its 560px breakpoint, so the same template renders as
 * two different pages and only one of them is on screen at a time. This is what
 * puts the other one there.
 *
 * `desktop` is the frame filling the dialog, which is wider than the mail's own
 * 560px table — so the mail sits centred at its authored width, exactly as an
 * inbox on a laptop shows it. `mobile` is 360 CSS px: the house mobile design
 * floor (the archetypal Android family phone) and comfortably inside the mail's
 * breakpoint, so what it shows is the stacked layout rather than a slightly
 * squeezed desktop one. An iframe matches media queries against its own
 * viewport, so narrowing the element is the whole of the trick — no second
 * render, and the `srcDoc` is never reassigned, so the reader keeps their
 * scroll position in the mail across a toggle.
 */
const PREVIEW_WIDTHS = ["desktop", "mobile"] as const;
type PreviewWidth = (typeof PREVIEW_WIDTHS)[number];

interface EmailResult {
  type: "success" | "error";
  message: string;
  /**
   * The text of every text attachment the send actually carried.
   *
   * A calendar document states the identifier its entry lives under, and a
   * second message about that entry has to repeat it — so the identifier a send
   * minted has to be readable *after* the send. The preview cannot stand in for
   * it: a render mints its own, so what the preview shows was never what went
   * out.
   */
  attachments?: { name: string; text: string }[];
}

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * What an untouched field posts: a select its first option, a text input its
 * placeholder — and a textarea whatever it holds, empty included.
 *
 * The placeholder fallback is what makes an untouched form compose a whole
 * mail rather than a stripped one, and it is also why a text input can never
 * be *emptied*: clearing the box posts the placeholder again. A field with a
 * real "none" state therefore takes a typed token instead of a blank, and says
 * so in its own label — see `FORM_NONE_TOKEN` in `form-fields.ts`. Only a
 * textarea can let an empty value mean "none".
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

// --- Page ---

export default function TestingPage() {
  const t = useTranslations('admin.testing');
  const languageName = useLanguageNames();
  const c = useTranslations('common');
  const { profile } = useAuth();

  const [toEmail, setToEmail] = useState(profile?.email ?? "");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<EmailResult | null>(null);

  const templateKeys = Object.keys(templateRegistry);
  const [templateName, setTemplateName] = useState(templateKeys[0]);
  const [templateParams, setTemplateParams] = useState<Record<string, string>>({});
  const [templateLocale, setTemplateLocale] = useState<SupportedLocale>(DEFAULT_LOCALE);

  // Preview state. The dialog is the whole of it: the mail is drawn when the
  // dialog opens and shown only while it is up, so nothing typed into the form
  // afterwards can reload the frame under a reader.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<{
    subject: string;
    html: string;
    attachments: RenderedAttachment[];
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Which viewport the already-rendered document is shown in, not which
  // document it is: the toggle in the dialog header changes it without
  // re-rendering the mail, and it is kept across opens so a reader checking
  // the mobile layout of several templates is not flipped back each time.
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("desktop");
  // Which render is allowed to paint. Two can be in flight at once — close the
  // dialog, change the locale, reopen it before the first locale's message
  // chunk has arrived — and the one that resolves second must not be the one
  // left on screen.
  const previewRun = useRef(0);

  const selectedTemplate = templateRegistry[templateName];

  /**
   * Open the preview, showing the mail the form describes at this moment.
   *
   * Opening *is* the snapshot, which is why there is nothing to refresh: the
   * values are read at the click and the frame is then left alone, so a reader
   * scrolled into the middle of a long session report keeps their place for as
   * long as the dialog is up, and gets the form's current state by reopening
   * it.
   *
   * The render is the same registry call the send route makes — but in the
   * preview context, so a fixture whose art lives on this dev server is
   * resolved against *this browser's* origin instead of being dropped as
   * unreachable. The mail a recipient would get is the send's job; the mail as
   * it was designed is this one's.
   *
   * The translator is an awaited dynamic import of one locale's messages, so
   * this is a chunk fetch rather than a round trip: nothing is drawn while it
   * is in flight, inside a box that is already its final size.
   */
  function openPreview() {
    setPreview(null);
    setPreviewError(null);
    setPreviewOpen(true);

    const run = previewRun.current + 1;
    previewRun.current = run;
    const definition = selectedTemplate;
    const locale = templateLocale;
    const params = templateParams;

    void (async () => {
      try {
        const translate = await getEmailTranslator(locale);
        if (previewRun.current !== run) return;
        const rendered = definition.render(
          templateApiParams(definition, params),
          translate,
          locale,
          { to: "preview", origin: window.location.origin },
        );
        setPreview({
          subject: rendered.subject,
          html: rendered.html,
          attachments: rendered.attachments ?? [],
        });
      } catch (error) {
        if (previewRun.current !== run) return;
        setPreview(null);
        // The raw message, like the send result banner beside it: a zod path is
        // what tells the admin which field they mistyped, and this page is
        // developer-facing tooling.
        setPreviewError(error instanceof Error ? error.message : String(error));
      }
    })();
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
      const response = await fetch("/api/admin/send-test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: templateName,
          toEmail,
          locale: templateLocale,
          params: templateApiParams(selectedTemplate, templateParams),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setResult({ type: "error", message: data.error });
      } else {
        setResult({
          type: "success",
          message: t('emailSentSuccess', { messageId: data.messageId }),
          attachments: data.attachments,
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
            {/* What a send is addressed by, in one row: who it goes to, which
                language it is composed in, and which mail it is. There is no
                mode and no provider to pick — the harness sends registered
                templates through Brevo, which is every mail the product can
                produce — so the three answers a send actually needs sit
                together above the parameters of whichever template is chosen.
                Three columns on a desktop, an ordinary stack below `md`. */}
            <div className="grid gap-4 md:grid-cols-3">
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
              <Field label={t('language')} htmlFor="templateLocale">
                <select
                  id="templateLocale"
                  value={templateLocale}
                  onChange={(e) => {
                    if (isSupportedLocale(e.target.value)) {
                      setTemplateLocale(e.target.value);
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

            {/* Result banner, and under it what the send actually carried. The
                panel is the preview dialog's, closed by default for the same
                reason: a hundred lines of calendar source above the send button
                would bury the one line saying the mail went. It arrives with
                the banner rather than after it, so nothing already on screen
                moves when it appears. */}
            {result && (
              <div className="space-y-2">
                <div
                  className={`rounded-md p-3 text-sm ${
                    result.type === "success"
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {result.message}
                </div>
                {result.attachments?.map((attachment) => (
                  <details key={attachment.name} className="rounded-md border border-border">
                    <summary className="cursor-pointer px-3 py-2 text-sm">
                      {t('sentAttachment', { name: attachment.name })}
                    </summary>
                    <pre className="h-64 overflow-auto border-t border-border p-3 font-mono text-xs whitespace-pre-wrap">
                      {attachment.text}
                    </pre>
                  </details>
                ))}
              </div>
            )}

            {/* The action row, authored DOM-order [secondary…, affirmative]:
                the send is the answer this form exists to give, so it is the
                last child — rightmost in a row, and topmost once the row
                stacks. One preview button, not one per viewport: the dialog
                carries its own desktop/mobile toggle, so a second opener would
                only duplicate it. */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={openPreview}>
                <MonitorPlay />
                {t('preview')}
              </Button>
              <Button type="submit" disabled={sending}>
                {sending ? c('sending') : t('sendTestEmail')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* The preview is a dialog rather than a second panel under the form:
          the mail is 720px of reading and the form is what the page is for, so
          the two do not share a scroll. `size="wide"` rather than a one-off
          max-width class, because the cap is applied on the portal's
          positioning wrapper as well as on the content — a class on the
          content alone would still be squeezed by the wrapper. The mail's own
          table is 560px, so a wide dialog shows it centred at its authored
          width with ground either side, which is what a laptop inbox does. */}
      <Dialog open={previewOpen} size="wide" onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] space-y-3 overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <DialogTitle>{t('preview')}</DialogTitle>
              {/* The toggle is in here as well as on the buttons that open the
                  dialog, so a reader can compare the two viewports without
                  closing and reopening — and it is on screen from the moment
                  the dialog opens, so this right-packed group never grows or
                  shrinks under the reader's cursor. */}
              <div
                role="group"
                aria-label={t('previewWidth.label')}
                className="inline-flex shrink-0 rounded-md border border-input p-1"
              >
                {PREVIEW_WIDTHS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={previewWidth === option}
                    onClick={() => setPreviewWidth(option)}
                    className={cn(
                      "rounded px-3 py-1 text-xs transition-colors",
                      previewWidth === option
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`previewWidth.${option}`)}
                  </button>
                ))}
              </div>
            </div>
          </DialogHeader>
          {/* The subject is half of what a template produces and the only half
              a rendered body cannot show. Its label is up with the dialog and
              the line under it holds a line's height whether or not it has
              words in it, so the frame below never moves when the render
              lands. */}
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
              exists to show. The box carries its final height before anything
              is drawn in it, so neither the first render nor a refusal moves
              what is already in the dialog. The height is viewport-relative so
              a short screen gets a shorter frame rather than a dialog that
              runs off it. */}
          <div className="h-[min(720px,70vh)] overflow-hidden rounded-md border border-border bg-background">
            {/* The caught error's own message, rendered — a signed-off
                exception to the rule that a thrown message never reaches a
                screen *(owner)*. This page is admin-only developer tooling
                for composing test mail, and the message here is a zod path
                naming the parameter that was mistyped, which is the whole of
                what makes the line useful. A sweep replacing it with our own
                copy would leave an admin told only that something is wrong
                with a form of twenty fields. */}
            {previewError ? (
              <p className="p-4 text-sm text-destructive">
                {t('previewError', { message: previewError })}
              </p>
            ) : preview ? (
              <iframe
                title={t('preview')}
                srcDoc={preview.html}
                sandbox="allow-same-origin"
                className={cn(
                  "mx-auto block h-full border-0",
                  // Only the element's width changes between the two, so the
                  // frame is never remounted and the mail is never re-rendered
                  // — the document keeps its scroll across a toggle. The ring
                  // draws outside the box rather than inside it, so the narrow
                  // frame is visibly a phone without the border stealing two
                  // pixels from the viewport being demonstrated.
                  previewWidth === "mobile"
                    ? "w-[360px] ring-1 ring-border"
                    : "w-full",
                )}
              />
            ) : null}
          </div>
          {/* What travels beside the body. It is closed by default because the
              mail is what the dialog is for and a hundred lines of calendar
              source above the fold would bury it — and it sits *below* the
              frame, where opening it grows the dialog's own scroll rather than
              moving anything already on screen. The box has a fixed height for
              the same reason: a long attachment expanded in place would push
              the whole document's height around under the reader.
              Only a text attachment gets a panel, because there is nothing
              useful to show for bytes that are not text. */}
          {preview?.attachments
            .filter((attachment) => attachment.text !== undefined)
            .map((attachment) => (
              <details key={attachment.name} className="rounded-md border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm">
                  {t("attachment", { name: attachment.name })}
                </summary>
                <pre className="h-64 overflow-auto border-t border-border p-3 font-mono text-xs whitespace-pre-wrap">
                  {attachment.text}
                </pre>
              </details>
            ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}

