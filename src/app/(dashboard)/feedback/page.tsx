"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/providers";

const MIN_LENGTH = 10;
const MAX_LENGTH = 2000;

export default function FeedbackPage() {
  const { profile } = useAuth();
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (message.length < MIN_LENGTH || message.length > MAX_LENGTH) return;

    setIsSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.error || "Failed to submit feedback");
        return;
      }

      setSuccessMessage("Thank you! Your feedback has been sent to our team.");
      setMessage("");
    } catch {
      setErrorMessage("Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Feedback</h1>
        <p className="text-muted-foreground">
          Share your thoughts, suggestions, or report issues
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <CardTitle>Send Feedback</CardTitle>
          </div>
          <CardDescription>
            Your feedback will be sent to the Sogverse team.
            {profile?.role === "gamer" && " Replies will be sent to your parent's email."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {successMessage && (
            <div className="rounded-md bg-success/10 p-3 text-sm text-success">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="feedback-message">Message</Label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what you think..."
              rows={6}
              maxLength={MAX_LENGTH}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {message.length < MIN_LENGTH && message.length > 0
                  ? `${MIN_LENGTH - message.length} more characters needed`
                  : "\u00A0"}
              </span>
              <span>{message.length}/{MAX_LENGTH}</span>
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || message.length < MIN_LENGTH || message.length > MAX_LENGTH}
          >
            {isSubmitting ? "Sending..." : "Submit Feedback"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
