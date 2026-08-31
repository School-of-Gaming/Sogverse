"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, MapPin, Share2 } from "lucide-react";
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
  /**
   * Whether the editor is open — the caller's, never the panel's. Meaningless
   * without {@link onSaveNotes}, and omitted alongside it.
   */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /**
   * Persist the two notes. **Awaited**, and called only when a note actually
   * changed.
   *
   * **Omitted, the whole panel is a pure view**: no pencil, no editor, no
   * ghosts. That is the shape a surface takes when it is showing *which* site a
   * product runs at rather than owning the site's record — the product form's
   * site field is the case, and it pairs the view with {@link editHref}.
   */
  onSaveNotes?: (draft: SiteNotesDraft) => void | Promise<void>;
  /**
   * Persist the name and the address — the `locations` record itself.
   *
   * **Exactly one surface supplies it: the admin site page, which *is* that
   * record.** Everywhere else the panel is reached from a page scoped to
   * something else (a product, a group), and there "Edit → rename → Save" reads
   * as changing this product's site while actually renaming the building for
   * every product in it. A shared record is edited where its scope is visible,
   * and nowhere else; the way there from those pages is {@link editHref}.
   *
   * It is a capability rather than a role flag, and a *save* rather than a slot:
   * the panel renders one editor with one Save whatever it is given, so handing
   * it somebody else's controls would put a second Save inside it. Supplying it
   * without {@link onSaveNotes} is meaningless — the notes' Save is the one this
   * rides on.
   *
   * Called only when the name or the address changed, with only the halves that
   * did, and it **throws** if either write is refused.
   */
  onSaveDetails?: (draft: SiteDetailsDraft) => void | Promise<void>;
  /**
   * Where this site's record is edited — rendered as a quiet link in the header
   * row.
   *
   * **A statement about who brought you here, which is exactly what a shared
   * body cannot know**, so it enters as a prop whose default is the gedu answer:
   * absent. A gedu has no admin site page to be sent to; the admin surfaces that
   * show a site they do not own (the product form's site field, the group page)
   * pass it; the site page itself does not, because it is already there.
   */
  editHref?: string;
}

/**
 * **One site, everywhere staff meet one** — its name, its address, the note
 * families read and the note only Gedus and admins do, in one panel: read the
 * same way on every surface, and written behind one pencil and one Save on
 * whichever of them may write.
 *
 * A remote club has no building; an in-person one has a building with a door
 * code, a room that is booked until half past, and a caretaker who locks up at
 * six. None of that is true of the *group* — it is true of the site, and it is
 * true of every other product running there — so it is stored on the site and
 * surfaced here rather than being retyped into each group's notes and going
 * stale in four places at once.
 *
 * **There is exactly one component rendering these four fields**, and every
 * staff surface that shows a site renders it: the group workspace's site
 * section, the admin site page (`/admin/sites/[id]`), which *is* the site
 * record and has nothing else on it, and the admin product form's site field,
 * where it hangs under the chosen-place card. The alternative — which this
 * replaced —
 * was an address that appeared twice on the site page and was edited through a
 * different affordance on each surface, so two admins editing one building met
 * two different arrangements of the same four fields.
 *
 * **A surface may mount this inside a `<form>` of its own, and the product form
 * does.** Every control here is a `type="button"` or a link and every save
 * reaches its own route directly, so nothing in this panel can commit a
 * surrounding form. The one thing that could is Enter inside a text input — a
 * browser's implicit submit of whichever form the input sits in — and the one
 * surface that mounts this in a form renders it read-only, so it has no text
 * input to press Enter in.
 *
 * **What differs between those surfaces is edit access, and it enters as
 * callbacks — three capabilities, widest last:**
 *
 * 1. **Neither save: a pure view.** No pencil, no editor, no ghosts, and the way
 *    to change anything is the `editHref` link out. This is what a page scoped
 *    to something *else* gets — the product form's site field shows which
 *    building a product runs in, and a rename typed there would read as
 *    repointing the product while actually renaming the building for every
 *    product in it.
 * 2. **`onSaveNotes`: the shared staff content.** The note families read and the
 *    note only staff do, which describe the building rather than identify it and
 *    are the gedu's whole edit surface. Every staff surface rendering a group
 *    has this — and both the gedu shell and the admin one have exactly it, which
 *    is what keeps "an admin sees what the gedu sees" literally true.
 * 3. **Both saves: the record.** The name and the address join the same editor
 *    behind the same one Save. One surface supplies it, the admin site page,
 *    because that page *is* the site and its scope is legible from its URL down.
 *
 * The panel never asks who is looking; it asks what it was given.
 *
 * **The scope caveat is the load-bearing part of this component.** The notes
 * look exactly like the group notes beside them, and somebody editing anything
 * here is editing something shared: a camp, an after-school club and a birthday
 * event at the same library read the same name, the same address and the same
 * two paragraphs. So the panel says whose these are, by name, in a line that
 * stays visible while the editor is open — an editable field whose blast radius
 * is invisible is the one way this feature could do damage. **The caption stays
 * on a read-only panel too**, where it is describing the destination of the
 * `editHref` link rather than a field on screen: the copy therefore says what a
 * change to the site does, never what "an edit here" does, so it is true in
 * both modes.
 *
 * **The address is shown on its own line until it is editable and being
 * edited**, and then it is the field. It is never both at once: one value with
 * a display line above the input that writes it was the original defect, and it
 * is exactly the kind of duplication that survives by looking harmless. When
 * there is no address at all, that line is a ghost inviting one — but only for
 * a viewer who could write it.
 */
export function SitePanel({
  siteName,
  address,
  publicNote,
  staffNote,
  editing = false,
  onEditingChange,
  onSaveNotes,
  onSaveDetails,
  editHref,
}: SitePanelProps) {
  const t = useTranslations("gedu.siteNotes");
  const fieldId = useId();

  const editsNotes = onSaveNotes !== undefined;
  // Details ride on the notes' Save, so a details save with no notes save has
  // nothing to commit it. Reading the pair rather than `onSaveDetails` alone
  // keeps that from rendering two name fields nobody can submit.
  const editsDetails = editsNotes && onSaveDetails !== undefined;
  const storedAddress = address ?? "";

  const [nameDraft, setNameDraft] = useState(siteName);
  const [addressDraft, setAddressDraft] = useState(storedAddress);

  // Re-seed when a stored value changes underneath — a save landing, or a
  // refetch — with React's adjust-state-during-render pattern, so no frame of a
  // stale draft is ever painted.
  //
  // **Only while the editor is closed.** A background refetch (React Query
  // refetches on window focus by default) lands on its own schedule, and an
  // admin who alt-tabs away mid-edit must not come back to a field that has
  // silently reverted to what the server holds. What is typed is only ever
  // replaced by the on-open seed below, which is the admin's own click.
  //
  // The two are still tracked separately, because they are two writes and one
  // can land without the other. What makes a partial failure retry correctly is
  // **not** this re-seed — it is that each mutation's invalidation is awaited,
  // so the succeeded half's fresh value is in `siteName`/`address` by the time
  // the dirty comparisons below run, and the retry sends only what is left.
  const [seededName, setSeededName] = useState(siteName);
  if (!editing && siteName !== seededName) {
    setSeededName(siteName);
    setNameDraft(siteName);
  }
  const [seededAddress, setSeededAddress] = useState(storedAddress);
  if (!editing && storedAddress !== seededAddress) {
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
   *
   * **Both sides are trimmed**, because the draft always is: a stored value
   * carrying padding — a seeded row, an import — would otherwise read as dirty
   * on a field nobody touched, and the Save would write the trimmed value back
   * over it as if that had been asked for.
   */
  const nameChanged = trimmedName !== siteName.trim();
  const addressChanged = trimmedAddress !== storedAddress.trim();

  const addressLine =
    address !== null ? (
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
    ) : editsDetails ? (
      // A ghost line where the address would be, for a viewer who can write
      // one — the same italic-muted grammar and the same imperative mood as the
      // two note ghosts below, and for the same reason those exist: the two
      // editors this panel replaced each had an "add address" affordance, and
      // the notes' own record says structure that is invisible until the editor
      // is open is a feature nobody discovers. A gedu, who cannot write it,
      // gets nothing here — there is no invitation to make.
      <p className="mt-1.5 text-sm italic leading-relaxed text-muted-foreground">
        {t("addressEmpty")}
      </p>
    ) : null;

  /**
   * Run every write this Save owes, and refuse as a whole if any of them was.
   *
   * **Every dirty field is attempted, even after one has failed**, and the two
   * halves settle independently. What makes the retry send only what is left is
   * that each write's invalidation is awaited: whichever landed has its written
   * value back on the props by the time this returns, so the dirty comparisons
   * above stop naming it while the editor stays open over the untouched draft.
   * Throwing is what keeps the editor open and puts the failure line under it —
   * the panel around this owns both.
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
    if (onSaveNotes !== undefined && notesChanged) {
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
      /* The way out to the record, on the surfaces that show a site they do not
         own. Quieter than the pencil beside it on purpose — this leaves the
         page, and leaving is the smaller of the two things an admin came to the
         product form to do. The trailing arrow is the repo's idiom for a link
         that navigates rather than acts. */
      headerLink={
        editHref === undefined ? undefined : (
          <Link
            href={editHref}
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("editSite")}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )
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
      // No notes save, no save at all — the details ride on this one, so the
      // panel below turns read-only as a whole rather than half of it.
      onSave={editsNotes ? handleSave : undefined}
    />
  );
}
