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

type EmailProvider = "brevo" | "klaviyo";

interface EmailResult {
  type: "success" | "error";
  message: string;
}

export default function TestingPage() {
  const [provider, setProvider] = useState<EmailProvider>("brevo");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<EmailResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/send-test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          fromEmail,
          fromName,
          toEmail,
          subject,
          body,
          ...(replyToEmail && { replyToEmail }),
        }),
      });

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
            Send a test transactional email to verify email delivery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Provider */}
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <select
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as EmailProvider)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="brevo">Brevo</option>
                <option value="klaviyo" disabled>
                  Klaviyo (coming soon)
                </option>
              </select>
            </div>

            {/* From Email + From Name */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fromEmail">From Email</Label>
                <Input
                  id="fromEmail"
                  type="email"
                  required
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="noreply@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fromName">From Name</Label>
                <Input
                  id="fromName"
                  required
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Sogverse"
                />
              </div>
            </div>

            {/* To Email */}
            <div className="space-y-2">
              <Label htmlFor="toEmail">To Email</Label>
              <Input
                id="toEmail"
                type="email"
                required
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="recipient@example.com"
              />
            </div>

            {/* Subject */}
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

            {/* Body */}
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

            {/* Reply-To */}
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

            {/* Result banner */}
            {result && (
              <div
                className={`rounded-md p-3 text-sm ${
                  result.type === "success"
                    ? "bg-green-500/10 text-green-500"
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
