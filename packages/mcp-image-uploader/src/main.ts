import { App } from "@modelcontextprotocol/ext-apps";
// The two token modules alone: the package's index also carries the icon set,
// and with it React, which a view drawn without React has no use for.
import { BRAND, NEUTRALS, statusHex } from "@sog/ui/tokens/brand";
import { FACES } from "@sog/ui/tokens/typography";
import { z } from "zod";
import { judgePicture, sourceRect, type Frame } from "./frames";
import "./style.css";

/*
 * The uploader, shown inside the admin's AI app by an opening tool. It has two
 * modes, chosen by the opening's `uploader.kind`:
 *
 * - **A picture** — `open_cover_uploader` for a Library cover,
 *   `open_landing_image_uploader` for a landing page picture. The admin picks
 *   a picture and the view measures it. **It never crops**: a picture already
 *   the shape of one of the frames the opening offers, within 1%, is scaled to
 *   that frame's exact size as a JPEG — the size Sogverse's catalogue refuses
 *   anything else than — and a picture of no offered shape, or of one this
 *   destination does not take, is refused: nothing uploads, the view says
 *   why, and so is the model, which can explain it to the admin. A fitting
 *   JPEG goes, with its frame's purpose, to the one app-only picture upload
 *   tool and, when the opening names a placement, the entry it answers goes
 *   to that tool.
 * - **A PDF** — `open_guide_uploader` for a guide's file. The admin's file is
 *   sent as it is to the guide upload tool, after checking it is a PDF and
 *   fits the call: no crop, no re-encoding, so a file over the limit is
 *   refused here with the remedy.
 *
 * Every call goes through the host: the view holds no token and opens no
 * connection of its own. The model is then told what was stored. Everything
 * that differs by purpose (the frames, their sizes, which this destination
 * takes and why, the limits, the words) arrives in the opening tool's
 * `uploader` field, so the server is the one definition and this view
 * restates none of it.
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
  maxBytes: z.number(),
  place: z
    .object({
      tool: z.string(),
      arguments: z.record(z.string(), z.unknown()),
      imageArgument: z.string(),
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

const heading = element("heading", HTMLHeadingElement);
const subject = element("subject", HTMLParagraphElement);
const fileCaption = element("file-caption", HTMLSpanElement);
const fileInput = element("file", HTMLInputElement);
const fileNote = element("file-note", HTMLParagraphElement);
const labelField = element("label-field", HTMLLabelElement);
const labelInput = element("label", HTMLInputElement);
const preview = element("preview", HTMLElement);
const previewImage = element("preview-image", HTMLImageElement);
const previewNote = element("preview-note", HTMLElement);
const uploadButton = element("upload", HTMLButtonElement);
const status = element("status", HTMLParagraphElement);

/** The file to send, base64, the name it is uploaded under and, for a picture, the frame it fits. */
type Picked =
  | { kind: "picture"; base64: string; fileName: string; frame: Frame }
  | { kind: "pdf"; base64: string; fileName: string };

let opening: Opening | null = null;
let picked: Picked | null = null;
/**
 * Set before the first call and cleared only where the admin has to retry,
 * so the button cannot re-enable between the click and the upload finishing.
 */
let committing = false;

function say(text: string, tone: "info" | "error" = "info"): void {
  status.textContent = text;
  status.dataset.tone = tone;
}

function refresh(): void {
  const ready = opening !== null;
  fileInput.disabled = !ready || committing;
  labelInput.disabled = !ready || committing;
  uploadButton.disabled = !ready || committing || picked === null;
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
  if (opening.kind === "picture") {
    fileCaption.textContent = "Picture";
    fileInput.accept = "image/*";
    labelField.hidden = false;
    uploadButton.textContent = opening.place?.actionLabel ?? "Upload";
  } else {
    fileCaption.textContent = "PDF";
    fileInput.accept = "application/pdf,.pdf";
    uploadButton.textContent = opening.actionLabel;
  }
  refresh();
};

/** Measure a picked picture, and scale it to the frame it fits or say why it does not fit. */
async function pickPicture(file: File, current: PictureOpening): Promise<void> {
  try {
    // `createImageBitmap` applies the picture's own orientation, as an
    // `<img>` would, so the size measured is the size the admin sees.
    const bitmap = await createImageBitmap(file);
    const verdict = judgePicture(bitmap.width, bitmap.height, current);
    if (verdict.kind === "refused") {
      bitmap.close();
      say(`${verdict.reason} Nothing was uploaded.`, "error");
      await tellTheModel(
        `The admin picked a picture in the uploader and it was refused, so nothing was uploaded. ${verdict.reason}`,
      );
      return;
    }
    const { frame } = verdict;
    let scaled: ReturnType<typeof scaleToFrame>;
    try {
      scaled = scaleToFrame(bitmap, frame, current.maxBytes);
    } finally {
      // Closed even when the picture is too large to encode.
      bitmap.close();
    }
    const stem = file.name.replace(/\.[^.]+$/, "") || "picture";
    picked = { kind: "picture", base64: scaled.base64, fileName: `${stem}.jpg`, frame };
    if (!labelInput.value.trim()) labelInput.value = stem;
    previewImage.src = scaled.dataUrl;
    const saved = `${capitalised(frame.name)}, saved at ${frame.width} × ${frame.height}`;
    previewNote.textContent =
      scaled.drawnWidth < frame.width
        ? `${saved}. The picture is smaller than that, so it will look soft.`
        : `${saved}, as readers will see it.`;
    preview.hidden = false;
  } catch (error) {
    say(
      error instanceof PictureTooLarge
        ? "That picture is too detailed to send even at a lower quality. Choose a simpler or smaller one."
        : "That file could not be read as a picture. Choose a JPEG, PNG or WebP.",
      "error",
    );
  }
}

/** Check a picked PDF and hold it as it is, or say why it cannot be sent. */
async function pickPdf(file: File, current: PdfOpening): Promise<void> {
  try {
    picked = { kind: "pdf", base64: await readPdf(file, current), fileName: file.name };
    fileNote.textContent = `${file.name}, ${megabytes(file.size)}.`;
    fileNote.hidden = false;
  } catch (error) {
    say(error instanceof Error ? error.message : "That file could not be read.", "error");
  }
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  picked = null;
  preview.hidden = true;
  fileNote.hidden = true;
  say("");
  refresh();
  if (!file || opening === null) return;
  try {
    if (opening.kind === "picture") await pickPicture(file, opening);
    else await pickPdf(file, opening);
  } finally {
    refresh();
  }
});

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Store the picked picture as its frame's purpose, place it if the opening says where, and tell the model. */
async function uploadPicture(
  { place }: PictureOpening,
  file: Extract<Picked, { kind: "picture" }>,
): Promise<void> {
  const stored = await app.callServerTool({
    name: PICTURE_UPLOAD_TOOL,
    arguments: {
      purpose: file.frame.purpose,
      fileName: file.fileName,
      label: labelInput.value.trim() || undefined,
      jpegBase64: file.base64,
    },
  });
  if (stored.isError) throw new Error(textOf(stored) || "The picture could not be stored.");
  const answered = storedPictureSchema.safeParse(stored.structuredContent);
  if (!answered.success) throw new Error("The picture could not be stored.");
  const { image } = answered.data;
  const entry = `catalogue entry ${image.catalogueId} ("${image.label}")`;

  if (place === null) {
    say("The picture is in the catalogue.");
    await tellTheModel(
      `The admin uploaded a picture in the uploader: it is ${entry}, and it is not placed anywhere yet.`,
    );
    return;
  }

  say("Placing the picture…");
  const set = await app.callServerTool({
    name: place.tool,
    arguments: { ...place.arguments, [place.imageArgument]: image.catalogueId },
  });
  if (set.isError) {
    throw new Error(
      `The picture is in the catalogue as entry ${image.catalogueId}, but it could not be placed: ${textOf(set)}`,
    );
  }

  say(place.done);
  await tellTheModel(`The admin uploaded a picture in the uploader: ${entry}. ${place.outcome}`);
}

/** Store the picked PDF as the opening's guide file, and tell the model. */
async function uploadPdf(
  pdf: PdfOpening,
  file: Extract<Picked, { kind: "pdf" }>,
): Promise<void> {
  const stored = await app.callServerTool({
    name: PDF_UPLOAD_TOOL,
    arguments: { ...pdf.arguments, fileName: file.fileName, pdfBase64: file.base64 },
  });
  if (stored.isError) throw new Error(textOf(stored) || "The file could not be stored.");
  const answered = storedPdfSchema.safeParse(stored.structuredContent);
  if (!answered.success) throw new Error("The file could not be stored.");
  const { guideId, created, fileName } = answered.data;

  say(pdf.done);
  await tellTheModel(
    `The admin uploaded ${fileName} in the uploader as the ${pdf.language} file of ${created ? "a new guide" : "guide"} ${guideId}. ${pdf.outcome}`,
  );
}

uploadButton.addEventListener("click", async () => {
  if (committing || opening === null || picked === null) return;
  committing = true;
  refresh();
  say("Uploading…");
  try {
    if (opening.kind === "picture" && picked.kind === "picture") {
      await uploadPicture(opening, picked);
    } else if (opening.kind === "pdf" && picked.kind === "pdf") {
      await uploadPdf(opening, picked);
    } else {
      // The opening changed after the file was picked.
      throw new Error("Choose the file again.");
    }
  } catch (error) {
    committing = false;
    say(error instanceof Error ? error.message : "The file could not be uploaded.", "error");
    refresh();
  }
});

/**
 * Put the outcome in the model's context. A host that takes context updates
 * holds it for the next turn; one that only takes messages gets it as one.
 */
async function tellTheModel(text: string): Promise<void> {
  const host = app.getHostCapabilities();
  try {
    if (host?.updateModelContext) {
      await app.updateModelContext({ content: [{ type: "text", text }] });
    } else if (host?.message) {
      await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
    }
  } catch {
    // The upload is stored either way; the area's read tools show it.
  }
}

refresh();
void app.connect();
