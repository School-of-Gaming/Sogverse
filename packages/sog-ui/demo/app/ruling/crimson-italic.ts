/**
 * Crimson Pro's italic, loaded by the ruling page and leaving with it.
 *
 * The demo's layout loads the face upright only, at 400 and 600, which is what
 * the face contract asks for today: `FACES.serif` names weights and subsets and
 * says nothing about styles, so a consumer that follows the contract loads no
 * italic file. That is precisely the second half of the question the About
 * quote asks, so the page cannot draw the answer with the layout's load — it
 * has to bring the file itself.
 *
 * It is loaded here, in a module the ruling directory owns, rather than in the
 * demo's layout, because a fifth load in that layout would teach a consumer
 * that the contract has an italic in it before anyone has ruled that it does.
 * When the directory is deleted the load goes with it. If the italic is ruled
 * in, what changes is the contract — a `styles` field beside `weights` — and
 * the demo's layout follows from there.
 */
import { Crimson_Pro } from "next/font/google";

export const crimsonProItalic = Crimson_Pro({
  weight: "400",
  style: ["italic"],
  subsets: ["latin", "latin-ext"],
});
