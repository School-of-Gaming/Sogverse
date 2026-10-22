import { App } from "@modelcontextprotocol/ext-apps";
// The two token modules alone: the package's index also carries the icon set,
// and with it React, which a view drawn without React has no use for.
import { BRAND, NEUTRALS, statusHex } from "@sog/ui/tokens/brand";
import { FACES } from "@sog/ui/tokens/typography";
import { z } from "zod";
import "./style.css";

/*
 * The uploader, shown inside the admin's AI app by an opening tool. It has two
 * modes, chosen by the opening's `uploader.kind`:
 *
 * - **A picture** — `open_cover_uploader` for a Library cover,
 *   `open_landing_image_uploader` for a landing page picture. The admin picks a
 *   picture; it is cropped to the middle of the purpose's frame and drawn at
 *   exactly the purpose's size as a JPEG, the size Sogverse's catalogue refuses
 *   anything else than. The JPEG goes to the app-only upload tool the opening
 *   names and, when the opening names a placement, the entry it answers goes to
 *   that tool.
 * - **A PDF** — `open_guide_uploader` for a guide's file. The admin's file is
 *   sent as it is, after checking it is a PDF and fits the call: no crop, no
 *   re-encoding, so a file over the limit is refused here with the remedy.
 *
 * Every call goes through the host: the view holds no token and opens no
 * connection of its own. The model is then told what was stored. Everything
 * that differs by purpose (sizes, limits, the tools, the words) arrives in the
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

const pictureOpening = z.object({
  kind: z.literal("picture"),
  purpose: z.string(),
  heading: z.string(),
  subject: z.string(),
  frame: z.object({ width: z.number(), height: z.number(), maxBytes: z.number() }),
  uploadTool: z.string(),
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
  uploadTool: z.string(),
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

/** What a picture's upload tool answers, as far as this view reads it. */
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

let opening: Opening | null = null;
/** The file to send, base64, and the name it is uploaded under. */
let picked: { base64: string; fileName: string } | null = null;
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

/**
 * Draw the middle of the picture, at the frame's ratio, onto a canvas of
 * exactly the frame's size, and encode it. `createImageBitmap` applies the
 * picture's own orientation, as an `<img>` would. A JPEG over the call's limit
 * is encoded again at a lower quality before giving up.
 */
async function cropToFrame(
  file: File,
  { width, height, maxBytes }: PictureOpening["frame"],
): Promise<{ dataUrl: string; base64: string; croppedWidth: number }> {
  const bitmap = await createImageBitmap(file);
  const frame = width / height;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (sw / sh > frame) sw = Math.round(sh * frame);
  else sh = Math.round(sw / frame);
  const sx = Math.round((bitmap.width - sw) / 2);
  const sy = Math.round((bitmap.height - sh) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("No 2D canvas context");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  bitmap.close();

  for (const quality of [0.9, 0.8, 0.7]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if ((base64.length * 3) / 4 <= maxBytes) {
      return { dataUrl, base64, croppedWidth: sw };
    }
  }
  throw new Error("too large");
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

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  picked = null;
  preview.hidden = true;
  fileNote.hidden = true;
  say("");
  refresh();
  if (!file || opening === null) return;
  if (opening.kind === "pdf") {
    try {
      picked = { base64: await readPdf(file, opening), fileName: file.name };
      fileNote.textContent = `${file.name}, ${megabytes(file.size)}.`;
      fileNote.hidden = false;
    } catch (error) {
      say(error instanceof Error ? error.message : "That file could not be read.", "error");
    }
    refresh();
    return;
  }
  try {
    const cropped = await cropToFrame(file, opening.frame);
    const stem = file.name.replace(/\.[^.]+$/, "") || "picture";
    picked = { base64: cropped.base64, fileName: `${stem}.jpg` };
    if (!labelInput.value.trim()) labelInput.value = stem;
    previewImage.src = cropped.dataUrl;
    const { width, height } = opening.frame;
    previewNote.textContent =
      cropped.croppedWidth < width
        ? `The middle of the picture at ${width} × ${height}. It is smaller than that, so it will look soft.`
        : `The middle of the picture at ${width} × ${height}, as readers will see it.`;
    preview.hidden = false;
  } catch {
    say("That file could not be read as a picture. Choose a JPEG, PNG or WebP.", "error");
  }
  refresh();
});

/** Store the picked picture, place it if the opening says where, and tell the model. */
async function uploadPicture(
  { uploadTool, place }: PictureOpening,
  file: { base64: string; fileName: string },
): Promise<void> {
  const stored = await app.callServerTool({
    name: uploadTool,
    arguments: {
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
  file: { base64: string; fileName: string },
): Promise<void> {
  const stored = await app.callServerTool({
    name: pdf.uploadTool,
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
    if (opening.kind === "picture") await uploadPicture(opening, picked);
    else await uploadPdf(opening, picked);
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
