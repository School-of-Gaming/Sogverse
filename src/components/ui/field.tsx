import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";

/**
 * Canonical form-field wrapper: a label, the input you pass as children, and an
 * optional hint underneath.
 *
 * Required/optional convention (house rule): fields are required by default and
 * carry NO marker. Genuinely optional fields pass `optional` to render a muted
 * "(optional)" suffix on the label. We mark the exceptions, not the norm —
 * which keeps short, mostly-required forms uncluttered and unambiguous.
 *
 * Use this for every labelled field. Do not hand-roll `<Label>` + input groups,
 * and do not mark required fields with an asterisk.
 */
export function Field({
  label,
  htmlFor,
  optional = false,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  const c = useTranslations("common");
  return (
    // flex+gap owns the label→input→hint spacing for every field. The gap is
    // sized so the input's focus ring (ring-2 + ring-offset-2 sits ~4px past
    // its top edge) doesn't crowd the label above it.
    <div className="flex flex-col gap-2.5">
      <Label htmlFor={htmlFor}>
        {label}
        {optional && (
          <span className="ml-1 font-normal text-muted-foreground">{c("optional")}</span>
        )}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
