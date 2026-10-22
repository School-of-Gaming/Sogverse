import { App } from "@modelcontextprotocol/ext-apps";
// The two token modules alone: the package's index also carries the icon set,
// and with it React, which a view drawn without React has no use for.
import { BRAND, NEUTRALS, statusHex } from "@sog/ui/tokens/brand";
import { FACES } from "@sog/ui/tokens/typography";
import { z } from "zod";
import {
  batchReport,
  judgeInBatch,
  placeCalls,
  type FileOutcome,
  type PlacementOutcome,
} from "./batch";
import { sourceRect, type Frame } from "./frames";
import "./style.css";

/*
 * The picture uploader, shown inside the admin's AI app by an opening tool —
 * `open_cover_uploader` for a Library cover, `open_landing_image_uploader`
 * for landing page pictures. The admin picks pictures — several at once,
 * where the destination takes more than one, from the file picker or by
 * dropping them on the view — and the view measures each. **It never crops**:
 * a picture already the shape of one of the frames the opening offers, within
 * 1%, is scaled to that frame's exact size as a JPEG — the size Sogverse's
 * catalogue refuses anything else than — and a picture of no offered shape,
 * of one this destination does not take, of another shape than the batch's
 * first where the destination needs one shape, or past the room the
 * destination has, is refused: it is not uploaded, and the view says why.
 * One refused picture never holds back the others.
 *
 * Each fitting JPEG goes, with its frame's purpose, to the one app-only upload
 * tool in a call of its own — never two pictures in one request, which has a
 * size limit — and, when the opening names a placement, the entries the
 * uploads answer go to that tool together. Every call goes through the host:
 * the view holds no token and opens no connection of its own. The model is
 * then told the whole batch at once: each file's new entry or why it was
 * refused, and where the pictures went.
 *
 * Everything that differs by purpose (the frames, their sizes, which this
 * destination takes and why, how many it takes, the largest JPEG a call can
 * carry, the words) arrives in the opening tool's `uploader` field, so the
 * server is the one definition and this view restates none of it.
 */

// The colours and the face, from @sog/ui's tokens: SOG-UI's one theme.
const root = document.documentElement.style;
root.setProperty("--background", NEUTRALS.background.hex);
root.setProperty("--card", NEUTRALS.card.hex);
root.setProperty("--foreground", NEUTRALS.foreground.hex);
root.setProperty("--muted-foreground", NEUTRALS.mutedForeground.hex);
root.setProperty("--border", NEUTRALS.border.hex);
root.setProperty("--act", BRAND.act.hex);
root.setProperty("--act-foreground", BRAND.act.foreground);
root.setProperty("--destructive", statusHex("destructive"));
root.setProperty("--font-sans", `${FACES.sans.name}, ${FACES.sans.fallback}`);

/** The app-only tool every picture is stored through, given the frame's purpose. */
const UPLOAD_TOOL = "upload_catalogue_picture";

/** The opening tool's `uploader` field. */
const openingSchema = z.object({
  uploader: z.object({
    heading: z.string(),
    subject: z.string(),
    frames: z
      .array(
        z.object({
          purpose: z.string(),
          name: z.string(),
          width: z.number().int().positive(),
          height: z.number().int().positive(),
          refusal: z.string().nullable(),
        }),
      )
      .min(1),
    noFrame: z.string(),
    room: z.object({ pictures: z.number().int().positive(), full: z.string() }).nullable(),
    oneShape: z.string().nullable(),
    maxBytes: z.number(),
    place: z
      .object({
        tool: z.string(),
        arguments: z.record(z.string(), z.unknown()),
        imageArgument: z.string(),
        list: z.boolean(),
        actionLabel: z.string(),
        done: z.string(),
        outcome: z.string(),
      })
      .nullable(),
  }),
});
type Opening = z.infer<typeof openingSchema>["uploader"];

/** What an upload tool answers, as far as this view reads it. */
const storedSchema = z.object({
  image: z.object({ catalogueId: z.string(), label: z.string() }),
});

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`#${id} is missing`);
  return found;
}

const drop = element("drop", HTMLElement);
const heading = element("heading", HTMLHeadingElement);
const subject = element("subject", HTMLParagraphElement);
const fileLabel = element("file-label", HTMLSpanElement);
const fileHint = element("file-hint", HTMLSpanElement);
const fileInput = element("file", HTMLInputElement);
const list = element("files", HTMLOListElement);
const uploadButton = element("upload", HTMLButtonElement);
const status = element("status", HTMLParagraphElement);

/** One picked file, its row on screen, and what the checks made of it. */
interface Row {
  file: File;
  image: HTMLImageElement;
  state: HTMLParagraphElement;
  label: HTMLInputElement;
  /** The scaled JPEG, base64, the name it is uploaded under, and the frame it fits; null until checked, or when refused. */
  picked: { base64: string; fileName: string; frame: Frame; soft: boolean } | null;
  outcome: FileOutcome | null;
}

let opening: Opening | null = null;
let rows: Row[] = [];
/** True while a pick is being checked. */
let checking = false;
/** Counts picks, so a newer pick stops an older one still being checked. */
let pickNumber = 0;
/**
 * Set before the first call and cleared only where nothing was stored, so the
 * button cannot re-enable between the click and the pictures being placed.
 */
let committing = false;

function say(text: string, tone: "info" | "error" = "info"): void {
  status.textContent = text;
  status.dataset.tone = tone;
}

function show(row: Row, text: string, tone: "info" | "error" | "done" = "info"): void {
  row.state.textContent = text;
  row.state.dataset.tone = tone;
}

function ready(): Row[] {
  return rows.filter((row) => row.picked !== null && row.outcome === null);
}

function refresh(): void {
  const open = opening !== null && !committing;
  fileInput.disabled = !open;
  drop.dataset.accepting = String(open);
  for (const row of rows) row.label.disabled = !open || row.picked === null;
  uploadButton.disabled = !open || checking || ready().length === 0;
}

/** The text a tool answered with, joined: a refusal's sentence. */
function textOf(result: { content?: unknown[] }): string {
  return (result.content ?? [])
    .map((block) =>
      typeof block === "object" && block !== null && "text" in block ? String(block.text) : "",
    )
    .join(" ")
    .trim();
}

/** A picture whose JPEG stays over the call's limit at every quality tried. */
class PictureTooLarge extends Error {}

/**
 * Draw a picture that fits a frame onto a canvas of exactly the frame's size
 * — the whole picture, less the sliver under 1% its ratio differs by — and
 * encode it. A JPEG over the call's limit is encoded again at a lower quality
 * before giving up.
 */
function scaleToFrame(
  bitmap: ImageBitmap,
  frame: Frame,
  maxBytes: number,
): { dataUrl: string; base64: string; drawnWidth: number } {
  const { sx, sy, sw, sh } = sourceRect(bitmap.width, bitmap.height, frame);
  const canvas = document.createElement("canvas");
  canvas.width = frame.width;
  canvas.height = frame.height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("No 2D canvas context");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, frame.width, frame.height);

  for (const quality of [0.9, 0.8, 0.7]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if ((base64.length * 3) / 4 <= maxBytes) {
      return { dataUrl, base64, drawnWidth: sw };
    }
  }
  throw new PictureTooLarge();
}

const app = new App({ name: "Sogverse picture uploader", version: "3.0.0" }, {});

app.ontoolresult = (result) => {
  if (result.isError) {
    say(textOf(result) || "The uploader could not open.", "error");
    return;
  }
  const parsed = openingSchema.safeParse(result.structuredContent);
  opening = parsed.success ? parsed.data.uploader : null;
  if (opening === null) {
    say("The uploader could not read what the picture is for.", "error");
    return;
  }
  heading.textContent = opening.heading;
  document.title = opening.heading;
  subject.textContent = opening.subject;
  uploadButton.textContent = opening.place?.actionLabel ?? "Upload";
  const several = opening.room === null || opening.room.pictures > 1;
  fileInput.multiple = several;
  fileLabel.textContent = several ? "Pictures" : "Picture";
  fileHint.textContent = several
    ? opening.room === null
      ? "Pick as many as you like, or drop them here."
      : `Pick up to ${opening.room.pictures}, or drop them here.`
    : "Pick one, or drop it here.";
  refresh();
};

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A row on screen for a picked file, waiting to be checked. */
function addRow(file: File): Row {
  const item = document.createElement("li");
  const image = document.createElement("img");
  image.alt = "";
  image.hidden = true;
  const body = document.createElement("div");
  const name = document.createElement("p");
  name.className = "name";
  name.textContent = file.name;
  const state = document.createElement("p");
  state.className = "state";
  const labelField = document.createElement("label");
  labelField.className = "field";
  labelField.hidden = true;
  const caption = document.createElement("span");
  caption.textContent = "Label";
  const label = document.createElement("input");
  label.type = "text";
  label.maxLength = 200;
  labelField.append(caption, label);
  body.append(name, state, labelField);
  item.append(image, body);
  list.append(item);
  const row: Row = { file, image, state, label, picked: null, outcome: null };
  show(row, "Checking…");
  return row;
}

/** Refuse a picked file before anything is uploaded. */
function refuse(row: Row, reason: string): void {
  row.outcome = { kind: "refused", fileName: row.file.name, reason };
  show(row, `Refused, not uploaded. ${reason}`, "error");
}

/**
 * Check every picked file in the order picked: measure it, judge it against
 * the frames and against what the batch has already taken, and scale the
 * ones that fit. A newer pick replaces this one.
 */
async function pick(files: readonly File[]): Promise<void> {
  if (opening === null || committing || files.length === 0) return;
  const current = opening;
  const mine = ++pickNumber;
  list.replaceChildren();
  list.hidden = false;
  say("");
  const added = files.map(addRow);
  rows = added;
  checking = true;
  refresh();
  const taken: Frame[] = [];

  for (const row of added) {
    if (mine !== pickNumber) return;
    let bitmap: ImageBitmap;
    try {
      // `createImageBitmap` applies the picture's own orientation, as an
      // `<img>` would, so the size measured is the size the admin sees.
      bitmap = await createImageBitmap(row.file);
    } catch {
      refuse(row, "This file could not be read as a picture. Choose a JPEG, PNG or WebP.");
      continue;
    }
    try {
      if (mine !== pickNumber) return;
      const verdict = judgeInBatch(bitmap.width, bitmap.height, current, taken);
      if (verdict.kind === "refused") {
        refuse(row, verdict.reason);
        continue;
      }
      const { frame } = verdict;
      const scaled = scaleToFrame(bitmap, frame, current.maxBytes);
      taken.push(frame);
      const stem = row.file.name.replace(/\.[^.]+$/, "") || "picture";
      const soft = scaled.drawnWidth < frame.width;
      row.picked = { base64: scaled.base64, fileName: `${stem}.jpg`, frame, soft };
      row.label.value = stem;
      row.image.src = scaled.dataUrl;
      row.image.style.aspectRatio = `${frame.width} / ${frame.height}`;
      row.image.hidden = false;
      if (row.label.parentElement) row.label.parentElement.hidden = false;
      const saved = `${capitalised(frame.name)}, saved at ${frame.width} × ${frame.height}`;
      show(
        row,
        soft
          ? `${saved}. The picture is smaller than that, so it will look soft.`
          : `${saved}, as readers will see it.`,
      );
    } catch (error) {
      refuse(
        row,
        error instanceof PictureTooLarge
          ? "This picture is too detailed to send even at a lower quality. Choose a simpler or smaller one."
          : "This file could not be read as a picture. Choose a JPEG, PNG or WebP.",
      );
    } finally {
      bitmap.close();
    }
  }

  if (mine !== pickNumber) return;
  checking = false;
  if (ready().length === 0) {
    say(added.length === 1 ? "Nothing was uploaded." : "None of these can be uploaded.", "error");
    await tellTheModel(outcomesOf(added), { kind: "none" });
  }
  refresh();
}

/** Every row's outcome, in pick order. */
function outcomesOf(of: readonly Row[]): FileOutcome[] {
  return of.flatMap((row) => (row.outcome === null ? [] : [row.outcome]));
}

fileInput.addEventListener("change", () => {
  void pick(Array.from(fileInput.files ?? []));
});

// A file dropped anywhere on the view is taken, never opened by the frame in
// place of the view, so the drop is always claimed; it is only acted on while
// the view accepts files.
drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (opening !== null && !committing) drop.dataset.over = "true";
});
drop.addEventListener("dragleave", (event) => {
  if (event.relatedTarget instanceof Node && drop.contains(event.relatedTarget)) return;
  delete drop.dataset.over;
});
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  delete drop.dataset.over;
  void pick(Array.from(event.dataTransfer?.files ?? []));
});

/** Store one checked picture through its frame's upload tool: its own request. */
async function store(row: Row, picked: NonNullable<Row["picked"]>): Promise<FileOutcome> {
  const fileName = row.file.name;
  try {
    const stored = await app.callServerTool({
      name: UPLOAD_TOOL,
      arguments: {
        purpose: picked.frame.purpose,
        fileName: picked.fileName,
        label: row.label.value.trim() || undefined,
        jpegBase64: picked.base64,
      },
    });
    if (stored.isError) {
      return { kind: "failed", fileName, reason: textOf(stored) || "The picture could not be stored." };
    }
    const answered = storedSchema.safeParse(stored.structuredContent);
    if (!answered.success) return { kind: "failed", fileName, reason: "The picture could not be stored." };
    const { image } = answered.data;
    return {
      kind: "uploaded",
      fileName,
      catalogueId: image.catalogueId,
      label: image.label,
      shape: picked.frame.name,
      soft: picked.soft,
    };
  } catch (error) {
    // The host or the network failed this one call; the others go on.
    return {
      kind: "failed",
      fileName,
      reason: `The connection failed: ${error instanceof Error ? error.message : "no answer"}.`,
    };
  }
}

/** Place the stored pictures as the opening names: together when its tool takes a list, else one call each. */
async function placeAll(ids: readonly string[], place: NonNullable<Opening["place"]>): Promise<PlacementOutcome> {
  try {
    for (const args of placeCalls(ids, place)) {
      const set = await app.callServerTool({ name: place.tool, arguments: args });
      if (set.isError) return { kind: "refused", reason: textOf(set) || "The place tool refused." };
    }
    return { kind: "placed", outcome: place.outcome };
  } catch (error) {
    return {
      kind: "refused",
      reason: `The connection failed: ${error instanceof Error ? error.message : "no answer"}.`,
    };
  }
}

uploadButton.addEventListener("click", async () => {
  if (committing || checking || opening === null) return;
  const { place } = opening;
  const batch = rows;
  committing = true;
  refresh();
  say("Uploading…");

  // One at a time, in pick order: each picture is a request of its own.
  for (const row of batch) {
    const { picked } = row;
    if (picked === null || row.outcome !== null) continue;
    show(row, "Uploading…");
    const outcome = await store(row, picked);
    row.outcome = outcome;
    if (outcome.kind === "uploaded") show(row, `Uploaded as catalogue entry ${outcome.catalogueId}.`, "done");
    else show(row, `Could not be uploaded. ${outcome.reason}`, "error");
  }

  const outcomes = outcomesOf(batch);
  const ids = outcomes.flatMap((each) => (each.kind === "uploaded" ? [each.catalogueId] : []));
  let placement: PlacementOutcome = { kind: "none" };
  if (ids.length > 0 && place !== null) {
    say(ids.length === 1 ? "Placing the picture…" : "Placing the pictures…");
    placement = await placeAll(ids, place);
  }

  if (ids.length === 0) {
    // Nothing was stored, so nothing stands in the way of picking again.
    committing = false;
    say("Nothing was uploaded.", "error");
  } else if (placement.kind === "refused") {
    say(`The pictures are in the catalogue, but they could not be placed: ${placement.reason}`, "error");
  } else if (placement.kind === "placed") {
    say(place?.done ?? "");
  } else {
    say(ids.length === 1 ? "The picture is in the catalogue." : "The pictures are in the catalogue.");
  }
  await tellTheModel(outcomes, placement);
  refresh();
});

/**
 * Put the batch in the model's context, in one piece. A host that takes
 * context updates holds the last one for the next turn; one that only takes
 * messages gets it as one.
 */
async function tellTheModel(outcomes: readonly FileOutcome[], placement: PlacementOutcome): Promise<void> {
  const text = batchReport(outcomes, placement);
  const host = app.getHostCapabilities();
  try {
    if (host?.updateModelContext) {
      await app.updateModelContext({
        content: [{ type: "text", text }],
        structuredContent: { pictures: outcomes, placement },
      });
    } else if (host?.message) {
      await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
    }
  } catch {
    // The pictures are stored either way; the area's read tools show them.
  }
}

refresh();
void app.connect();
