import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describeFaceContract } from "../../helpers/face-contract";

/**
 * The face contract, honoured on Sogverse's side of the seam.
 *
 * The assertions are the shared statement in `tests/helpers/face-contract.ts`;
 * this file names the layout they run against. The sibling under
 * `tests/unit/sog-ui/` makes the same assertions against the demo, which is the
 * contract's reference implementation.
 *
 * Every face is asserted, including the ones nothing renders yet: the contract
 * is the whole list, so a face left unloaded is a hole that only shows up the
 * day a surface first asks for it.
 */

// Anchored on the Vitest project root rather than on `import.meta.url`, which a
// test runner does not have to expose as a file: URL.
// The document — and so every font load — belongs to the `[locale]` layout;
// the layout at the app root is a pass-through that renders no `<html>`.
const APP_LAYOUT = join(process.cwd(), "src", "app", "[locale]", "layout.tsx");

describeFaceContract(
  readFileSync(APP_LAYOUT, "utf8"),
  "src/app/[locale]/layout.tsx",
);
