import { BookLock } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MaterialLinkProps {
  href: string;
  /**
   * `"chip"` (default) is the quiet inline form, for a row of links where this
   * one is not the point. `"button"` is the prominent form — a real
   * button-weight affordance for a surface where fetching the materials is one
   * of the first things the reader is expected to do.
   */
  variant?: "chip" | "button";
  className?: string;
}

/**
 * Link to a product's lesson/material content — **gedu- and admin-facing only**.
 *
 * **Two weights, because the link means two different things in two places.** In
 * a list of a product's outward links it is one entry among several and takes
 * the quiet chip form. On a gedu's own workspace it is the thing they came for:
 * a gedu opening the page before a session is going to fetch the material, and a
 * small tinted chip tucked beside the type label is not what a primary errand
 * looks like. There it takes the button form, so it reads as an action rather
 * than as metadata about the product.
 *
 * It stays one component in both cases. The prominence is a variant, not a
 * second implementation — two components would drift in glyph, label and, worst
 * of all, in the staff-only warning that has to travel with the URL wherever it
 * goes.
 *
 * **The visibility rule is the caller's to enforce.** This component renders
 * whatever href it is handed; it has no idea who is looking. It is safe on a
 * gedu- or admin-only surface. Any route that a parent or gamer can reach must
 * not render it at all — not hide it with CSS, not disable it — because the URL
 * would still be in the HTML.
 */
export function MaterialLink({
  href,
  variant = "chip",
  className,
}: MaterialLinkProps) {
  const t = useTranslations("groups");

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={t("materialStaffOnly")}
      className={cn(
        variant === "button"
          ? cn(buttonVariants({ variant: "outline", size: "default" }), "gap-2")
          : "inline-flex items-center gap-1 text-sm text-primary hover:underline",
        className,
      )}
    >
      <BookLock
        className={variant === "button" ? "h-4 w-4" : "h-3.5 w-3.5"}
        aria-hidden
      />
      {variant === "button" ? t("materialAction") : t("material")}
      <span className="sr-only">{t("materialStaffOnly")}</span>
    </a>
  );
}
