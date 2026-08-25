"use client";

import type { ReactNode } from "react";
import { MapPin, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  TwoAudienceNotesPanel,
  type TwoAudienceNotesDraft,
} from "./TwoAudienceNotesPanel";

/** The two standing notes a site carries, independent of any product. */
export type SiteNotesDraft = TwoAudienceNotesDraft;

interface SiteNotesPanelProps {
  /** The venue's name — the thing these notes actually belong to. */
  siteName: string;
  /**
   * The site's street address, or `null` when nobody has filled one in.
   *
   * **Displayed, never edited by this panel** — it is family-facing detail that
   * belongs to the venue record, and a Gedu who needs it needs to *read* it on
   * the way there, not retype it. A surface whose viewer owns the field supplies
   * `addressEditor` below; this prop stays the display value on every surface.
   */
  address: string | null;
  publicNote: string | null;
  staffNote: string | null;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSave: (draft: SiteNotesDraft) => void | Promise<void>;
  /**
   * A control that may **write** the address the line above only displays —
   * supplied by a surface whose viewer owns that field, and omitted everywhere
   * else. A gedu shell passes nothing and this panel renders exactly what it
   * has always rendered.
   *
   * **A slot rather than a save callback, because the delta is not a save — it
   * is a different owner.** The two notes belong to whoever runs the building's
   * sessions and are written through an RPC that takes no address at all; the
   * address belongs to the location record, is an admin's alone, and travels on
   * an admin route with its own copy and its own failure line. Threading a
   * callback would have pulled that admin-only vocabulary into this component
   * to serve one caller, where a slot leaves the whole of it on the side that
   * owns it and leaves this panel knowing only *where* such a control sits.
   *
   * It is placed under the address line and **hidden while the notes editor is
   * open**, so the section carries one open editor at a time rather than two
   * competing Save buttons.
   */
  addressEditor?: ReactNode;
}

/**
 * The **site's** standing notes, shown on an in-person product's page beneath
 * the group's own.
 *
 * A remote club has no building; an in-person one has a building with a door
 * code, a room that is booked until half past, and a caretaker who locks up at
 * six. None of that is true of the *group* — it is true of the venue, and it is
 * true of every other product running there — so it is stored on the site and
 * surfaced here rather than being retyped into each group's notes and going
 * stale in four places at once.
 *
 * **The scope caveat is the load-bearing part of this component.** These fields
 * look exactly like the group notes directly above them, and a Gedu editing
 * them is editing something shared: a camp, an after-school club and a birthday
 * event at the same library all read the same two paragraphs. So the panel says
 * whose notes these are, by name, in a line that stays visible while the editor
 * is open — an editable field whose blast radius is invisible is the one way
 * this feature could do damage.
 */
export function SiteNotesPanel({
  siteName,
  address,
  publicNote,
  staffNote,
  editing,
  onEditingChange,
  onSave,
  addressEditor,
}: SiteNotesPanelProps) {
  const t = useTranslations("gedu.siteNotes");

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

  return (
    <TwoAudienceNotesPanel
      copy={{
        heading: t("heading"),
        add: t("add"),
        edit: t("edit"),
        cancel: t("cancel"),
        save: t("save"),
        emptyHint: t("emptyHint"),
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
      intro={
        addressEditor === undefined ? (
          addressLine
        ) : (
          <>
            {addressLine}
            {!editing && addressEditor}
          </>
        )
      }
      publicNote={publicNote}
      staffNote={staffNote}
      editing={editing}
      onEditingChange={onEditingChange}
      onSave={onSave}
    />
  );
}
