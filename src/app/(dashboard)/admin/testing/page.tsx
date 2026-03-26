"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
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
    </div>
  );
}
