"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { cn, computeAge } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type { GamerSessionRow } from "./types";

const GENDER_KEY = {
  boy: "genderBoy",
  girl: "genderGirl",
  non_binary: "genderNonBinary",
} as const;

interface GamerRosterRowProps {
  gamer: GamerSessionRow;
}

/**
 * One gamer row inside the assigned-group roster. Identicon + first name
 * + age/gender on the left; the parent email on the right is itself a
 * click-to-copy button so the gedu can grab a single address without
 * leaving the page. Falls back to a dim placeholder when the gamer has
 * no parent email linked (rare but possible — a gamer signed up under a
 * household where the parent's profile is missing email).
 */
export function GamerRosterRow({ gamer }: GamerRosterRowProps) {
  const t = useTranslations("gedu.sessionDetails");
  const timeZone = useTimezone();

  const detailParts: string[] = [];
  if (gamer.date_of_birth) {
    detailParts.push(t("age", { age: computeAge(gamer.date_of_birth, timeZone) }));
  }
  if (gamer.gender) {
    detailParts.push(t(GENDER_KEY[gamer.gender]));
  }
  const detail = detailParts.join(" · ");

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border bg-card p-2.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar className="h-8 w-8 shrink-0">
          <Identicon id={gamer.gamer_id} size={32} />
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">
            {gamer.first_name}
          </p>
          {detail && (
            <p className="text-[11px] leading-tight text-muted-foreground">
              {detail}
            </p>
          )}
        </div>
      </div>
      <ParentEmailCell email={gamer.parent_email} />
    </li>
  );
}

function ParentEmailCell({ email }: { email: string | null }) {
  const t = useTranslations("gedu.sessionDetails");
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!email || typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Insecure origin or denied permission — silent failure; the user
      // can still select + copy the email from the page.
    }
  }, [email]);

  if (!email) {
    return (
      <span className="text-xs text-muted-foreground sm:ml-auto">
        {t("noParentEmail")}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? t("emailCopied") : t("copyParentEmail", { email })}
      className={cn(
        "group inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-transparent bg-muted/40 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:ml-auto",
        copied && "border-success/40 text-success",
      )}
    >
      <span className="truncate font-mono">{email}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
      )}
    </button>
  );
}
