import { useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import {
  SitePanel,
  type SiteDetailsDraft,
  type SiteNotesDraft,
} from "@/components/group-workspace/SitePanel";

/**
 * ============================================================================
 * One site panel, two capabilities — expressed by which saves the caller gives.
 * ============================================================================
 *
 * This is the whole of what separates the gedu's view of a site from an
 * admin's: **a callback, not a role flag and not a slot**. So what is under
 * test here is the contract itself, on the one component both surfaces render —
 * a shell test can only ever say that its own shell passed the right thing.
 *
 * Four claims, and the first is the permission model:
 *
 *  1. **No details save, no way in to the name or the address.** A gedu surface
 *     supplies only the notes save, and the two location-record fields are not
 *     merely disabled — they are not rendered, so there is no affordance to
 *     find.
 *  2. **The details save turns them into fields behind the same one Save**, and
 *     only what changed is sent: an untouched half would land on top of
 *     whatever somebody else corrected in between.
 *  3. **A blank name refuses the save out loud**, rather than closing the
 *     editor over a discarded field.
 *  4. **A refused write leaves the editor open with the failure line**, and the
 *     write that did land still landed.
 */

/** Drives `editing` the way both real shells do — the panel never owns it. */
function Harness({
  onSaveNotes,
  onSaveDetails,
  address = "Viides linja 11, 00530 Helsinki",
  publicNote = "Come in through the side door.",
  staffNote = null,
}: {
  onSaveNotes: (draft: SiteNotesDraft) => void | Promise<void>;
  onSaveDetails?: (draft: SiteDetailsDraft) => void | Promise<void>;
  address?: string | null;
  publicNote?: string | null;
  staffNote?: string | null;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <SitePanel
        siteName="Kallion kirjasto"
        address={address}
        publicNote={publicNote}
        staffNote={staffNote}
        editing={editing}
        onEditingChange={setEditing}
        onSaveNotes={onSaveNotes}
        onSaveDetails={onSaveDetails}
      />
    </NextIntlClientProvider>
  );
}

const openEditor = () =>
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

afterEach(cleanup);

describe("site panel — a viewer who may write only the notes", () => {
  it("renders the address to read and offers no way to change it", () => {
    render(<Harness onSaveNotes={vi.fn()} />);

    expect(screen.getByText("Viides linja 11, 00530 Helsinki")).toBeTruthy();

    openEditor();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.queryByLabelText("Address")).toBeNull();
    // The notes are still theirs to write — this is a capability, not a lock.
    expect(screen.getByLabelText("Note for families")).toBeTruthy();
  });

  it("saves the notes alone", async () => {
    const saveNotes = vi.fn();
    render(<Harness onSaveNotes={saveNotes} />);

    openEditor();
    fireEvent.change(screen.getByLabelText("Note for families"), {
      target: { value: "Use the main entrance." },
    });
    save();

    await waitFor(() => expect(saveNotes).toHaveBeenCalledTimes(1));
    expect(saveNotes).toHaveBeenCalledWith({
      publicNote: "Use the main entrance.",
      staffNote: "",
    });
  });
});

describe("site panel — a viewer who owns the site record", () => {
  it("puts the name and address in the same editor, behind the same Save", () => {
    render(<Harness onSaveNotes={vi.fn()} onSaveDetails={vi.fn()} />);

    openEditor();
    expect(screen.getByLabelText("Name")).toHaveProperty(
      "value",
      "Kallion kirjasto",
    );
    expect(screen.getByLabelText("Address")).toHaveProperty(
      "value",
      "Viides linja 11, 00530 Helsinki",
    );
    // One Save for all four fields, and the address is not also printed above
    // the field that writes it — the duplication this panel exists to remove.
    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(1);
    expect(
      screen.queryByText("Viides linja 11, 00530 Helsinki"),
    ).toBeNull();
  });

  it("sends only the fields that changed, and skips untouched notes", async () => {
    const saveNotes = vi.fn();
    const saveDetails = vi.fn();
    render(<Harness onSaveNotes={saveNotes} onSaveDetails={saveDetails} />);

    openEditor();
    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "Toinen linja 4, 00530 Helsinki" },
    });
    save();

    await waitFor(() => expect(saveDetails).toHaveBeenCalledTimes(1));
    // No `name` key at all: an unchanged value going along for the ride is what
    // overwrites somebody else's correction.
    expect(saveDetails).toHaveBeenCalledWith({
      address: "Toinen linja 4, 00530 Helsinki",
    });
    expect(saveNotes).not.toHaveBeenCalled();
  });

  it("refuses a blank name in words rather than discarding the edit", () => {
    const saveDetails = vi.fn();
    render(<Harness onSaveNotes={vi.fn()} onSaveDetails={saveDetails} />);

    openEditor();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  " } });

    expect(screen.getByText("A site needs a name.")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveProperty("disabled", true);

    fireEvent.click(button);
    expect(saveDetails).not.toHaveBeenCalled();
  });

  it("keeps the editor open on a refused write, having made the one that landed", async () => {
    const saveNotes = vi.fn();
    const saveDetails = vi.fn().mockRejectedValue(new Error("nope"));
    render(<Harness onSaveNotes={saveNotes} onSaveDetails={saveDetails} />);

    openEditor();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Kallion kirjaston monitoimisali" },
    });
    fireEvent.change(screen.getByLabelText("Note for families"), {
      target: { value: "Use the main entrance." },
    });
    save();

    // Both were attempted — a refused name says nothing about the notes.
    await waitFor(() => expect(saveNotes).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "That didn’t save. Try again.",
    );
    // Still open, with the refused value still in the field to retry.
    expect(screen.getByLabelText("Name")).toHaveProperty(
      "value",
      "Kallion kirjaston monitoimisali",
    );
  });
});
