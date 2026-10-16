import { Testimonial } from "@/components/home/testimonial";
import { cn } from "@/lib/utils";
import type { PublicTestimonial } from "@/services/testimonials";

/*
 * **The arrangements testimonials are laid out in, wherever the site shows
 * them**: the home page, About and a landing page's testimonials section all
 * render through these, so a quote looks the same wherever it is placed.
 *
 * - `FeatureTestimonial` — one quote, large and centred, as under the home
 *   hero.
 * - `TestimonialPair` — two across from `md`, as on About.
 * - `TestimonialRow` — three across from `md`, as Home's and About's row.
 * - `TestimonialShowcase` — About's whole arrangement: the feature, then the
 *   pair, then the row.
 *
 * Each takes `className` for its placement alone — the room above it, which
 * depends on what sits there — never for its look. The quotes are peers with
 * no action of their own, so they sit on the page ground rather than in cards.
 * A group with no testimonial renders nothing.
 */

/** One quote, large and centred in a reading measure. */
export function FeatureTestimonial({
  testimonial,
  className,
}: {
  testimonial: PublicTestimonial;
  className?: string;
}) {
  return (
    <Testimonial
      testimonial={testimonial}
      size="feature"
      className={cn("mx-auto max-w-3xl", className)}
    />
  );
}

function TestimonialGrid({
  testimonials,
  columns,
  className,
}: {
  testimonials: readonly PublicTestimonial[];
  columns: "md:grid-cols-2" | "md:grid-cols-3";
  className?: string;
}) {
  if (testimonials.length === 0) return null;
  return (
    <div className={cn("mx-auto grid max-w-5xl gap-10", columns, className)}>
      {testimonials.map((testimonial) => (
        <Testimonial key={testimonial.id} testimonial={testimonial} />
      ))}
    </div>
  );
}

/** Two quotes side by side from `md`, stacked on a phone. */
export function TestimonialPair({
  testimonials,
  className,
}: {
  testimonials: readonly PublicTestimonial[];
  className?: string;
}) {
  return <TestimonialGrid testimonials={testimonials} columns="md:grid-cols-2" className={className} />;
}

/** Three quotes in a row from `md`, stacked on a phone. */
export function TestimonialRow({
  testimonials,
  className,
}: {
  testimonials: readonly PublicTestimonial[];
  className?: string;
}) {
  return <TestimonialGrid testimonials={testimonials} columns="md:grid-cols-3" className={className} />;
}

/** The showcase's three groups, each in reading order. */
export interface TestimonialShowcaseGroups {
  feature: readonly PublicTestimonial[];
  pair: readonly PublicTestimonial[];
  row: readonly PublicTestimonial[];
}

/**
 * About's arrangement: the large quote, then the pair, then the row, with
 * About's own room between them. `afterHeading` says a heading sits directly
 * above, which the large quote keeps its distance from.
 */
export function TestimonialShowcase({
  groups,
  afterHeading,
}: {
  groups: TestimonialShowcaseGroups;
  afterHeading: boolean;
}) {
  return (
    <>
      {groups.feature.map((testimonial) => (
        <FeatureTestimonial
          key={testimonial.id}
          testimonial={testimonial}
          className={cn(afterHeading && "mt-12 lg:mt-16")}
        />
      ))}
      <TestimonialPair testimonials={groups.pair} className="mt-16" />
      <TestimonialRow testimonials={groups.row} className="mt-10" />
    </>
  );
}
