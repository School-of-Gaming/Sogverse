/**
 * What one image purpose is: the bucket its objects live in, who may read them,
 * the size they are stored at, the largest upload its route accepts, and
 * whether they are entries of the admin image catalogue.
 */
export interface ImagePurposeSpec {
  /** The storage bucket every image of this purpose has its object in. */
  readonly bucket: string;
  /**
   * Whether the bucket answers anonymous reads. `public` is what lets a link
   * preview, an email client or the image optimizer fetch an object by its URL;
   * a `private` object is reached only through a signed URL or a route that
   * checks the reader first.
   */
  readonly visibility: "public" | "private";
  /**
   * The exact pixel size every image of this purpose is stored at: whatever
   * crops a picture to it, and whatever checks a stored picture against it,
   * reads it here. `"as-uploaded"` is a purpose that keeps the shape its
   * picture was uploaded in: it is never cropped, and how far it may be scaled
   * down is its feature's own limit.
   */
  readonly storedSize: { readonly width: number; readonly height: number } | "as-uploaded";
  /**
   * The largest upload, in bytes, the purpose's route accepts. A browser that
   * checks before posting reads the same figure, so the person is told the real
   * reason instead of meeting a bare refusal. Every figure sits under the
   * platform's ~4.5 MB request body limit, which refuses a larger body before
   * any route runs.
   */
  readonly maxBytes: number;
  /**
   * Whether this purpose's pictures are entries of the admin image catalogue
   * (the `catalogue_images` table), chosen and reused across the site. A
   * picture can be stored at a fixed size without being one: a team photo is
   * cropped to its frame but belongs to one person and is never reused.
   */
  readonly catalogue: boolean;
}

/**
 * **Every storage bucket, named once, as the purpose it serves.**
 *
 * How a picture may be handled — whether it can be served to a link preview,
 * the size it is stored at, which bucket a URL is built against — follows from
 * what the picture is *for*, so the purpose is the key everything else reads.
 * Every bucket is declared here, not only the ones some feature currently asks
 * about, because that is what lets a unit test hold this map against the
 * storage schema: a bucket added without a purpose, a purpose naming a bucket
 * that does not exist, or a visibility that disagrees with the bucket's own
 * `public` flag fails CI instead of surfacing as a broken preview or a private
 * photo served to anyone with the link.
 *
 * The catalogue's own purpose map is the slice of this one whose `catalogue`
 * is `true`, and every purpose in it has a fixed stored size.
 *
 * Kept free of runtime imports so `next.config.ts` can read it.
 */
export const IMAGE_PURPOSES = {
  product: {
    bucket: "product-images",
    visibility: "public",
    storedSize: { width: 1200, height: 800 },
    maxBytes: 4 * 1024 * 1024,
    catalogue: true,
  },
  library_cover: {
    bucket: "library-covers",
    visibility: "public",
    storedSize: { width: 1600, height: 900 },
    maxBytes: 4 * 1024 * 1024,
    catalogue: true,
  },
  landing_image: {
    bucket: "landing-images",
    visibility: "public",
    storedSize: { width: 1600, height: 900 },
    maxBytes: 4 * 1024 * 1024,
    catalogue: true,
  },
  team_photo: {
    bucket: "team-photos",
    visibility: "private",
    storedSize: { width: 800, height: 1000 },
    maxBytes: 2 * 1024 * 1024,
    catalogue: false,
  },
  session_photo: {
    bucket: "session-images",
    visibility: "public",
    storedSize: "as-uploaded",
    maxBytes: 3 * 1024 * 1024,
    catalogue: false,
  },
  chat_image: {
    bucket: "chat-images",
    visibility: "private",
    storedSize: "as-uploaded",
    maxBytes: 3 * 1024 * 1024,
    catalogue: false,
  },
} as const satisfies Record<string, ImagePurposeSpec>;

/** One of the purposes declared in `IMAGE_PURPOSES`. */
export type ImagePurpose = keyof typeof IMAGE_PURPOSES;
