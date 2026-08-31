"use client";

import { useId, useState } from "react";
import { MapPin, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  TwoAudienceNotesPanel,
  type TwoAudienceNotesDraft,
} from "./TwoAudienceNotesPanel";

/** The two standing notes a site carries, independent of any product. */
export type SiteNotesDraft = TwoAudienceNotesDraft;

/**
 * The half of a site that is the **location record** — what it is called and
 * where it is — carrying only the fields that actually changed.
 *
 * Absence means untouched, never "clear it": a name and an address are written
 * by two different routes, so sending an unchanged one would put a stale value
 * back over whatever somebody else corrected in between. An address that is
 * present and empty is a real value meaning "we do not have one"; a name never
 * arrives empty, because a site has to be called something.
 */
export interface SiteDetailsDraft {
  name?: string;
  address?: string;
}

interface SitePanelProps {
  /** The site's canonical name — the thing all four of these fields belong to. */
  siteName: string;
  /** The site's street address, or `null` when nobody has filled one in. */
  address: string | null;
  publicNote: string | null;
  staffNote: string | null;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /**
   * Persist the two notes. **Awaited**, and supplied by every caller: a surface
   * that renders this panel at all is a surface whose viewer may write them.
   *
   * Called only when a note actually changed.
   */
  onSaveNotes: (draft: SiteNotesDraft) => void | Promise<void>;
  /**
   * Persist the name and the address. **Awaited**, and the whole of this
   * panel's capability model.
   *
   * **Supplying it is what makes those two fields editable; omitting it is what
   * makes them read-only** — never a role flag, and never a slot holding
   * somebody else's controls. A gedu shell can only write the notes, so it
   * passes nothing and gets exactly the panel it has always had: the name in
   * the caption, the address on its line, and two editable notes. An admin
   * shell owns the site record, so it passes this and gets the same panel with
   * the same one pencil, the same one Save, and four fields behind them.
   *
   * **Omitted is the default because it is the gedu answer**, which is the one
   * shell with no other — the same rule the workspace's back link, way-back and
   * roster heading follow.
   *
   * It is called only when the name or the address changed, with only the
   * halves that did, and it **throws** if either write is refused.
   */
  onSaveDetails?: (draft: SiteDetailsDraft) => void | Promise<void>;
}

/**
 * **One site, everywhere staff meet one** — its name, its address, the note
 * families read and the note only Gedus and admins do, in one panel with one
 * pencil and one Save.
 *
 * A remote club has no building; an in-person one has a building with a door
 * code, a room that is booked until half past, and a caretaker who locks up at
 * six. None of that is true of the *group* — it is true of the site, and it is
 * true of every other product running there — so it is stored on the site and
 * surfaced here rather than being retyped into each group's notes and going
 * stale in four places at once.
 *
 * **There is exactly one component rendering these four fields**, and the two
 * staff surfaces that show a site both render it: the group workspace's site
 * section, and the admin site page (`/admin/sites/[id]`), which *is* the site
 * record and has nothing else on it. The alternative — which this replaced —
 * was an address that appeared twice on the site page and was edited through a
 * different affordance on each surface, so two admins editing one building met
 * two different arrangements of the same four fields.
 *
 * **What differs between those surfaces is edit access, and it enters as a
 * callback** — see {@link SitePanelProps.onSaveDetails}. The panel never asks
 * who is looking.
 *
 * **The scope caveat is the load-bearing part of this component.** The notes
 * look exactly like the group notes beside them, and somebody editing anything
 * here is editing something shared: a camp, an after-school club and a birthday
 * event at the same library read the same name, the same address and the same
 * two paragraphs. So the panel says whose these are, by name, in a line that
 * stays visible while the editor is open — an editable field whose blast radius
 * is invisible is the one way this feature could do damage.
 *
 * **The address is shown on its own line until it is editable and being
 * edited**, and then it is the field. It is never both at once: one value with
 * a display line above the input that writes it was the original defect, and it
 * is exactly the kind of duplication that survives by looking harmless.
 */
export function SitePanel({
  siteName,
  address,
  publicNote,
  staffNote,
  editing,
  onEditingChange,
  onSaveNotes,
  onSaveDetails,
}: SitePanelProps) {
  const t = useTranslations("gedu.siteNotes");
  const fieldId = useId();

  const editsDetails = onSaveDetails !== undefined;
  const storedAddress = address ?? "";

  const [nameDraft, setNameDraft] = useState(siteName);
  const [addressDraft, setAddressDraft] = useState(storedAddress);

  // Re-seed when a stored value changes underneath — a save landing, or a
  // refetch — with React's adjust-state-during-render pattern, so no frame of a
  // stale draft is ever painted. The two are tracked separately: re-seeding
  // both when one lands would wipe an edit that has not saved yet, which is
  // precisely the state a partial failure leaves them in.
  const [seededName, setSeededName] = useState(siteName);
  if (siteName !== seededName) {
    setSeededName(siteName);
    setNameDraft(siteName);
  }
  const [seededAddress, setSeededAddress] = useState(storedAddress);
  if (storedAddress !== seededAddress) {
    setSeededAddress(storedAddress);
    setAddressDraft(storedAddress);
  }

  // And re-seed on open, so a cancelled edit is gone the next time the editor
  // opens — the same thing the notes half of this panel does with its own
  // drafts, keyed off the same prop.
  const [wasEditing, setWasEditing] = useState(editing);
  if (editing !== wasEditing) {
    setWasEditing(editing);
    if (editing) {
      setNameDraft(siteName);
      setAddressDraft(storedAddress);
    }
  }

  const trimmedName = nameDraft.trim();
  const trimmedAddress = addressDraft.trim();

  /**
   * What this Save would write, per field. **Only what changed is sent** — the
   * name, the address and the notes are three writes on two routes, so an
   * untouched value going along for the ride would land on top of somebody
   * else's correction, and each route leaves an absent field alone.
   */
  const nameChanged = trimmedName !== siteName;
  const addressChanged = trimmedAddress !== storedAddress;

  const addressLine =
    address === null ? null : (
      <p className="mt-1.5 flex items-start gap-1.5 text-sm">
        <MapPin
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span>
          <span className="sr-only">{t("addressLabel")}: </span>
          {address}
        </span>
      </p>
    );

  /**
   * Run every write this Save owes, and refuse as a whole if any of them was.
   *
   * **Every dirty field is attempted, even after one has failed**, and the two
   * halves settle independently: whichever landed re-seeds from its refetched
   * value above, so what is left dirty in the reopened editor is exactly what
   * still needs saving. Throwing is what keeps the editor open and puts the
   * failure line under it — the panel around this owns both.
   */
  const handleSave = async (notes: SiteNotesDraft) => {
    const failures: string[] = [];

    if (onSaveDetails !== undefined && (nameChanged || addressChanged)) {
      try {
        await onSaveDetails({
          ...(nameChanged ? { name: trimmedName } : {}),
          ...(addressChanged ? { address: trimmedAddress } : {}),
        });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    const notesChanged =
      notes.publicNote !== (publicNote ?? "").trim() ||
      notes.staffNote !== (staffNote ?? "").trim();
    if (notesChanged) {
      try {
        await onSaveNotes(notes);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    // The messages are English server text written for a log; the panel shows
    // one translated line instead. They are carried anyway so a refusal is
    // legible in a console rather than being swallowed here.
    if (failures.length > 0) throw new Error(failures.join("; "));
  };

  return (
    <TwoAudienceNotesPanel
      copy={{
        heading: t("heading"),
        edit: t("edit"),
        cancel: t("cancel"),
        save: t("save"),
        publicEmpty: t("publicEmpty"),
        staffEmpty: t("staffEmpty"),
        publicLabel: t("publicLabel"),
        publicHint: t("publicHint"),
        publicPlaceholder: t("publicPlaceholder"),
        staffLabel: t("staffLabel"),
        staffHint: t("staffHint"),
        staffPlaceholder: t("staffPlaceholder"),
        saveFailed: t("saveFailed"),
      }}
      caption={
        <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Share2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{t("sharedCaption", { site: siteName })}</span>
        </p>
      }
      // The line steps aside only for the field that replaces it. A reader who
      // cannot write the address keeps it in front of them while they write the
      // notes, which is what a Gedu on the way there needs it for.
      intro={editsDetails && editing ? null : addressLine}
      editorFields={
        editsDetails
          ? ({ disabled }) => (
              <div className="space-y-4">
                <Field label={t("nameLabel")} htmlFor={`${fieldId}-name`}>
                  <Input
                    id={`${fieldId}-name`}
                    value={nameDraft}
                    placeholder={t("namePlaceholder")}
                    disabled={disabled}
                    onChange={(event) => setNameDraft(event.target.value)}
                  />
                </Field>
                {/* No "(optional)" marker on the address, though it is: this
                    panel marks nothing, so marking one field here would imply
                    the two notes beside it are required. What is genuinely
                    required says so in words when it is missing, below. */}
                <Field label={t("addressLabel")} htmlFor={`${fieldId}-address`}>
                  <Input
                    id={`${fieldId}-address`}
                    value={addressDraft}
                    placeholder={t("addressPlaceholder")}
                    disabled={disabled}
                    onChange={(event) => setAddressDraft(event.target.value)}
                  />
                </Field>
              </div>
            )
          : undefined
      }
      // A blank name is an edit in progress, not an intent — and the editor
      // closing over it would discard what was typed without saying anything.
      saveBlockedReason={
        editsDetails && trimmedName.length === 0 ? t("nameRequired") : null
      }
      publicNote={publicNote}
      staffNote={staffNote}
      editing={editing}
      onEditingChange={onEditingChange}
      onSave={handleSave}
    />
  );
}
