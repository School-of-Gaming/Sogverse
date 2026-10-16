import { judgePicture, type Frame, type Verdict } from "./frames";

/*
 * How the uploader takes several pictures at once. Pure, with no DOM, like
 * `frames.ts`. Every picked file is judged on its own by the frame rules, in
 * the order the admin picked them; on top of those, a destination may take
 * only so many (its room) and may need all of a batch's pictures to be one
 * shape. Both are the opening's to say: the view counts and compares, and
 * restates neither rule.
 */

/** How many pictures one opening takes, and what a picture past them is told. */
export interface Room {
  pictures: number;
  /** The sentence a picture past the room is refused with. */
  full: string;
}

/** What the batch rules read from the opening. */
export interface BatchOpening {
  frames: readonly Frame[];
  noFrame: string;
  /** Null: any number. */
  room: Room | null;
  /**
   * When a batch's pictures must all be one shape, the rule's sentence, which
   * a picture of another shape than the first one taken is refused with;
   * null when they need not be.
   */
  oneShape: string | null;
}

/**
 * Whether one more picture of this size can join a batch that has already
 * taken `taken` (the frames of the pictures accepted before it, in pick
 * order). The frame rules come first, so a picture of the wrong shape is told
 * that rather than that it is one too many; then **the first picture taken
 * fixes the batch's shape**, where the destination needs one shape; then the
 * room, which only pictures that pass count against — so a refused picture
 * never uses up a place a later one could have.
 */
export function judgeInBatch(
  width: number,
  height: number,
  opening: BatchOpening,
  taken: readonly Frame[],
): Verdict {
  const verdict = judgePicture(width, height, opening);
  if (verdict.kind === "refused") return verdict;
  const first = taken.at(0);
  if (opening.oneShape !== null && first !== undefined && first.purpose !== verdict.frame.purpose) {
    return {
      kind: "refused",
      reason: `This picture is ${verdict.frame.name} (${width} × ${height}), and the first picture taken is ${first.name}. ${opening.oneShape}`,
    };
  }
  if (opening.room !== null && taken.length >= opening.room.pictures) {
    return { kind: "refused", reason: opening.room.full };
  }
  return verdict;
}

/** The opening's placement, as far as the calls it makes go. */
export interface Placement {
  arguments: Record<string, unknown>;
  imageArgument: string;
  /** Whether `imageArgument` takes a list of ids, so the batch is placed in one call. */
  list: boolean;
}

/**
 * The arguments of each call placing the stored pictures, in order: one call
 * carrying every id, in pick order, where the place tool takes a list — so
 * the database judges the whole batch in one write — else a call per id.
 */
export function placeCalls(
  ids: readonly string[],
  place: Placement,
): Record<string, unknown>[] {
  const values: unknown[] = place.list ? [[...ids]] : [...ids];
  return values.map((value) => ({ ...place.arguments, [place.imageArgument]: value }));
}

/** What became of one picked file, in the order the admin picked it. */
export type FileOutcome =
  | {
      kind: "uploaded";
      fileName: string;
      catalogueId: string;
      label: string;
      /** The frame's name: `wide 16:9`. */
      shape: string;
      /** Smaller than its frame, so it will look soft. */
      soft: boolean;
    }
  /** Refused by the checks: nothing was uploaded. */
  | { kind: "refused"; fileName: string; reason: string }
  /** Passed the checks, but storing it failed. */
  | { kind: "failed"; fileName: string; reason: string };

/** What placing the uploaded pictures came to. */
export type PlacementOutcome =
  /** The opening places nothing: the pictures are in the catalogue alone. */
  | { kind: "none" }
  /** Placed; the opening's sentence saying where. */
  | { kind: "placed"; outcome: string }
  /** The place tool refused, with its sentence. */
  | { kind: "refused"; reason: string };

function fileLine(outcome: FileOutcome, number: number): string {
  const name = JSON.stringify(outcome.fileName);
  switch (outcome.kind) {
    case "uploaded":
      return `${number}. ${name}: uploaded as catalogue entry ${outcome.catalogueId} (${JSON.stringify(outcome.label)}), ${outcome.shape}${outcome.soft ? "; it is smaller than that shape's size, so it will look soft" : ""}.`;
    case "refused":
      return `${number}. ${name}: refused, nothing uploaded. ${outcome.reason}`;
    case "failed":
      return `${number}. ${name}: could not be uploaded. ${outcome.reason}`;
  }
}

/**
 * **The whole batch, as the model is told it**, in one piece: a host keeps
 * only the last context update, so a line per file would leave the model
 * the last file alone. Each file in the order picked, with its new catalogue
 * id, label and shape, or the sentence it was refused with; then where the
 * uploaded pictures went.
 */
export function batchReport(outcomes: readonly FileOutcome[], placement: PlacementOutcome): string {
  const uploaded = outcomes.filter((each) => each.kind === "uploaded").length;
  const refused = outcomes.filter((each) => each.kind === "refused").length;
  const failed = outcomes.filter((each) => each.kind === "failed").length;
  const counts = [
    `${uploaded} uploaded`,
    ...(refused > 0 ? [`${refused} refused`] : []),
    ...(failed > 0 ? [`${failed} failed`] : []),
  ].join(", ");
  const picked = outcomes.length === 1 ? "1 picture" : `${outcomes.length} pictures`;

  let where: string;
  if (uploaded === 0) where = "Nothing was uploaded, so nothing was placed.";
  else if (placement.kind === "none") where = "The uploaded pictures are in the catalogue and placed nowhere yet.";
  else if (placement.kind === "placed") where = placement.outcome;
  else where = `The uploaded pictures are in the catalogue, but they could not be placed: ${placement.reason}`;

  return [
    `The admin picked ${picked} in the uploader: ${counts}, in the order picked:`,
    ...outcomes.map((outcome, index) => fileLine(outcome, index + 1)),
    where,
  ].join("\n");
}
