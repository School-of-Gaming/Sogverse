"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { PersonChipListPerson } from "@/components/ui/person-chip";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import type { GeduAssignedProductGroup } from "@/types";

/**
 * The few pieces of the old group cards that outlived them.
 *
 * The workspace redesign replaced both cards — the big "Your group" panel and
 * its peer sibling — with the reference rail, and most of what they contained
 * went with them. These three did not: they are about a *roster* rather than
 * about a card, and the rail needs all three. They live in their own module so
 * that is obvious, instead of being imported out of the corpse of a component
 * nothing renders.
 */

/**
 * "Copy all contact emails (7)" — one comma-separated list the gedu can paste
 * straight into Gmail.
 *
 * It is **every** address on the roster, which since 00173 means an adult
 * participant's own address alongside the children's parents. The whole point
 * of the button is "mail this group", and a group mail that silently omits the
 * one member who is their own contact is worse than no button — the gedu would
 * have no way to notice.
 */
export function CopyAllEmailsButton({ emails }: { emails: string[] }) {
  const t = useTranslations("gedu.sessionDetails");
  const { copied, copy } = useCopyToClipboard();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void copy(emails.join(", "))}
      className={cn("gap-1.5", copied && "text-success")}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden />
      ) : (
        <Copy className="h-4 w-4" aria-hidden />
      )}
      {copied
        ? t("allEmailsCopied")
        : t("copyAllContactEmails", { count: emails.length })}
    </Button>
  );
}

/**
 * A group's gedus as person-chip rows. The DB row spells the field
 * `first_name`; the shared chip primitive is not a gedu component and takes a
 * plain `name`, so the adaptation happens once here rather than in each of the
 * surfaces that render these chips.
 */
export function geduChipPeople(
  gedus: GeduAssignedProductGroup["gedus"],
): PersonChipListPerson[] {
  return gedus.map((gedu) => ({ id: gedu.id, name: gedu.first_name }));
}

/**
 * Strip nulls and de-duplicate so the same address (e.g. two siblings in the
 * same group sharing a parent) only appears once in the pasted list.
 */
export function deduplicateEmails(emails: (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of emails) {
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}
