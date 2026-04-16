import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

interface PadletLinkProps {
  href: string;
  className?: string;
}

export function PadletLink({ href, className }: PadletLinkProps) {
  const t = useTranslations('groups');

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "inline-flex items-center gap-1 text-sm text-primary hover:underline"}
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {t('padlet')}
    </a>
  );
}
