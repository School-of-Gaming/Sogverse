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
 * Seven claims, and the first is the permission model:
 *
 *  1. **No details save, no way in to the name or the address.** A gedu surface
 *     supplies only the notes save, and the two location-record fields are not
 *     merely disabled — they are not rendered, so there is no affordance to
 *     find. The ghost inviting an address is part of that capability and is
 *     absent there too.
 *  2. **The details save turns them into fields behind the same one Save**, and
 *     only what changed is sent: an untouched half would land on top of
 *     whatever somebody else corrected in between.
 *  3. **A blank name refuses the save out loud**, rather than closing the
 *     editor over a discarded field.
 *  4. **A refused write leaves the editor open with the failure line**, and the
 *     write that did land still landed.
 *  5. **A stored value changing under an open editor does not touch the
 *     draft.** Refetches land on their own schedule; typing is not theirs to
 *     overwrite.
 *  6. **A retry after a half-failed save writes only what is still dirty**, so
 *     the half that landed is not written a second time.
 *  7. **A refusal that a block hid does not come back when the block lifts.**
 *     The two share one slot, so an error behind a live reason is an error
 *     nobody is being shown — and re-showing it later would describe an attempt
 *     from two edits ago.
 */

/** Drives `editing` the way both real shells do — the panel never owns it. */
function Harness({
  onSaveNotes,
  onSaveDetails,
  siteName = "Kallion kirjasto",
  address = "Viides linja 11, 00530 Helsinki",
  publicNote = "Come in through the side door.",
  staffNote = null,
}: {
  onSaveNotes: (draft: SiteNotesDraft) => void | Promise<void>;
  onSaveDetails?: (draft: SiteDetailsDraft) => void | Promise<void>;
  siteName?: string;
  address?: string | null;
  publicNote?: string | null;
  staffNote?: string | null;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <SitePanel
        siteName={siteName}
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

  it("says nothing at all where there is no address", () => {
    render(<Harness onSaveNotes={vi.fn()} address={null} />);

    // The ghost is an invitation to write one, so it belongs only to a viewer
    // who could — and the two note ghosts beside it are still theirs.
    expect(
      screen.queryByText(
        "Add the street address families need to find the building.",
      ),
    ).toBeNull();
    expect(
      screen.getByText(
        "Add what the next Gedu at this site needs to know — keys, kit, room quirks.",
      ),
    ).toBeTruthy();
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

  // Claim 2 from the other side: the draft is always trimmed, so the stored
  // value has to be compared trimmed too. A row carrying padding — a seed, an
  // import — otherwise reads as dirty on a field nobody touched, and the Save
  // writes the trimmed value back over it as though that had been asked for.
  it("does not treat padding on a stored value as an edit", async () => {
    const saveNotes = vi.fn();
    const saveDetails = vi.fn();
    render(
      <Harness
        onSaveNotes={saveNotes}
        onSaveDetails={saveDetails}
        address="  Viides linja 11, 00530 Helsinki  "
      />,
    );

    openEditor();
    fireEvent.change(screen.getByLabelText("Note for families"), {
      target: { value: "Use the main entrance." },
    });
    save();

    await waitFor(() => expect(saveNotes).toHaveBeenCalledTimes(1));
    expect(saveDetails).not.toHaveBeenCalled();
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

  it("does not resurface a hidden failure when the block that hid it lifts", async () => {
    const onSaveDetails = vi.fn().mockRejectedValue(new Error("nope"));
    render(<Harness onSaveNotes={vi.fn()} onSaveDetails={onSaveDetails} />);

    openEditor();
    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "Toinen linja 4, 00530 Helsinki" },
    });
    save();
    await screen.findByRole("alert");

    // Blanking the name blocks the Save, and the reason takes the failure
    // line's slot — so from here on the failure is not on screen.
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } });
    expect(screen.getByText("A site needs a name.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    // Typing a name back lifts the block. What must not come back with it is a
    // refusal of an attempt two edits ago, over a draft that has changed since.
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Kallion kirjasto" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers the ghost line where there is no address yet", () => {
    render(<Harness onSaveNotes={vi.fn()} onSaveDetails={vi.fn()} address={null} />);

    expect(
      screen.getByText(
        "Add the street address families need to find the building.",
      ),
    ).toBeTruthy();
  });

  it("leaves an open draft alone when the stored values change underneath", () => {
    const onSaveNotes = vi.fn();
    const onSaveDetails = vi.fn();
    const { rerender } = render(
      <Harness onSaveNotes={onSaveNotes} onSaveDetails={onSaveDetails} />,
    );

    openEditor();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Kallion kirjaston monitoimisali" },
    });
    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "Toinen linja 4, 00530 Helsinki" },
    });

    // A background refetch lands — React Query refetches on window focus, so
    // this arrives on nobody's schedule and certainly not the admin's. Both
    // stored halves change while the editor is open and being typed into.
    rerender(
      <Harness
        onSaveNotes={onSaveNotes}
        onSaveDetails={onSaveDetails}
        siteName="Kallion kirjaston sivupiste"
        address="Kolmas linja 7, 00530 Helsinki"
      />,
    );

    expect(screen.getByLabelText("Name")).toHaveProperty(
      "value",
      "Kallion kirjaston monitoimisali",
    );
    expect(screen.getByLabelText("Address")).toHaveProperty(
      "value",
      "Toinen linja 4, 00530 Helsinki",
    );
  });

  it("retrying a half-failed save does not write the half that landed", async () => {
    const onSaveNotes = vi.fn();
    const onSaveDetails = vi.fn().mockRejectedValue(new Error("nope"));
    const { rerender } = render(
      <Harness onSaveNotes={onSaveNotes} onSaveDetails={onSaveDetails} />,
    );

    openEditor();
    fireEvent.change(screen.getByLabelText("Address"), {
      target: { value: "Toinen linja 4, 00530 Helsinki" },
    });
    fireEvent.change(screen.getByLabelText("Note for families"), {
      target: { value: "Use the main entrance." },
    });
    save();

    await waitFor(() => expect(onSaveNotes).toHaveBeenCalledTimes(1));
    await screen.findByRole("alert");

    // The notes write landed, so its awaited invalidation puts the written
    // value back on the prop — which is what the real shells' returned
    // invalidations do, and what makes the retry below able to tell the two
    // halves apart.
    rerender(
      <Harness
        onSaveNotes={onSaveNotes}
        onSaveDetails={onSaveDetails}
        publicNote="Use the main entrance."
      />,
    );

    save();

    // The address is still dirty, so it is attempted again — and the notes are
    // not, because they are no longer dirty. "Only what changed is written"
    // holds across a retry, not just on a first attempt.
    await waitFor(() => expect(onSaveDetails).toHaveBeenCalledTimes(2));
    expect(onSaveNotes).toHaveBeenCalledTimes(1);
  });
});
