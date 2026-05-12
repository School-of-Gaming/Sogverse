"use client";

import { FeedbackSectionContent } from "@/components/feedback/feedback-section-content";
import { useAuth } from "@/providers";

// The Help page itself is public — anyone can read the placeholder content.
// The feedback form, however, needs a signed-in user (the API route requires
// auth and the email we send includes their name/role/email).
export function HelpFeedbackGate() {
  const { user, isLoading } = useAuth();
  if (isLoading || !user) return null;
  return <FeedbackSectionContent />;
}
