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
 * The uploader, shown inside the admin's AI app by an opening tool. It has two
 * modes, chosen by the opening's `uploader.kind`:
 *
 * - **Pictures** — `open_cover_uploader` for a Library cover,
 *   `open_landing_image_uploader` for landing page pictures. The admin picks
 *   pictures — several at once, where the destination takes more than one,
 *   from the file picker or by dropping them on the view — and the view
 *   measures each. **It never crops**: a picture already the shape of one of
 *   the frames the opening offers, within 1%, is scaled to that frame's exact
 *   size as a JPEG — the size Sogverse's catalogue refuses anything else than
 *   — and a picture of no offered shape, of one this destination does not
 *   take, of another shape than the batch's first where the destination needs
 *   one shape, or past the room the destination has, is refused: it is not
 *   uploaded, and the view says why. One refused picture never holds back the
 *   others. Each fitting JPEG goes, with its frame's purpose, to the one
 *   app-only picture upload tool in a call of its own — never two pictures in
 *   one request, which has a size limit — and, when the opening names a
 *   placement, the entries the uploads answer go to that tool together. The
 *   model is then told the whole batch at once: each file's new entry or why
 *   it was refused, and where the pictures went.
 * - **A PDF** — `open_guide_uploader` for a guide's file. The admin's one file,
 *   from the file picker or dropped on the view (the first, when several are
 *   dropped), is sent as it is to the guide upload tool, after checking it is
 *   a PDF and fits the call: no crop, no re-encoding, so a file over the limit
 *   is refused here with the remedy. The model is then told what was stored.
 *
 * Every call goes through the host: the view holds no token and opens no
 * connection of its own. A new opening starts from nothing picked. Everything
 * that differs by purpose (the frames, their sizes, which this destination
 * takes and why, how many it takes, the limits, the words) arrives in the
 * opening tool's `uploader` field, so the server is the one definition and
 * this view restates none of it.
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
const PICTURE_UPLOAD_TOOL = "upload_catalogue_picture";

/** The app-only tool a guide's PDF is stored through. */
const PDF_UPLOAD_TOOL = "upload_guide";

const pictureOpening = z.object({
  kind: z.literal("picture"),
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
});
type PictureOpening = z.infer<typeof pictureOpening>;

const pdfOpening = z.object({
  kind: z.literal("pdf"),
  heading: z.string(),
  subject: z.string(),
  maxBytes: z.number(),
  /** What follows the file's own size when it is over `maxBytes`. */
  tooLarge: z.string(),
  /** The upload tool's arguments besides the file. */
  arguments: z.record(z.string(), z.unknown()),
  language: z.string(),
  actionLabel: z.string(),
  done: z.string(),
  outcome: z.string(),
});
type PdfOpening = z.infer<typeof pdfOpening>;

/** The opening tool's `uploader` field. */
const openingSchema = z.object({
  uploader: z.discriminatedUnion("kind", [pictureOpening, pdfOpening]),
});
type Opening = z.infer<typeof openingSchema>["uploader"];

/** What the picture upload tool answers, as far as this view reads it. */
const storedPictureSchema = z.object({
  image: z.object({ catalogueId: z.string(), label: z.string() }),
});

/** What the guide upload tool answers, as far as this view reads it. */
const storedPdfSchema = z.object({
  guideId: z.string(),
  created: z.boolean(),
  fileName: z.string(),
});

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`#${id} is missing`);
  return found;
}

const drop = element("drop", HTMLElement);
const heading = element("heading", HTMLHeadingElement);
const subject = element("subject", HTMLParagraphElement);
const fileCaption = element("file-caption", HTMLSpanElement);
const fileHint = element("file-hint", HTMLSpanElement);
const fileInput = element("file", HTMLInputElement);
const fileNote = element("file-note", HTMLParagraphElement);
const list = element("files", HTMLOListElement);
const uploadButton = element("upload", HTMLButtonElement);
const status = element("status", HTMLParagraphElement);

/** One picked picture, its row on screen, and what the checks made of it. */
interface Row {
  file: File;
  image: HTMLImageElement;
  state: HTMLParagraphElement;
  label: HTMLInputElement;
  /** The scaled JPEG, base64, the name it is uploaded under, and the frame it fits; null until checked, or when refused. */
  picked: { base64: string; fileName: string; frame: Frame; soft: boolean } | null;
  outcome: FileOutcome | null;
}

/** The picked PDF, base64, and the name it is uploaded under. */
interface PickedPdf {
  base64: string;
  fileName: string;
}

let opening: Opening | null = null;
/** Counts openings, so an upload begun under an earlier one leaves the new one's screen alone. */
let openingNumber = 0;
/** The pictures picked, in picture mode. */
let rows: Row[] = [];
/** The file picked, in PDF mode. */
let pdf: PickedPdf | null = null;
/** True while a pick of pictures is being checked. */
let checking = false;
/**
 * Counts picks, of pictures or of a PDF, so a newer pick (or a new opening)
 * stops an older one still being checked or read.
 */
let pickNumber = 0;
/**
 * Set before the first call and cleared only where the admin may try again —
 * a batch of pictures that stored nothing, or a PDF that failed — so the
 * button cannot re-enable between the click and the upload finishing.
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
  for (const row of rows) row.label.disabled = !open || row.picked === null || row.outcome !== null;
  const nothingToSend =
    opening?.kind === "pdf" ? pdf === null : checking || ready().length === 0;
  uploadButton.disabled = !open || nothingToSend;
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

/** A size as the server words it. */
function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

/** The bytes as base64, a slice at a time: one spread of a whole file overflows the stack. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

/** A file starts with this when it is a PDF at all. */
const PDF_MAGIC = "%PDF-";

/** Read a PDF as it is, or say why it cannot be sent. */
async function readPdf(file: File, { maxBytes, tooLarge }: PdfOpening): Promise<string> {
  if (file.size === 0) throw new Error("The file is empty.");
  // Before reading it: a file over the limit costs nothing to refuse.
  if (file.size > maxBytes) throw new Error(`This PDF is ${megabytes(file.size)}. ${tooLarge}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.subarray(0, PDF_MAGIC.length)) !== PDF_MAGIC) {
    throw new Error("That file is not a PDF. A guide is a PDF file.");
  }
  return toBase64(bytes);
}

const app = new App({ name: "Sogverse uploader", version: "3.0.0" }, {});

app.ontoolresult = (result) => {
  if (result.isError) {
    say(textOf(result) || "The uploader could not open.", "error");
    return;
  }
  const parsed = openingSchema.safeParse(result.structuredContent);
  opening = parsed.success ? parsed.data.uploader : null;
  if (opening === null) {
    say("The uploader could not read what the upload is for.", "error");
    return;
  }
  heading.textContent = opening.heading;
  document.title = opening.heading;
  subject.textContent = opening.subject;
  // What was picked under an earlier opening belongs to that opening's frames,
  // room and placement, so a new opening starts from nothing picked — and
  // with a batch of its own to make.
  openingNumber += 1;
  pickNumber += 1;
  rows = [];
  list.replaceChildren();
  list.hidden = true;
  checking = false;
  pdf = null;
  fileNote.hidden = true;
  committing = false;
  fileInput.value = "";
  say("");
  if (opening.kind === "picture") {
    const several = opening.room === null || opening.room.pictures > 1;
    fileInput.accept = "image/*";
    fileInput.multiple = several;
    fileCaption.textContent = several ? "Pictures" : "Picture";
    fileHint.textContent = several
      ? opening.room === null
        ? "Pick as many as you like, or drop them here."
        : `Pick up to ${opening.room.pictures}, or drop them here.`
      : "Pick one, or drop it here.";
    fileHint.hidden = false;
    uploadButton.textContent = opening.place?.actionLabel ?? "Upload";
  } else {
    fileInput.accept = "application/pdf,.pdf";
    fileInput.multiple = false;
    fileCaption.textContent = "PDF";
    fileHint.hidden = true;
    uploadButton.textContent = opening.actionLabel;
  }
  refresh();
};

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A row on screen for a picked picture, waiting to be checked. */
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

/** Refuse a picked picture before anything is uploaded. */
function refuse(row: Row, reason: string): void {
  row.outcome = { kind: "refused", fileName: row.file.name, reason };
  show(row, `Refused, not uploaded. ${reason}`, "error");
}

/**
 * Check every picked picture in the order picked: measure it, judge it
 * against the frames and against what the batch has already taken, and scale
 * the ones that fit. A newer pick, or a new opening, replaces this one.
 */
async function pickPictures(files: readonly File[], current: PictureOpening): Promise<void> {
  if (committing || files.length === 0) return;
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
    await reportBatch(outcomesOf(added), { kind: "none" });
  }
  refresh();
}

/** Every row's outcome, in pick order. */
function outcomesOf(of: readonly Row[]): FileOutcome[] {
  return of.flatMap((row) => (row.outcome === null ? [] : [row.outcome]));
}

/**
 * Check a picked PDF and hold it as it is, or say why it cannot be sent —
 * from the picker or a drop alike, and with no file only clearing the last.
 * A newer pick, or a new opening, while the file is read drops its result.
 */
async function pickPdf(file: File | undefined, current: PdfOpening): Promise<void> {
  if (committing) return;
  const mine = ++pickNumber;
  pdf = null;
  fileNote.hidden = true;
  say("");
  refresh();
  if (!file) return;
  try {
    const base64 = await readPdf(file, current);
    if (mine !== pickNumber) return;
    pdf = { base64, fileName: file.name };
    fileNote.textContent = `${file.name}, ${megabytes(file.size)}.`;
    fileNote.hidden = false;
  } catch (error) {
    if (mine !== pickNumber) return;
    say(error instanceof Error ? error.message : "That file could not be read.", "error");
  }
  refresh();
}

fileInput.addEventListener("change", async () => {
  if (opening === null) return;
  if (opening.kind === "picture") {
    const files = Array.from(fileInput.files ?? []);
    // Cleared, so picking the same files again (a retry after every upload
    // failed, or a picture re-cropped under its old name) fires a change too.
    fileInput.value = "";
    await pickPictures(files, opening);
    return;
  }
  await pickPdf(fileInput.files?.[0], opening);
});

/** Whether a drop is taken now: while there is an opening and nothing is being committed. */
function takesDrops(): boolean {
  return opening !== null && !committing;
}

// A file dragged over the frame is claimed everywhere, so a drop that misses
// the view is never opened by the frame in place of it; only the view itself
// takes one, and only while it takes files.
document.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer && !(event.target instanceof Node && drop.contains(event.target))) {
    event.dataTransfer.dropEffect = "none";
  }
});
document.addEventListener("drop", (event) => event.preventDefault());

drop.addEventListener("dragover", (event) => {
  if (takesDrops()) {
    drop.dataset.over = "true";
  } else {
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    delete drop.dataset.over;
  }
});
drop.addEventListener("dragleave", (event) => {
  if (event.relatedTarget instanceof Node && drop.contains(event.relatedTarget)) return;
  delete drop.dataset.over;
});
// Pictures take every file dropped; a PDF opening takes the first, as its
// picker would. Either way the drop goes the path a pick does.
drop.addEventListener("drop", (event) => {
  delete drop.dataset.over;
  if (opening === null || !takesDrops()) return;
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length === 0) return;
  // Cleared, so the picker no longer shows a file the drop replaced.
  fileInput.value = "";
  if (opening.kind === "picture") void pickPictures(files, opening);
  else void pickPdf(files[0], opening);
});

/** Store one checked picture through the upload tool, with its frame's purpose: a request of its own. */
async function storePicture(row: Row, picked: NonNullable<Row["picked"]>): Promise<FileOutcome> {
  const fileName = row.file.name;
  try {
    const stored = await app.callServerTool({
      name: PICTURE_UPLOAD_TOOL,
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
    const answered = storedPictureSchema.safeParse(stored.structuredContent);
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
async function placeAll(
  ids: readonly string[],
  place: NonNullable<PictureOpening["place"]>,
): Promise<PlacementOutcome> {
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

/** Store every ready picture, one call each, place the stored ones, and tell the model the whole batch. */
async function uploadPictures({ place }: PictureOpening, mine: number): Promise<void> {
  const batch = rows;
  say("Uploading…");

  // One at a time, in pick order: each picture is a request of its own.
  for (const row of batch) {
    const { picked } = row;
    if (picked === null || row.outcome !== null) continue;
    show(row, "Uploading…");
    const outcome = await storePicture(row, picked);
    row.outcome = outcome;
    if (outcome.kind === "uploaded") show(row, `Uploaded as catalogue entry ${outcome.catalogueId}.`, "done");
    else show(row, `Could not be uploaded. ${outcome.reason}`, "error");
  }

  const outcomes = outcomesOf(batch);
  const ids = outcomes.flatMap((each) => (each.kind === "uploaded" ? [each.catalogueId] : []));
  const current = mine === openingNumber;
  let placement: PlacementOutcome = { kind: "none" };
  if (ids.length > 0 && place !== null) {
    if (current) say(ids.length === 1 ? "Placing the picture…" : "Placing the pictures…");
    placement = await placeAll(ids, place);
  }

  // A new opening took the screen while this batch ran: the model still
  // hears what was stored, but the new opening's screen is left alone.
  if (mine === openingNumber) {
    if (ids.length === 0) {
      // Nothing was stored, so nothing stands in the way of picking again.
      committing = false;
      say("Nothing was uploaded.", "error");
    } else if (placement.kind === "refused") {
      say(
        ids.length === 1
          ? `The picture is in the catalogue, but it could not be placed: ${placement.reason}`
          : `The pictures are in the catalogue, but they could not be placed: ${placement.reason}`,
        "error",
      );
    } else if (placement.kind === "placed") {
      say(place?.done ?? "");
    } else {
      say(ids.length === 1 ? "The picture is in the catalogue." : "The pictures are in the catalogue.");
    }
  }
  await reportBatch(outcomes, placement);
}

/**
 * Store the picked PDF as the opening's guide file, and tell the model. The
 * model hears it even when a new opening took the screen meanwhile; that
 * opening's screen is left alone.
 */
async function uploadPdf(current: PdfOpening, file: PickedPdf, mine: number): Promise<void> {
  say("Uploading…");
  const stored = await app.callServerTool({
    name: PDF_UPLOAD_TOOL,
    arguments: { ...current.arguments, fileName: file.fileName, pdfBase64: file.base64 },
  });
  if (stored.isError) throw new Error(textOf(stored) || "The file could not be stored.");
  const answered = storedPdfSchema.safeParse(stored.structuredContent);
  if (!answered.success) throw new Error("The file could not be stored.");
  const { guideId, created, fileName } = answered.data;

  if (mine === openingNumber) say(current.done);
  await tellTheModel(
    `The admin uploaded ${fileName} in the uploader as the ${current.language} file of ${created ? "a new guide" : "guide"} ${guideId}. ${current.outcome}`,
  );
}

uploadButton.addEventListener("click", async () => {
  if (committing || checking || opening === null) return;
  const current = opening;
  const mine = openingNumber;
  committing = true;
  refresh();
  if (current.kind === "picture") {
    await uploadPictures(current, mine);
  } else if (pdf !== null) {
    try {
      await uploadPdf(current, pdf, mine);
    } catch (error) {
      if (mine === openingNumber) {
        committing = false;
        say(error instanceof Error ? error.message : "The file could not be uploaded.", "error");
      }
    }
  }
  if (mine === openingNumber) refresh();
});

/** Put a batch of pictures in the model's context, in one piece: the report and its structured form. */
async function reportBatch(outcomes: readonly FileOutcome[], placement: PlacementOutcome): Promise<void> {
  await tellTheModel(batchReport(outcomes, placement), { pictures: outcomes, placement });
}

/**
 * Put the outcome in the model's context. A host that takes context updates
 * holds the last one for the next turn; one that only takes messages gets it
 * as one.
 */
async function tellTheModel(text: string, structuredContent?: Record<string, unknown>): Promise<void> {
  const host = app.getHostCapabilities();
  try {
    if (host?.updateModelContext) {
      await app.updateModelContext({ content: [{ type: "text", text }], structuredContent });
    } else if (host?.message) {
      await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
    }
  } catch {
    // The upload is stored either way; the area's read tools show it.
  }
}

refresh();
void app.connect();
