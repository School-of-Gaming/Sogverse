"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { cn } from "@/lib/utils";
import { Constants, type GeduAssignmentRole } from "@/types";

interface GeduPillProps {
  geduId: string;
  firstName: string;
  email?: string | null;
  /**
   * The pay class this assignment carries. Always shown, because a pill that
   * did not say which role it was would leave the select below it as the only
   * place the answer lived — and a value you have to open a control to read is
   * a value nobody audits.
   */
  role: GeduAssignmentRole;
  /** An add/remove for this Gedu is saving — greyed and the remove button is disabled. */
  isSaving?: boolean;
  /**
   * The whole group is busy (rename/delete in flight) — disable removal without
   * greying the pill (the card itself already dims). Keeps the remove button
   * mounted so the layout doesn't shift.
   */
  disabled?: boolean;
  /**
   * Change the pay class. Omitted on a read-only surface, where the role is
   * drawn as a label instead — the control and the text carry the same value,
   * so nothing is lost and nothing is pressable that writes nowhere.
   */
  onRoleChange?: (role: GeduAssignmentRole) => void;
  onRemove?: () => void;
}

/**
 * One assigned Gedu: their face, their name, the role they hold, and the way
 * off the group.
 *
 * **The role is a select on the pill, not a step in the add flow.** Adding
 * somebody assigns them as `primary` — what every assignment was before roles
 * existed, and what the overwhelming majority of them are — and changing that is
 * one press on the pill afterwards. The alternative was a confirm step in the
 * picker sheet, which today selects and closes in one press; asking every add to
 * answer a question whose answer is nearly always the default would have made
 * the common path longer to buy nothing.
 *
 * **It saves itself, like every other control on this panel.** There is no batch
 * and no Save: a role change posts through the same add the picker posts, which
 * upserts on (group, gedu) and updates the role, and the optimistic patch moves
 * the pill's own value so the select never sits showing what the admin just
 * replaced.
 */
export function GeduPill({
  geduId,
  firstName,
  email,
  role,
  isSaving,
  disabled,
  onRoleChange,
  onRemove,
}: GeduPillProps) {
  const t = useTranslations("admin.products.groupsPanel");
  const tRole = useTranslations("admin.geduRole");

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs transition-opacity",
        isSaving && "opacity-50",
      )}
    >
      <Avatar className="h-7 w-7 shrink-0">
        <Identicon id={geduId} size={28} />
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{firstName}</p>
        {email && (
          <p className="truncate text-[10px] text-muted-foreground">{email}</p>
        )}
      </div>
      {/* The trailing controls are one right-packed group, in a fixed order:
          the role, then the way off the group. Both are always mounted, so
          nothing here arrives late and nothing moves. */}
      {onRoleChange ? (
        <select
          value={role}
          // A `<select>`'s value is a bare string to the compiler, and an
          // assertion here would only be a promise that the options below never
          // change. Narrowing by looking the value up in the enum is the same
          // shape every other admin select uses, and it is what makes the
          // handler's type real rather than asserted.
          onChange={(event) => {
            const next = Constants.public.Enums.gedu_assignment_role.find(
              (value) => value === event.target.value,
            );
            if (next !== undefined) onRoleChange(next);
          }}
          disabled={isSaving || disabled}
          aria-label={tRole("selectAria", { name: firstName })}
          className="h-7 shrink-0 rounded-md border border-border bg-background px-1.5 text-[11px] disabled:pointer-events-none disabled:opacity-50"
        >
          {/* Read off codegen rather than listed here, so a role added to the
              enum arrives in the control without a second edit. */}
          {Constants.public.Enums.gedu_assignment_role.map((value) => (
            <option key={value} value={value}>
              {tRole(value)}
            </option>
          ))}
        </select>
      ) : (
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {tRole(role)}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={isSaving || disabled}
          aria-label={t("gedu.removeAria", { name: firstName })}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
