"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { resolveWebUrl } from "@/lib/navigation/web-url";
import type { FamilyCreation } from "./types";

/**
 * What this participant has made in this group — the one card on the family
 * product page that points off the platform.
 *
 * **It renders only when there is something in it, and holds no space
 * otherwise.** Almost every enrollment has no creations at all, so a card that
 * appeared empty on every page would push the sessions down a screen to say
 * nothing; the standing-notes card above it is suppressed the same way and for
 * the same reason. Nothing here arrives late either — the list rides the one
 * document the rest of the page is built from, so the card is present or absent
 * in the first frame and never appears under a reader's cursor.
 *
 * **It sits between the standing notes and the feed**, which is where the
 * page's own order puts it: when and where, then what is always true here, then
 * what this child has made, then what happened week by week. Below the feed it
 * would be behind an unbounded history nobody scrolls to the end of, and above
 * the notes it would displace the standing context every page has with a card
 * most pages do not.
 *
 * **One copy for all three audiences.** The heading is the bare noun on a
 * parent's page, on a parent's own seat and on the child's own — the same
 * decision the gedus label above it takes, and for the same two reasons: the
 * masthead has already said whose page this is, and a possessive built around a
 * name has to inflect that name in half the locales we ship. It is also the
 * word the gedu who typed it sees, so a family and their gedu use one word for
 * one thing — **which is why the noun is pluralized against the count.** The
 * editor authors one creation, so a page saying "Creations" over a single entry
 * would be the one place those two words came apart.
 *
 * **A title is a link only when its stored URL parses as http(s); otherwise it
 * is text.** The field is stored raw and unvalidated by design, so this is the
 * half of that decision that keeps a `javascript:` value on a parent's browser
 * from being stored XSS. The degrade is to a plain label rather than to a dead
 * anchor: a blank `href` is not inert, it resolves to the current page.
 */
export function FamilyCreationsCard({
  creations,
}: {
  creations: readonly FamilyCreation[];
}) {
  const t = useTranslations("familyProduct");

  // The emptiness rule lives with the card rather than at the call site, so the
  // "no creations, no card, no reserved space" guarantee travels with the
  // component instead of depending on every future caller remembering it.
  if (creations.length === 0) return null;

  return (
    <Card className="mt-5">
      <CardContent className="p-4 sm:p-5">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("creationsHeading", { count: creations.length })}
        </h2>
        {/* A list, so a reader on a screen reader is told how many there are
            before walking them. Index keys are safe here and nowhere near a
            reorder: array order *is* the order staff arranged them in, there is
            no affordance to change it, and the whole list is replaced at once
            when it is edited. */}
        <ul className="mt-2 space-y-2">
          {creations.map((creation, index) => (
            <li key={index} className="text-sm leading-relaxed">
              <CreationEntry
                creation={creation}
                newTabLabel={t("creationOpensInNewTab")}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * One entry: a link when the stored value is one, its own title when it is not.
 *
 * The icon is the only thing marking the difference visually, and it is paired
 * with a screen-reader label rather than left to carry the fact alone — every
 * one of these leaves the site, and a reader who cannot see the glyph is owed
 * the same warning as one who can.
 *
 * `break-words` because a title is capped at 200 characters and the narrow
 * layout floor is 360px: a long one wraps inside the card rather than pushing a
 * scrollbar across the page.
 */
function CreationEntry({
  creation,
  newTabLabel,
}: {
  creation: FamilyCreation;
  newTabLabel: string;
}) {
  const href = resolveWebUrl(creation.url);

  if (href === null) {
    return <span className="break-words">{creation.title}</span>;
  }

  return (
    <a
      // The parser's serialization, not the stored string — what was checked is
      // exactly what reaches the DOM.
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {creation.title}
      {/* Inline rather than a flex sibling, so on a title that wraps the glyph
          follows the last word instead of floating beside the first line. */}
      <ExternalLink
        className="ml-1.5 inline h-3.5 w-3.5 shrink-0 align-[-0.15em]"
        aria-hidden
      />
      {/* The same shape the attributions page uses for the same fact: the glyph
          for a reader who can see it, this for one who cannot. The accessible
          name concatenates without a separator — the name algorithm strips
          whitespace at each node — which is why the tests spell it that way. */}
      <span className="sr-only">{newTabLabel}</span>
    </a>
  );
}
