import { App } from "@modelcontextprotocol/ext-apps";
// The two token modules alone: the package's index also carries the icon set,
// and with it React, which a view drawn without React has no use for.
import { BRAND, NEUTRALS, statusHex } from "@sog/ui/tokens/brand";
import { FACES } from "@sog/ui/tokens/typography";
import { z } from "zod";
import "./style.css";

/*
 * The Library cover uploader, shown by `open_cover_uploader` inside the
 * admin's AI app. The admin picks a picture; it is cropped to the middle of
 * the cover's frame and drawn at exactly the cover's size as a JPEG, the size
 * Sogverse's catalogue refuses anything else than. The JPEG goes to the
 * app-only `upload_library_cover` and the entry it answers to
 * `set_library_article_cover`, both through the host — the view holds no
 * token and opens no connection of its own — and the model is then told the
 * new entry's id.
 *
 * What the cover is (its size, the largest JPEG a call can carry, the
 * article) arrives in the opening tool's result, so the server's catalogue
 * rule is the one definition and this view restates none of it.
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

/** What `open_cover_uploader` answers, as far as this view reads it. */
const openingSchema = z.object({
  articleId: z.string(),
  title: z.string(),
  cover: z.object({ width: z.number(), height: z.number(), maxBytes: z.number() }),
});
type Opening = z.infer<typeof openingSchema>;

/** What `upload_library_cover` answers, as far as this view reads it. */
const storedSchema = z.object({
  cover: z.object({ catalogueId: z.string(), label: z.string() }),
});

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`#${id} is missing`);
  return found;
}

const articleLine = element("article", HTMLParagraphElement);
const fileInput = element("file", HTMLInputElement);
const labelInput = element("label", HTMLInputElement);
const preview = element("preview", HTMLElement);
const previewImage = element("preview-image", HTMLImageElement);
const previewNote = element("preview-note", HTMLElement);
const uploadButton = element("upload", HTMLButtonElement);
const status = element("status", HTMLParagraphElement);

let opening: Opening | null = null;
/** The cropped JPEG, base64, and the name it is uploaded under. */
let picked: { base64: string; fileName: string } | null = null;
/**
 * Set before the first call and cleared only where the admin has to retry,
 * so the button cannot re-enable between the click and the cover being set.
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
async function cropToCover(
  file: File,
  { width, height, maxBytes }: Opening["cover"],
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

const app = new App({ name: "Sogverse Library cover uploader", version: "1.0.0" }, {});

app.ontoolresult = (result) => {
  if (result.isError) {
    say(textOf(result) || "The uploader could not open for this article.", "error");
    return;
  }
  const parsed = openingSchema.safeParse(result.structuredContent);
  opening = parsed.success ? parsed.data : null;
  if (opening === null) {
    say("The uploader could not read which article this is for.", "error");
    return;
  }
  articleLine.textContent = opening.title ? `For “${opening.title}”` : "For this article";
  refresh();
};

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  picked = null;
  preview.hidden = true;
  say("");
  refresh();
  if (!file || opening === null) return;
  try {
    const cropped = await cropToCover(file, opening.cover);
    const stem = file.name.replace(/\.[^.]+$/, "") || "cover";
    picked = { base64: cropped.base64, fileName: `${stem}.jpg` };
    if (!labelInput.value.trim()) labelInput.value = stem;
    previewImage.src = cropped.dataUrl;
    const { width, height } = opening.cover;
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

uploadButton.addEventListener("click", async () => {
  if (committing || opening === null || picked === null) return;
  committing = true;
  refresh();
  say("Uploading…");
  try {
    const stored = await app.callServerTool({
      name: "upload_library_cover",
      arguments: {
        fileName: picked.fileName,
        label: labelInput.value.trim() || undefined,
        jpegBase64: picked.base64,
      },
    });
    if (stored.isError) throw new Error(textOf(stored) || "The picture could not be stored.");
    const answered = storedSchema.safeParse(stored.structuredContent);
    if (!answered.success) throw new Error("The picture could not be stored.");
    const { cover } = answered.data;

    say("Setting the cover…");
    const set = await app.callServerTool({
      name: "set_library_article_cover",
      arguments: { articleId: opening.articleId, coverImageId: cover.catalogueId },
    });
    if (set.isError) {
      throw new Error(
        `The picture is in the catalogue as entry ${cover.catalogueId}, but it could not be set as the cover: ${textOf(set)}`,
      );
    }

    say("The cover is set. Readers see it after the next publish.");
    await tellTheModel(
      `The admin uploaded a cover in the cover uploader. Article ${opening.articleId}'s working-copy cover is now catalogue entry ${cover.catalogueId} ("${cover.label}"); readers see it after the next publish.`,
    );
  } catch (error) {
    committing = false;
    say(error instanceof Error ? error.message : "The cover could not be uploaded.", "error");
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
    // The cover is set either way; get_library_article shows it.
  }
}

refresh();
void app.connect();
