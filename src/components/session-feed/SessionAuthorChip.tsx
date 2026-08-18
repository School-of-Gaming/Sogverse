"use client";

import { useTranslations } from "next-intl";
import { PersonChip } from "@/components/ui/person-chip";
import { cn } from "@/lib/utils";

/**
 * Who last edited a session, as a chip straddling the **bottom-right corner** of
 * the card the session's report is on.
 *
 * **One component for both feeds**, because a report is attributed the same way
 * wherever it is read: a gedu scrolling their own group's term and a parent
 * reading their child's club are looking at the same write-up, and a chip that
 * sat in a different place — or said a different thing — on the two would be
 * inventing a distinction neither surface has. It is deliberately not a family
 * or a staff component; the pair it renders is a first name and an id, which is
 * the same quantum of information a family page already shows for every gedu on
 * the group.
 *
 * **The corner is chosen for what it is far from.** Both cards spend their
 * header's right-hand side on a status — a tag ahead of now, an attendance mark
 * or a completeness state behind it — so a chip in that corner would stack
 * against whichever of those is up. The bottom-right is empty on every card in
 * both feeds, and hanging half of the chip past the edge reads as a signature
 * rather than as another status.
 *
 * **It is the card's sibling, not its child.** The chip has to sit half outside
 * the card's border box, and a card clipping its own overflow would cut it in
 * two; a plain `relative` shell around the card puts the chip beyond that box
 * without any card needing to opt out of clipping.
 *
 * **A screen reader gets one labelled unit, not a bare name.** The identicon
 * carries no text and the chip's own body is a first name with nothing to say
 * why it is there, so the positioned wrapper takes `role="img"` and the
 * translated "By {name}" label: the subtree stops being announced separately and
 * the reader hears the attribution as a sentence. Doing it on the wrapper is
 * what keeps the chip primitive itself free of any assumption about why it is
 * being rendered.
 */
export function SessionAuthorChip({
  id,
  firstName,
  className,
}: {
  /** Real UUID — the identicon is hashed out of its hex bytes. */
  id: string;
  firstName: string;
  className?: string;
}) {
  const t = useTranslations("sessionFeed");

  return (
    <span
      role="img"
      aria-label={t("lastEditedBy", { name: firstName })}
      className={cn("absolute -bottom-2.5 -right-2 z-10", className)}
    >
      <PersonChip
        id={id}
        name={firstName}
        size="default"
        className="bg-card shadow-sm ring-2 ring-background"
      />
    </span>
  );
}
