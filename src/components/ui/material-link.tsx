import { BookLock } from "lucide-react";
import { useTranslations } from "next-intl";

interface MaterialLinkProps {
  href: string;
  className?: string;
}

/**
 * Link to a product's lesson/material content — **gedu- and admin-facing only**.
 *
 * A product carries two outward links with different audiences: the Padlet is
 * what families read, and this one is what the people running the product read.
 * They sit side by side in the product header, and they are deliberately the
 * **same chip** — same shape, size and tone as the Padlet link — because two
 * links to the same kind of thing, on the same line, reading as two different
 * weights made one of them look like the important one. The difference is
 * carried by the glyph (a padlocked book against the Padlet's external-link
 * arrow) and by the hover title, not by demoting this one to grey.
 *
 * **The visibility rule is the caller's to enforce.** This component renders
 * whatever href it is handed; it has no idea who is looking. It is safe on a
 * gedu- or admin-only surface. Any route that a parent or gamer can reach must
 * not render it at all — not hide it with CSS, not disable it — because the URL
 * would still be in the HTML.
 */
export function MaterialLink({ href, className }: MaterialLinkProps) {
  const t = useTranslations("groups");

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={t("materialStaffOnly")}
      className={
        className ??
        "inline-flex items-center gap-1 text-sm text-primary hover:underline"
      }
    >
      <BookLock className="h-3.5 w-3.5" aria-hidden />
      {t("material")}
      <span className="sr-only">{t("materialStaffOnly")}</span>
    </a>
  );
}
