"use client";

import type { ComponentProps } from "react";
import { Heading } from "@sog/ui";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * The chrome an admin editor page sits in — a Library article's, a
 * spotlight's: the way back to its list and the page's title. The title is the
 * page's own rather than the item's, so it is painted from the first frame and
 * never rewrites itself when the read lands.
 */
export function AdminEditorPageShell({
  backHref,
  backLabel,
  title,
  children,
}: {
  /** The list the editor belongs to. */
  backHref: ComponentProps<typeof Link>["href"];
  backLabel: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <Heading level={1} step="section">{title}</Heading>

      {children}
    </div>
  );
}
