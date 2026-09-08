/**
 * Press Start 2P, loaded by the ruling page and leaving with it.
 *
 * The face is Sogverse's, not the library's: it is an approved exception
 * outside the four in `FACES`, loaded in the app's root layout and pointed at
 * by Sogverse's own `--font-display`. The demo's layout deliberately does not
 * load it — the demo is the reference implementation of the face contract, and
 * a fifth family in that layout would teach a consumer that the contract has
 * five faces in it.
 *
 * So the "today" column of every Press Start site on the ruling page reaches
 * for the face here, in a module the ruling directory owns. When the directory
 * is deleted the load goes with it, and the demo has never known the family
 * existed. Weight 400 and the `latin` subset are exactly what the app loads,
 * which is what makes the today column honest: a bolder weight drawn here would
 * be a face the app does not have — and the app asks for one, which is a finding
 * rather than a thing to reproduce (see `RULINGS.md`, "What was hiding").
 */
import { Press_Start_2P } from "next/font/google";

export const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
});
