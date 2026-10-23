import {
  CATALOGUE_IMAGE_PURPOSES,
  cataloguePurposeRatio,
} from "@/lib/images/catalogue-image-purposes";

/**
 * **The shapes a landing page picture comes in, each a catalogue purpose of
 * its own.** The shape is never stored beside a picture: it follows from the
 * purpose, whose stored size the image registry fixes, and an entry's purpose
 * never changes — so a page can reserve a picture's box before it loads, and
 * the box can never disagree with the file.
 *
 * Which shapes a section takes is its type's own declaration in the section
 * registry (`pictureShapes`), and the database holds the same rule.
 *
 * Kept free of React and of any service import, like the section registry.
 */
export const LANDING_PICTURE_SHAPES = ["wide", "square", "portrait"] as const;

export type LandingPictureShape = (typeof LANDING_PICTURE_SHAPES)[number];

/** The catalogue purpose each shape's pictures are. */
export const LANDING_PICTURE_PURPOSES = {
  wide: "landing_image",
  square: "landing_square_image",
  portrait: "landing_portrait_image",
} as const satisfies Record<LandingPictureShape, keyof typeof CATALOGUE_IMAGE_PURPOSES>;

export type LandingPicturePurpose = (typeof LANDING_PICTURE_PURPOSES)[LandingPictureShape];

/** Whether a catalogue purpose is one of the landing picture shapes. */
export function isLandingPicturePurpose(purpose: string): purpose is LandingPicturePurpose {
  return LANDING_PICTURE_SHAPES.some((shape) => LANDING_PICTURE_PURPOSES[shape] === purpose);
}

/** The shape a landing picture purpose stores its pictures in. */
export function landingPictureShapeOf(purpose: LandingPicturePurpose): LandingPictureShape {
  const shape = LANDING_PICTURE_SHAPES.find((each) => LANDING_PICTURE_PURPOSES[each] === purpose);
  // Every landing picture purpose is some shape's, by the type.
  if (shape === undefined) throw new Error(`${purpose} is no landing picture shape`);
  return shape;
}

/** A shape's stored width and height, from its purpose's registry entry. */
export function landingPictureSize(shape: LandingPictureShape): { width: number; height: number } {
  const { width, height } = CATALOGUE_IMAGE_PURPOSES[LANDING_PICTURE_PURPOSES[shape]];
  return { width, height };
}

/** A shape as an admin reads it: its name and its ratio, `wide 16:9`. */
export function describeLandingPictureShape(shape: LandingPictureShape): string {
  return `${shape} ${cataloguePurposeRatio(LANDING_PICTURE_PURPOSES[shape])}`;
}

/** Shapes as a list an admin reads, `wide 16:9, square 1:1 or portrait 4:5`. */
export function describeLandingPictureShapes(shapes: readonly LandingPictureShape[]): string {
  return orList(shapes.map(describeLandingPictureShape));
}

/** Words as one alternative, `a, b or c`. */
export function orList(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}
