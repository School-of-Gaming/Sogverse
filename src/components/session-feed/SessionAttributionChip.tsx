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
 * **It is positioned against a wrapper that holds exactly one card.** The chip
 * is `absolute`, so it needs a positioning context, and the nearest one has to
 * be that single card or the offsets would resolve against whatever ancestor
 * happened to be positioned — the feed's list, or the page. The wrapper is
 * unconditional on both feeds, present whether or not anybody is named, so the
 * card's subtree identity never changes when the chip appears or disappears.
 * (Nothing here needs the card to opt out of clipping: `Card` sets no overflow,
 * so a chip rendered *inside* one would not be cut in two either.)
 *
 * **A screen reader gets one labelled unit, not a bare name.** The identicon
 * carries no text and the chip's own body is a first name with nothing to say
 * why it is there, so the positioned wrapper takes `role="img"` and the
 * translated "By {name}" label: the subtree stops being announced separately and
 * the reader hears the attribution as a sentence. Doing it on the wrapper is
 * what keeps the chip primitive itself free of any assumption about why it is
 * being rendered.
 *
 * **Its geometry is what the signed card's bottom padding is derived from.**
 * The chip stands 30px tall (a 20px avatar, `py-1`, a 1px border) plus a 2px
 * ring, and `-bottom-2.5` drops it 10px below the card's border box — so 22px
 * of it rises *above* that border, past the card's ordinary 16/20px padding and
 * into the content. Both feed items reserve bottom padding against those
 * numbers; move any of them and re-derive it there.
 */
export function SessionAttributionChip({
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
