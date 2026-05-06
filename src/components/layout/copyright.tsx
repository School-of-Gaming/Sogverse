import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface CopyrightProps {
  className?: string;
}

/**
 * Year-aware copyright line, shared between the site Footer and the
 * voice-room CallEndedScreen.
 *
 * Server component on purpose: `new Date().getFullYear()` runs once during
 * SSR and the year is baked into the HTML. If this rendered inside a client
 * component, a request that crossed midnight UTC on Dec 31 could produce a
 * different year on server vs. client and trigger a hydration warning.
 *
 * To use from a client component (CallEndedScreen does), render `<Copyright />`
 * in a server boundary above and pass it down as a slot prop / child — never
 * import this file from a client component directly.
 */
export function Copyright({ className }: CopyrightProps) {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {t("copyright", { year })}
    </p>
  );
}
