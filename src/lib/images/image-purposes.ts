/**
 * What one image purpose is: the bucket its objects live in, who may read them,
 * and — for a purpose kept in the admin image catalogue — the one size they are
 * stored at.
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
   * Present only for a purpose whose entries live in the admin image catalogue
   * (the `catalogue_images` table): the exact pixel size every entry is stored
   * at. The crop draws to it and the upload routes refuse anything else.
   */
  readonly catalogue?: { readonly width: number; readonly height: number };
}

/**
 * **Every storage bucket, named once, as the purpose it serves.**
 *
 * How a picture may be handled — whether it can be served to a link preview,
 * how large it is stored, which bucket a URL is built against — follows from
 * what the picture is *for*, so the purpose is the key everything else reads.
 * Every bucket is declared here, not only the ones some feature currently asks
 * about, because that is what lets a unit test hold this map against the
 * storage schema: a bucket added without a purpose, a purpose naming a bucket
 * that does not exist, or a visibility that disagrees with the bucket's own
 * `public` flag fails CI instead of surfacing as a broken preview or a private
 * photo served to anyone with the link.
 *
 * The purposes without a `catalogue` block are declared for that coverage
 * alone; their upload routes keep their own handling and read nothing from here.
 *
 * Kept free of runtime imports so `next.config.ts` can read it, through the
 * catalogue map derived from it.
 */
export const IMAGE_PURPOSES = {
  product: {
    bucket: "product-images",
    visibility: "public",
    catalogue: { width: 1200, height: 800 },
  },
  library_cover: {
    bucket: "library-covers",
    visibility: "public",
    catalogue: { width: 1600, height: 900 },
  },
  landing_image: {
    bucket: "landing-images",
    visibility: "public",
    catalogue: { width: 1600, height: 900 },
  },
  team_photo: { bucket: "team-photos", visibility: "private" },
  session_photo: { bucket: "session-images", visibility: "public" },
  chat_image: { bucket: "chat-images", visibility: "private" },
} as const satisfies Record<string, ImagePurposeSpec>;

/** One of the purposes declared in `IMAGE_PURPOSES`. */
export type ImagePurpose = keyof typeof IMAGE_PURPOSES;
