import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { AppHref } from "@/lib/constants/routes";
import { LIBRARY_CATEGORY_MESSAGE_KEY, type LibraryCategory } from "./categories";

const EYEBROW = "text-xs font-medium uppercase tracking-wide text-muted-foreground";

/**
 * **An article's category, as the eyebrow over its title** — the one
 * treatment the Library gives a category, on a card and on the article page.
 *
 * It is furniture, set exactly like the index's own "Library" eyebrow: small,
 * muted, in tracked caps. Not a chip, because the filter's chips are the
 * controls and a chip on every card would read as one more thing to press; and
 * not in a colour, because the parent pages spend act as their one accent and
 * it is already the filter's selected chip and the call to action. A category
 * on every card is a fact, and a fact on every card does not need a hue.
 *
 * Given an `href` — the index filtered to this category — it is a link, which
 * is what it is on the article page. On a card it stays words: the card is
 * already one link.
 */
export function LibraryCategoryLabel({
  category,
  href,
}: {
  category: LibraryCategory;
  href?: AppHref;
}) {
  const t = useTranslations("library.categories");
  const label = t(LIBRARY_CATEGORY_MESSAGE_KEY[category]);

  if (href === undefined) return <p className={EYEBROW}>{label}</p>;
  return (
    <p className={EYEBROW}>
      <Link href={href} className="hover:text-foreground">
        {label}
      </Link>
    </p>
  );
}
