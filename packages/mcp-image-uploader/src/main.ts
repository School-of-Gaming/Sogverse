import { App } from "@modelcontextprotocol/ext-apps";
// The two token modules alone: the package's index also carries the icon set,
// and with it React, which a view drawn without React has no use for.
import { BRAND, NEUTRALS, statusHex } from "@sog/ui/tokens/brand";
import { FACES } from "@sog/ui/tokens/typography";
import { z } from "zod";
import { judgePicture, sourceRect, type Frame } from "./frames";
import "./style.css";

/*
 * The picture uploader, shown inside the admin's AI app by an opening tool —
 * `open_cover_uploader` for a Library cover, `open_landing_image_uploader`
 * for a landing page picture. The admin picks a picture and the view measures
 * it. **It never crops**: a picture already the shape of one of the frames the
 * opening offers, within 1%, is scaled to that frame's exact size as a JPEG —
 * the size Sogverse's catalogue refuses anything else than — and a picture of
 * no offered shape, or of one this destination does not take, is refused:
 * nothing uploads, the view says why, and so is the model, which can explain
 * it to the admin. A fitting JPEG goes to its frame's app-only upload tool
 * and, when the opening names a placement, the entry it answers goes to that
 * tool — both through the host: the view holds no token and opens no
 * connection of its own — and the model is then told the new entry's id.
 *
 * Everything that differs by purpose (the frames, their sizes and tools, which
 * this destination takes and why, the largest JPEG a call can carry, the
 * words) arrives in the opening tool's `uploader` field, so the server is the
 * one definition and this view restates none of it.
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
          uploadTool: z.string(),
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

const heading = element("heading", HTMLHeadingElement);
const subject = element("subject", HTMLParagraphElement);
const fileInput = element("file", HTMLInputElement);
const labelInput = element("label", HTMLInputElement);
const preview = element("preview", HTMLElement);
const previewImage = element("preview-image", HTMLImageElement);
const previewNote = element("preview-note", HTMLElement);
const uploadButton = element("upload", HTMLButtonElement);
const status = element("status", HTMLParagraphElement);

let opening: Opening | null = null;
/** The scaled JPEG, base64, the name it is uploaded under, and the frame it fits. */
let picked: { base64: string; fileName: string; frame: Frame } | null = null;
/**
 * Set before the first call and cleared only where the admin has to retry,
 * so the button cannot re-enable between the click and the picture being placed.
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

const app = new App({ name: "Sogverse picture uploader", version: "2.0.0" }, {});

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
  refresh();
};

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  picked = null;
  preview.hidden = true;
  say("");
  refresh();
  if (!file || opening === null) return;
  const current = opening;
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
    const scaled = scaleToFrame(bitmap, frame, current.maxBytes);
    bitmap.close();
    const stem = file.name.replace(/\.[^.]+$/, "") || "picture";
    picked = { base64: scaled.base64, fileName: `${stem}.jpg`, frame };
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
  } finally {
    refresh();
  }
});

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

uploadButton.addEventListener("click", async () => {
  if (committing || opening === null || picked === null) return;
  const { place } = opening;
  const { uploadTool } = picked.frame;
  committing = true;
  refresh();
  say("Uploading…");
  try {
    const stored = await app.callServerTool({
      name: uploadTool,
      arguments: {
        fileName: picked.fileName,
        label: labelInput.value.trim() || undefined,
        jpegBase64: picked.base64,
      },
    });
    if (stored.isError) throw new Error(textOf(stored) || "The picture could not be stored.");
    const answered = storedSchema.safeParse(stored.structuredContent);
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
  } catch (error) {
    committing = false;
    say(error instanceof Error ? error.message : "The picture could not be uploaded.", "error");
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
    // The picture is stored either way; the area's read tools show it.
  }
}

refresh();
void app.connect();
