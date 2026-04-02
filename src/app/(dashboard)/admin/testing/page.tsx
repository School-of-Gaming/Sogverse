"use client";

import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/providers";
import { SENDER_EMAIL } from "@/lib/constants";
import { templateRegistry, type TemplateField } from "@/lib/email-templates/registry";

type EmailProvider = "brevo" | "klaviyo";
type EmailMode = "custom" | "template";

interface EmailResult {
  type: "success" | "error";
  message: string;
}

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function isSelectField(field: TemplateField): field is Extract<TemplateField, { type: "select" }> {
  return "type" in field;
}

// --- Page ---

export default function TestingPage() {
  const { profile } = useAuth();

  const [mode, setMode] = useState<EmailMode>("template");
  const [provider, setProvider] = useState<EmailProvider>("brevo");
  const [toEmail, setToEmail] = useState(profile?.email ?? "");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<EmailResult | null>(null);

  // Custom mode state
  const [fromName, setFromName] = useState("Sogverse");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");

  // Template mode state
  const templateKeys = Object.keys(templateRegistry);
  const [templateName, setTemplateName] = useState(templateKeys[0]);
  const [templateParams, setTemplateParams] = useState<Record<string, string>>({});

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
            fromEmail: SENDER_EMAIL,
            fromName,
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
          message: `Email sent successfully. Message ID: ${data.messageId}`,
        });
      }
    } catch {
      setResult({ type: "error", message: "Failed to send request" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Testing Utilities</h1>
        <p className="text-muted-foreground">
          Admin-only diagnostic tools for testing integrations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <CardTitle>Email Tool</CardTitle>
          </div>
          <CardDescription>
            Send a test transactional email to verify email delivery and preview templates.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Provider + Mode */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="provider">Provider</Label>
                <select
                  id="provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as EmailProvider)}
                  className={selectClass}
                >
                  <option value="brevo">Brevo</option>
                  <option value="klaviyo" disabled>
                    Klaviyo (coming soon)
                  </option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mode">Content</Label>
                <select
                  id="mode"
                  value={mode}
                  onChange={(e) => handleModeChange(e.target.value as EmailMode)}
                  className={selectClass}
                >
                  <option value="template">Template</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>

            {/* To Email */}
            <div className="space-y-2">
              <Label htmlFor="toEmail">To Email</Label>
              <Input
                id="toEmail"
                type="text"
                required
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="recipient@example.com, another@example.com"
              />
            </div>

            {/* Template mode fields */}
            {mode === "template" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="template">Template</Label>
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
                </div>

                <div className="space-y-3 rounded-md border border-border p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Template Parameters
                    </p>
                    {selectedTemplate.fields.map((field) => (
                      <div key={field.key} className="space-y-1">
                        <Label htmlFor={`param-${field.key}`} className="text-sm">
                          {field.label}
                        </Label>
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
                        ) : (
                          <Input
                            id={`param-${field.key}`}
                            value={templateParams[field.key] ?? ""}
                            onChange={(e) => updateParam(field.key, e.target.value)}
                            placeholder={field.placeholder}
                          />
                        )}
                      </div>
                    ))}
                  </div>
              </>
            )}

            {/* Custom mode fields */}
            {mode === "custom" && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fromEmail">From Email</Label>
                    <Input
                      id="fromEmail"
                      type="email"
                      value={SENDER_EMAIL}
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fromName">From Name</Label>
                    <Input
                      id="fromName"
                      required
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Subject</Label>
                  <Input
                    id="subject"
                    required
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Test email subject"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="body">Body</Label>
                  <textarea
                    id="body"
                    required
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Plain text email body..."
                    rows={5}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="replyToEmail">Reply-To (optional)</Label>
                  <Input
                    id="replyToEmail"
                    type="email"
                    value={replyToEmail}
                    onChange={(e) => setReplyToEmail(e.target.value)}
                    placeholder="reply@example.com"
                  />
                </div>
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
              {sending ? "Sending..." : "Send Test Email"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <WhatsAppTool />
    </div>
  );
}

// --- WhatsApp Tool ---

type WaMessageType = "text" | "button" | "list";

interface WaResult {
  type: "success" | "error";
  message: string;
}

interface WaButton {
  id: string;
  title: string;
}

interface WaRow {
  id: string;
  title: string;
  description: string;
}

function WhatsAppTool() {
  const [phone, setPhone] = useState<string | undefined>();
  const [messageType, setMessageType] = useState<WaMessageType>("text");
  const [waBody, setWaBody] = useState("");
  const [sending, setSending] = useState(false);
  const [waResult, setWaResult] = useState<WaResult | null>(null);

  // Button mode state
  const [buttons, setButtons] = useState<WaButton[]>([
    { id: "btn_1", title: "" },
  ]);

  // List mode state
  const [listButtonText, setListButtonText] = useState("Select an option");
  const [sectionTitle, setSectionTitle] = useState("Options");
  const [rows, setRows] = useState<WaRow[]>([
    { id: "row_1", title: "", description: "" },
  ]);

  function handleTypeChange(t: WaMessageType) {
    setMessageType(t);
    setWaResult(null);
  }

  function updateButton(index: number, field: keyof WaButton, value: string) {
    setButtons((prev) =>
      prev.map((b, i) => (i === index ? { ...b, [field]: value } : b))
    );
  }

  function addButton() {
    if (buttons.length < 3) {
      setButtons((prev) => [
        ...prev,
        { id: `btn_${prev.length + 1}`, title: "" },
      ]);
    }
  }

  function removeButton(index: number) {
    setButtons((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: keyof WaRow, value: string) {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  }

  function addRow() {
    if (rows.length < 10) {
      setRows((prev) => [
        ...prev,
        { id: `row_${prev.length + 1}`, title: "", description: "" },
      ]);
    }
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleWaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone) return;
    setSending(true);
    setWaResult(null);

    try {
      const payload: Record<string, unknown> = {
        type: messageType,
        to: phone,
        body: waBody,
        ...(messageType === "button" && {
          buttons: buttons.filter((b) => b.title),
        }),
        ...(messageType === "list" && {
          buttonText: listButtonText,
          sections: [
            {
              title: sectionTitle,
              rows: rows.filter((r) => r.title).map((r) => ({
                id: r.id,
                title: r.title,
                ...(r.description && { description: r.description }),
              })),
            },
          ],
        }),
      };

      const response = await fetch("/api/admin/send-test-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setWaResult({ type: "error", message: data.error });
      } else {
        setWaResult({
          type: "success",
          message: `Message sent. ID: ${data.messageId}`,
        });
      }
    } catch {
      setWaResult({ type: "error", message: "Failed to send request" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <CardTitle>WhatsApp Tool</CardTitle>
        </div>
        <CardDescription>
          Send a test WhatsApp message via the Cloud API to verify delivery and preview message types.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleWaSubmit} className="space-y-4">
          {/* Phone + Type */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wa-phone">Phone Number</Label>
              <PhoneInput
                id="wa-phone"
                international
                defaultCountry="FI"
                countryOptionsOrder={["FI", "GB", "SE", "US"]}
                addInternationalOption={true}
                value={phone}
                onChange={setPhone}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa-type">Message Type</Label>
              <select
                id="wa-type"
                value={messageType}
                onChange={(e) => handleTypeChange(e.target.value as WaMessageType)}
                className={selectClass}
              >
                <option value="text">Text</option>
                <option value="button">Buttons</option>
                <option value="list">List</option>
              </select>
            </div>
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="wa-body">Message Body</Label>
            <textarea
              id="wa-body"
              required
              value={waBody}
              onChange={(e) => setWaBody(e.target.value)}
              placeholder="Enter your message..."
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          {/* Button mode fields */}
          {messageType === "button" && (
            <div className="space-y-3 rounded-md border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Buttons (max 3)
              </p>
              {buttons.map((btn, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-sm">Title (max 20 chars)</Label>
                    <Input
                      value={btn.title}
                      onChange={(e) => updateButton(i, "title", e.target.value)}
                      placeholder={`Button ${i + 1}`}
                      maxLength={20}
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-sm">ID</Label>
                    <Input
                      value={btn.id}
                      onChange={(e) => updateButton(i, "id", e.target.value)}
                    />
                  </div>
                  {buttons.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeButton(i)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              {buttons.length < 3 && (
                <Button type="button" variant="outline" size="sm" onClick={addButton}>
                  Add Button
                </Button>
              )}
            </div>
          )}

          {/* List mode fields */}
          {messageType === "list" && (
            <div className="space-y-3 rounded-md border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                List Options (max 10 rows)
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-sm">Button Text (max 20 chars)</Label>
                  <Input
                    value={listButtonText}
                    onChange={(e) => setListButtonText(e.target.value)}
                    maxLength={20}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Section Title</Label>
                  <Input
                    value={sectionTitle}
                    onChange={(e) => setSectionTitle(e.target.value)}
                  />
                </div>
              </div>
              {rows.map((row, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="w-20 space-y-1">
                    <Label className="text-sm">ID</Label>
                    <Input
                      value={row.id}
                      onChange={(e) => updateRow(i, "id", e.target.value)}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-sm">Title (max 24)</Label>
                    <Input
                      value={row.title}
                      onChange={(e) => updateRow(i, "title", e.target.value)}
                      maxLength={24}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-sm">Description (max 72)</Label>
                    <Input
                      value={row.description}
                      onChange={(e) => updateRow(i, "description", e.target.value)}
                      maxLength={72}
                    />
                  </div>
                  {rows.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRow(i)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              {rows.length < 10 && (
                <Button type="button" variant="outline" size="sm" onClick={addRow}>
                  Add Row
                </Button>
              )}
            </div>
          )}

          {/* Result banner */}
          {waResult && (
            <div
              className={`rounded-md p-3 text-sm ${
                waResult.type === "success"
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {waResult.message}
            </div>
          )}

          <Button type="submit" disabled={sending || !phone}>
            {sending ? "Sending..." : "Send WhatsApp Message"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
