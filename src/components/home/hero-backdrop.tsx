import { getImageProps } from "next/image";
import { HeroLoopVideo } from "./hero-loop-video";
import { HERO_LOOP_BY_SHAPE, HERO_LOOPS } from "./hero-loops";

/**
 * The width each still is drawn at, which `object-cover` makes wider than the
 * viewport whenever the hero's box is squarer than the cut. A portrait cut is
 * narrower than any box it fills, so it is drawn at the viewport's width. A
 * landscape cut in a box squarer than 16:9 is drawn at the box's height times
 * 16/9, and the box runs to most of the viewport's height, so its width is
 * stated against both.
 *
 * Under-stating it costs more than a soft picture: the browser would fetch a
 * still with fewer pixels than the video, and the video's first frame would
 * then count as a larger paint and take over as the LCP element, landing only
 * once the video has downloaded.
 */
const PORTRAIT_SIZES = "100vw";
const LANDSCAPE_SIZES = "max(100vw, 160vh)";

/**
 * The home hero's backdrop: the "Calm" loop of a city our gamers built, behind
 * the headline, under the scrim.
 *
 * **The still is the page's LCP element, and it is fetched first.** It is a
 * `<picture>` whose sources follow the same shape list as the video, so a
 * phone downloads the vertical still alone and a desktop the wide one alone;
 * its `<img>` is eager and high-priority. The video mounts over it after
 * hydration (`HeroLoopVideo`), so it never competes with the still.
 *
 * **It reserves nothing and so cannot shift anything.** It is absolutely
 * positioned and covers the hero's box, whose height the text decides; the
 * still and the video are cropped to that box by `object-cover`.
 *
 * **The scrim is what the text is measured against.** The text sits over it,
 * and the hero sets every word over the backdrop in the foreground ink, which
 * holds AA over the brightest frame of all three cuts once dimmed; the quiet
 * ink does not, so the hero does not use it.
 *
 * Decorative, so the still's `alt` is empty: the headline over it is the
 * content.
 */
export function HeroBackdrop() {
  const sources = HERO_LOOP_BY_SHAPE.map(({ media, loop }) => {
    const { firstFrame } = HERO_LOOPS[loop];
    const { props } = getImageProps({
      src: firstFrame,
      alt: "",
      sizes: firstFrame.width > firstFrame.height ? LANDSCAPE_SIZES : PORTRAIT_SIZES,
      loading: "eager",
      fetchPriority: "high",
    });
    return { media, loop, props };
  });
  const fallback = sources.find(({ media }) => media === null);
  if (!fallback) throw new Error("HERO_LOOP_BY_SHAPE needs a fallback entry");

  return (
    <div aria-hidden className="absolute inset-0">
      <picture>
        {sources.flatMap(({ media, loop, props }) =>
          media === null
            ? []
            : [
                <source
                  key={loop}
                  media={media}
                  srcSet={props.srcSet}
                  sizes={props.sizes}
                  width={props.width}
                  height={props.height}
                />,
              ],
        )}
        <img
          {...fallback.props}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      </picture>
      <HeroLoopVideo />
      <div className="absolute inset-0 bg-scrim" />
    </div>
  );
}
