import type { StagedChatImage } from "./composer-staging";

/**
 * Turning files a person handed the composer into staged pictures.
 *
 * **The decode happens here, once, and the numbers it learns are then treated
 * as stored.** That is the same shape the normalize pipeline has: it opens the
 * bytes, learns the intrinsic size, and everything downstream computes boxes
 * from the two numbers rather than from another decode. Measuring at *render*
 * time is what the layout rule forbids; measuring at *ingest* time is the
 * ingest doing its job.
 *
 * **A file the browser cannot open is refused at pick time**, not at send time.
 * Learning at Send that one of five files was never usable is the worst
 * available moment to be told.
 */
export async function readStagedChatImage(
  file: File,
): Promise<StagedChatImage | null> {
  if (!file.type.startsWith("image/")) return null;

  const src = URL.createObjectURL(file);
  try {
    const { width, height } = await measure(src);
    return { key: crypto.randomUUID(), src, width, height, name: file.name };
  } catch {
    URL.revokeObjectURL(src);
    return null;
  }
}

/** Every file that turned out to be a picture, in the order they were handed over. */
export async function readStagedChatImages(
  files: readonly File[],
): Promise<StagedChatImage[]> {
  const staged = await Promise.all(files.map(readStagedChatImage));
  return staged.filter((image): image is StagedChatImage => image !== null);
}

function measure(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("chat image failed to decode"));
    image.src = src;
  });
}
