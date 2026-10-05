"use client";

import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import {
  HERO_LOOP_BY_SHAPE,
  HERO_LOOPS,
  REDUCED_MOTION_QUERY,
  type HeroLoopId,
} from "./hero-loops";

const QUERIES = [
  REDUCED_MOTION_QUERY,
  ...HERO_LOOP_BY_SHAPE.flatMap(({ media }) => (media ? [media] : [])),
];

function subscribe(onChange: () => void) {
  const lists = QUERIES.map((query) => window.matchMedia(query));
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

/** The cut this viewport plays, or `null` where nothing may move. */
function currentLoop(): HeroLoopId | null {
  if (window.matchMedia(REDUCED_MOTION_QUERY).matches) return null;
  const match = HERO_LOOP_BY_SHAPE.find(
    ({ media }) => media === null || window.matchMedia(media).matches,
  );
  return match?.loop ?? null;
}

/** The server renders the still alone; the video exists only in a browser. */
function serverLoop(): HeroLoopId | null {
  return null;
}

/**
 * The moving half of the hero backdrop, laid over the still of its own first
 * frame.
 *
 * **It exists only after hydration, and only where motion is allowed.** The
 * server renders nothing here, so the still — the page's LCP element — is the
 * only media the document asks for, and the video's request starts after it.
 * Under `prefers-reduced-motion: reduce` it never mounts at all, so nothing is
 * downloaded and the still is the whole backdrop.
 *
 * **The cut is chosen here, by the same list the still's `<picture>` reads**,
 * rather than by `<source media>`, which a browser evaluates once at load and
 * older ones ignore and play the first source. A rotation or a resized window
 * that changes the shape remounts the video on the new cut; the still beneath
 * already shows that cut, so the change is never a gap.
 *
 * **It is hidden until it is actually playing.** A video that has not decoded
 * a frame yet can paint black in some engines, so it stays transparent over
 * the still until `playing` fires; the still is that encode's first frame, so
 * the swap shows no seam. Each cut is its own keyed element holding its own
 * flag, so a remount always starts hidden, even on a cut that played before. Nothing here can move layout: the backdrop is
 * absolutely positioned inside a hero whose height its text decides.
 *
 * Decorative and silent, so it is hidden from assistive technology and has no
 * controls: the headline beside it says everything the loop does.
 */
export function HeroLoopVideo() {
  const loop = useSyncExternalStore(subscribe, currentLoop, serverLoop);

  if (loop === null) return null;

  return <LoopVideo key={loop} loop={loop} />;
}

/** One cut's video, transparent until it fires `playing`. */
function LoopVideo({ loop }: { loop: HeroLoopId }) {
  const [playing, setPlaying] = useState(false);

  return (
    <video
      src={HERO_LOOPS[loop].video}
      autoPlay
      muted
      loop
      playsInline
      disablePictureInPicture
      aria-hidden
      onPlaying={() => setPlaying(true)}
      className={cn(
        "absolute inset-0 h-full w-full object-cover",
        !playing && "opacity-0",
      )}
    />
  );
}
