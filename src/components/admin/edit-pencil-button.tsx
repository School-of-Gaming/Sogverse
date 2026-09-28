import { Pencil } from "lucide-react";

/**
 * The pencil at the end of a summary line on the admin user page that opens
 * that line's editor dialog. One component so every editable line on the page
 * offers its edit the same way, in the same place — last in its row.
 */
export function EditPencilButton({
  label,
  onClick,
}: {
  /** The accessible name, since the glyph is the button's only content. */
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}
