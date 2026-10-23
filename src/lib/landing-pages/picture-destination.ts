import {
  LANDING_PICTURE_SHAPES,
  describeLandingPictureShape,
  describeLandingPictureShapes,
  type LandingPictureShape,
} from "./picture-shapes";
import { LANDING_SECTIONS, type LandingSection } from "./sections";

/** The shapes a picture placed somewhere may be, and the sentence saying why when not every shape. */
export interface LandingPictureDestination {
  shapes: readonly LandingPictureShape[];
  /** Why only `shapes`, a sentence for the admin; null when every shape fits. */
  rule: string | null;
}

/**
 * **Which shapes a picture placed in `section` may be**: its type's declared
 * shapes, and in a section that already shows other pictures, only their
 * shape, since a section's pictures are all one. `pictureId` is the picture
 * item being replaced, which does not count as another; `shapeOf` reads a
 * shown picture's shape by its catalogue id, or null for one with none.
 *
 * The database refuses anything else whatever this answers; this is what lets
 * the uploader refuse before anything is stored, and say why.
 */
export function landingPictureDestination(
  section: LandingSection,
  pictureId: string | undefined,
  shapeOf: (imageId: string) => LandingPictureShape | null,
): LandingPictureDestination {
  const declared: readonly LandingPictureShape[] = LANDING_SECTIONS[section.type].pictureShapes;
  const typeRule =
    declared.length === LANDING_PICTURE_SHAPES.length
      ? null
      : `A ${section.type} section's picture must be ${describeLandingPictureShapes(declared)}.`;

  const others = section.type === "image"
    ? section.images.filter((image) => image.id !== pictureId)
    : [];
  const shared = others
    .map((image) => shapeOf(image.imageId))
    .find((shape): shape is LandingPictureShape => shape !== null);
  if (shared === undefined) return { shapes: declared, rule: typeRule };

  return {
    shapes: declared.filter((shape) => shape === shared),
    rule: `The other pictures of this image section are ${describeLandingPictureShape(shared)}, and an image section's pictures must all be one shape.`,
  };
}
