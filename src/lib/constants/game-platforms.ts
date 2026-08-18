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

/**
 * The longest a game username may be **on our own wire**.
 *
 * **This is the only rule we keep about the shape of a game username, and it is
 * not a rule about names at all** — it is a bound on a request we are going to
 * make. Each platform is the sole authority on which handles exist on it, and
 * both of them have issued names our own format checks called impossible:
 * Roblox accounts predating its current validator carry spaces, and Mojang names
 * from before the modern rules are shorter than three characters or carry
 * characters no regex of ours allowed. A check that refuses a real account is
 * not protecting anybody.
 *
 * So the length stands alone, deliberately generous — far past anything either
 * platform issues — because its job is to stop an unbounded string being put in
 * a URL, a JSON body and a text column, not to guess at a naming rule. Anything
 * within it is sent to the platform, and the platform's answer decides whether
 * the name lands verified or is stored unverified.
 *
 * Shared by both platforms because it is a statement about *us*, and the two
 * lookups and the two wire schemas all measure against this one number.
 */
export const GAME_USERNAME_MAX_LENGTH = 100;
