/**
 * The game platforms a Sogverse account can carry an identity on.
 *
 * **A tuple, in a module with no React in it, because two very different things
 * need the same list.** The UI's descriptor registry keys off it — every
 * platform's username rule, figure geometry and drawn placeholder — and so do
 * the zod schemas on the wire, which cannot import that registry: it is a client
 * module full of hooks and JSX, and an API route pulling it in would drag a
 * component tree into a server bundle.
 *
 * Keeping the list here is what stops those two from drifting. The registry is
 * typed as a total `Record` over this tuple, so adding a platform breaks the
 * build until its descriptor exists, and the wire schema picks it up for free.
 */
export const SUPPORTED_GAME_PLATFORMS = ["minecraft", "roblox"] as const;

/** One game platform. Derived, so it cannot disagree with the tuple above. */
export type GamePlatform = (typeof SUPPORTED_GAME_PLATFORMS)[number];

/**
 * How much of the character a row draws. Here rather than beside the components
 * for the same reason as the platforms: the avatar route takes a figure on its
 * query string, so the wire schema needs the list and cannot reach the component
 * module for it.
 */
export const SUPPORTED_GAME_FIGURES = ["full", "head"] as const;

/** One figure. Derived, so it cannot disagree with the tuple above. */
export type GameFigure = (typeof SUPPORTED_GAME_FIGURES)[number];
