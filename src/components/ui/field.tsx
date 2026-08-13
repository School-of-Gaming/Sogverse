import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";

/**
 * The ids a field hands its control, so the control can point at them.
 *
 * A hint rendered as loose text under an input is invisible to anything that is
 * not looking at the screen — the whole sentence explaining who can read a note,
 * or what a password has to contain, simply is not announced. Nothing else can
 * generate these ids: the hint is rendered here, so the id has to come from
 * here, and the control reaches it by taking `children` as a function.
 */
export interface FieldDescriptors {
  /** Id of the hint paragraph, or `undefined` when the field has no hint. */
  hintId: string | undefined;
  /**
   * Id of the label element. The association for a control that cannot take an
   * `htmlFor` — a contenteditable surface, a composite widget — which points at
   * it with `aria-labelledby` instead.
   */
  labelId: string;
}

/**
 * Canonical form-field wrapper: a label, the input you pass as children, and an
 * optional hint underneath.
 *
 * **Children may be a function**, called with the field's generated ids. A
 * control that wants its hint announced takes that form and threads `hintId`
 * into its own `aria-describedby`; everything else passes plain nodes and
 * nothing changes.
 *
 * Required/optional convention (house rule): fields are required by default and
 * carry NO marker. Genuinely optional fields pass `optional` to render a muted
 * "(optional)" suffix on the label. We mark the exceptions, not the norm —
 * which keeps short, mostly-required forms uncluttered and unambiguous.
 *
 * Use this for every labelled field. Do not hand-roll `<Label>` + input groups,
 * and do not mark required fields with an asterisk.
 *
 * `labelAction` renders a node on the right of the label row (e.g. a "Forgot
 * password?" link) — kept here so those fields stay inside the primitive
 * instead of regrowing a hand-rolled label.
 *
 * `icon` puts a glyph at the head of the label, decoratively: it is hidden from
 * assistive technology, because a picture cannot say anything the label text
 * does not already say. It is for a label that has become a *title* — one that
 * carries a fact about the field beyond its name, such as who will end up
 * reading what is typed into it — where the glyph is what makes that fact
 * legible at a glance. A field whose label is only its name does not take one.
 */
export function Field({
  label,
  icon: Icon,
  htmlFor,
  optional = false,
  hint,
  labelAction,
  children,
}: {
  label: string;
  icon?: LucideIcon;
  htmlFor?: string;
  optional?: boolean;
  hint?: string;
  labelAction?: React.ReactNode;
  children: React.ReactNode | ((ids: FieldDescriptors) => React.ReactNode);
}) {
  const c = useTranslations("common");
  const generated = useId();
  const labelId = `${generated}-label`;
  const hasHint = hint !== undefined && hint !== "";
  const hintId = hasHint ? `${generated}-hint` : undefined;

  return (
    // flex+gap owns the label→input→hint spacing for every field. The gap is
    // sized so the input's focus ring (ring-2 + ring-offset-2 sits ~4px past
    // its top edge) doesn't crowd the label above it.
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label
          id={labelId}
          htmlFor={htmlFor}
          className={Icon ? "flex items-center gap-1.5" : undefined}
        >
          {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
          <span>
            {label}
            {optional && (
              <span className="ml-1 font-normal text-muted-foreground">{c("optional")}</span>
            )}
          </span>
        </Label>
        {labelAction}
      </div>
      {typeof children === "function"
        ? children({ hintId, labelId })
        : children}
      {hasHint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
