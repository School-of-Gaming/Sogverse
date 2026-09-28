/**
 * A drawn stand-in for a team photo, at the photo's own 4:5.
 *
 * `you` is the placeholder a card shows before it has a photo: a friendly
 * head-and-shoulders figure wearing a gaming headset, in the theme's neutrals,
 * so an unfinished card reads as "your photo goes here" rather than as a broken
 * image or somebody else's face. The other two are the photo guidance's
 * examples of what not to upload, drawn from the same figure so the three read
 * as one set: a group shot, and a face hidden behind sunglasses.
 *
 * Neutrals only. The figure is a surface and an edge, never a colour, so it sits
 * in any frame — including one edged in the person's pick — without competing
 * with it. Always decorative: the text beside it carries the meaning.
 */
export function TeamPhotoPlaceholder({
  kind = "you",
  className,
}: {
  kind?: "you" | "group" | "hidden";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 80 100"
      aria-hidden
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
      className={className}
    >
      <rect width="80" height="100" className="fill-card" />
      {kind === "group" ? (
        <>
          <Figure transform="translate(-4 30) scale(0.62)" outline />
          <Figure transform="translate(35.2 30) scale(0.62)" outline />
          <Figure transform="translate(15.2 38) scale(0.62)" outline />
        </>
      ) : (
        <Figure headset={kind === "you"} sunglasses={kind === "hidden"} />
      )}
    </svg>
  );
}

/** One head-and-shoulders figure, drawn on the full 80 × 100 frame. */
function Figure({
  transform,
  headset = false,
  sunglasses = false,
  outline = false,
}: {
  transform?: string;
  /** Edge the figure in the ground, so overlapping figures stay apart. */
  outline?: boolean;
  headset?: boolean;
  sunglasses?: boolean;
}) {
  return (
    <g transform={transform}>
      <path
        d="M12 100 C12 77 25 66 40 66 C55 66 68 77 68 100 Z"
        strokeWidth={outline ? 4 : 0}
        className="fill-border stroke-card"
      />
      <circle
        cx="40"
        cy="41"
        r="16"
        strokeWidth={outline ? 4 : 0}
        className="fill-border stroke-card"
      />
      {sunglasses ? (
        <path
          d="M27 37 H53 V41 C53 45 50 47 47 47 C44 47 42 45 41 42 H39 C38 45 36 47 33 47 C30 47 27 45 27 41 Z"
          className="fill-background"
        />
      ) : (
        <>
          <circle cx="34" cy="39" r="1.8" className="fill-muted-foreground" />
          <circle cx="46" cy="39" r="1.8" className="fill-muted-foreground" />
        </>
      )}
      <path
        d="M33 47 Q40 53 47 47"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        className="stroke-muted-foreground"
      />
      {headset && (
        <>
          <path
            d="M22 42 A18 18 0 0 1 58 42"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className="stroke-muted-foreground"
          />
          <rect x="18" y="37" width="8" height="13" rx="3" className="fill-muted-foreground" />
          <rect x="54" y="37" width="8" height="13" rx="3" className="fill-muted-foreground" />
          <path
            d="M22 50 Q23 58 32 57"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            className="stroke-muted-foreground"
          />
        </>
      )}
    </g>
  );
}
