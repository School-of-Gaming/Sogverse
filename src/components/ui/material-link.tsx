import { BookLock } from "lucide-react";
import { useTranslations } from "next-intl";

interface MaterialLinkProps {
  href: string;
  className?: string;
}

/**
 * Link to a product's lesson/material content — **staff-facing only**.
 *
 * A product carries two outward links and they have different audiences: the
 * Padlet is what families read, and this one is what the people running the
 * product read. They sit side by side in the product header, so the difference
 * has to be legible at a glance rather than remembered — hence the padlocked
 * book glyph instead of the Padlet's plain external-link arrow, and the
 * muted-foreground tone rather than primary, which reads as "back of house"
 * next to the family link.
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
        "inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
      }
    >
      <BookLock className="h-3.5 w-3.5" aria-hidden />
      {t("material")}
      <span className="sr-only">{t("materialStaffOnly")}</span>
    </a>
  );
}
