/*
 * How the uploader reports a batch of pictures to the model. Pure, with no
 * DOM, like `frames.ts`. Every picked file is judged on its own against the
 * frames, in the order the admin picked them, and every one that fits is
 * added to the catalogue; the model is told the whole batch in one piece and
 * then what to do with the new entries, in the opening's own sentence.
 */

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
 * Where a batch stored something and left a file behind: the uploader takes
 * no more picks once anything is stored, so a re-cropped or failed picture
 * needs a new opening.
 */
const NO_MORE_PICKS =
  "This uploader takes no more pictures: to upload a re-cropped or failed picture, open the uploader again.";

/**
 * **The whole batch, as the model is told it**, in one piece: a host keeps
 * only the last context update, so a line per file would leave the model
 * the last file alone. Each file in the order picked, with its new catalogue
 * id, label and shape, or the sentence it was refused with; then, where
 * anything was uploaded, the opening's sentence saying what to do with the
 * new entries, and where a file was also left behind, that this uploader
 * takes no more.
 */
export function batchReport(outcomes: readonly FileOutcome[], nextStep: string): string {
  const uploaded = outcomes.filter((each) => each.kind === "uploaded").length;
  const refused = outcomes.filter((each) => each.kind === "refused").length;
  const failed = outcomes.filter((each) => each.kind === "failed").length;
  const counts = [
    `${uploaded} uploaded`,
    ...(refused > 0 ? [`${refused} refused`] : []),
    ...(failed > 0 ? [`${failed} failed`] : []),
  ].join(", ");
  const picked = outcomes.length === 1 ? "1 picture" : `${outcomes.length} pictures`;

  return [
    `The admin picked ${picked} in the uploader: ${counts}, in the order picked:`,
    ...outcomes.map((outcome, index) => fileLine(outcome, index + 1)),
    uploaded === 0
      ? "Nothing was uploaded; the admin can pick again in the same uploader."
      : `The uploaded pictures are in the catalogue, placed nowhere yet. ${nextStep}${refused + failed > 0 ? ` ${NO_MORE_PICKS}` : ""}`,
  ].join("\n");
}
