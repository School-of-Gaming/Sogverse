import { BookLock } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MaterialLinkProps {
  href: string;
  /**
   * The one shape this link has. Kept as a prop only because the call site
   * still names it; there is nothing else it can be set to, and it can be
   * dropped from both ends in one change.
   */
  variant?: "button";
  className?: string;
}

/**
 * Link to a product's lesson/material content — **gedu- and admin-facing only**.
 *
 * **One weight: a button.** The link only ever appears on a gedu's own
 * workspace, where it is the thing they came for — a gedu opening the page
 * before a session is going to fetch the material — so it reads as an action
 * rather than as metadata about the product. It once had a quieter chip form
 * for a row of outward links where this one was not the point; no surface
 * renders that row any more, so the variant went with it rather than staying
 * on as a shape nothing asks for.
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
      className={cn(
        buttonVariants({ variant: "outline", size: "default" }),
        "gap-2",
        className,
      )}
    >
      <BookLock className="h-4 w-4" aria-hidden />
      {t("materialAction")}
      <span className="sr-only">{t("materialStaffOnly")}</span>
    </a>
  );
}
