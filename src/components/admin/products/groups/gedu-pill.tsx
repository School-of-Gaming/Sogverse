"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { cn } from "@/lib/utils";
import { Constants, type GeduAssignmentRole } from "@/types";

interface GeduPillBaseProps {
  geduId: string;
  firstName: string;
  email?: string | null;
  /** A write for this seat is saving — greyed, and its controls are disabled. */
  isSaving?: boolean;
  /**
   * The whole group is busy (rename/delete in flight) — disable the controls
   * without greying the pill (the card itself already dims). Keeps them
   * mounted so the layout doesn't shift.
   */
  disabled?: boolean;
  onRemove?: () => void;
}

interface AssignedSeatProps {
  seat?: "assigned";
  /**
   * The pay class this assignment carries. Always shown, because a pill that
   * did not say which role it was would leave the select below it as the only
   * place the answer lived — and a value you have to open a control to read is
   * a value nobody audits.
   */
  role: GeduAssignmentRole;
  /**
   * Change the pay class. Omitted on a read-only surface, where the role is
   * drawn as a label instead — the control and the text carry the same value,
   * so nothing is lost and nothing is pressable that writes nowhere.
   */
  onRoleChange?: (role: GeduAssignmentRole) => void;
}

interface TraineeSeatProps {
  /**
   * A gedu shadowing the group. A trainee is not paid, so there is no pay
   * class to choose: the role slot holds the word "Trainee", drawn exactly as
   * an assigned Gedu's role is drawn on the same surface, with nothing to
   * open.
   */
  seat: "trainee";
  /**
   * Whether this surface draws roles as the select (it has a role write) or
   * as a label (it has none). A trainee's own role never changes; this only
   * keeps its pill looking like the assigned Gedus' pills beside it.
   */
  roleAsControl: boolean;
}

type GeduPillProps = GeduPillBaseProps & (AssignedSeatProps | TraineeSeatProps);

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
 *
 * **A trainee is the same pill in the same list.** Where an assigned Gedu's pill
 * has the role select, a trainee's has a select that looks exactly like it —
 * the same box, border, chevron and text, holding "Trainee" — and does nothing:
 * it is `inert` and hidden from assistive technology, with the word itself
 * given to a screen reader as plain text. It looks like every other dropdown on
 * the panel and has none of a dropdown's behaviour, so it is not greyed the way
 * a disabled one would be. Where the surface draws roles as labels, the
 * trainee's is the same label.
 *
 * **A trainee pill carries no promotion.** Certification is granted on the
 * admin's user page and nowhere else, and a certified trainee becomes a Gedu of
 * the group by being removed here and added through Add Gedu — the same two
 * steps any other change of seat takes.
 */
export function GeduPill(props: GeduPillProps) {
  const { geduId, firstName, email, isSaving, disabled, onRemove } = props;
  const t = useTranslations("admin.products.groupsPanel");
  const tRole = useTranslations("admin.geduRole");
  const inert = isSaving || disabled;
  const onRoleChange =
    props.seat === "trainee" ? undefined : props.onRoleChange;

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
          the role, then the way off the group. Both are decided by the
          snapshot the pill is drawn from, so nothing here arrives late and
          nothing moves. */}
      {props.seat === "trainee" ? (
        props.roleAsControl ? (
          <>
            {/* The role select's own element and classes, so its look cannot
                drift from the real one's — made inert (no focus, no pointer,
                never opens) and hidden from the accessibility tree, so
                nothing announces a combobox that cannot change. */}
            <select
              inert
              aria-hidden
              tabIndex={-1}
              defaultValue="trainee"
              className="h-7 shrink-0 rounded-md border border-border bg-background px-1.5 text-[11px]"
            >
              <option value="trainee">{t("trainee.role")}</option>
            </select>
            <span className="sr-only">{t("trainee.role")}</span>
          </>
        ) : (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {t("trainee.role")}
          </span>
        )
      ) : onRoleChange ? (
        <select
          value={props.role}
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
          disabled={inert}
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
          {tRole(props.role)}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={inert}
          aria-label={
            props.seat === "trainee"
              ? t("trainee.removeAria", { name: firstName })
              : t("gedu.removeAria", { name: firstName })
          }
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
