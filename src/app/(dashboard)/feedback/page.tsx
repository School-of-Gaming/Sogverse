"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/providers";

const MIN_LENGTH = 10;
const MAX_LENGTH = 2000;

export default function FeedbackPage() {
  const t = useTranslations('feedback');
  const c = useTranslations('common');
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
        setErrorMessage(data.error || t('failedToSubmit'));
        return;
      }

      setSuccessMessage(t('thankYou'));
      setMessage("");
    } catch {
      setErrorMessage(t('failedToSubmitRetry'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <CardTitle>{t('sendFeedback')}</CardTitle>
          </div>
          <CardDescription>
            {t('feedbackDescription')}
            {profile?.role === "gamer" && ` ${t('gamerReplyNote')}`}
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
            <Label htmlFor="feedback-message">{t('message')}</Label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('placeholder')}
              rows={6}
              maxLength={MAX_LENGTH}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {message.length < MIN_LENGTH && message.length > 0
                  ? t('charactersNeeded', { count: MIN_LENGTH - message.length })
                  : "\u00A0"}
              </span>
              <span>{message.length}/{MAX_LENGTH}</span>
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || message.length < MIN_LENGTH || message.length > MAX_LENGTH}
          >
            {isSubmitting ? c('sending') : t('submitFeedback')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
