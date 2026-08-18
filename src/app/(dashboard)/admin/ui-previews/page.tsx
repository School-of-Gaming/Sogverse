/* eslint-disable i18next/no-literal-string -- internal admin-only index of fixture-driven preview scenes; every string here is scene metadata or an explanation of the mechanism, not user-facing copy that ships in any locale */
import { buttonVariants } from "@/components/ui/button";
import {
  PREVIEW_SCENES,
  previewSceneHref,
  type PreviewSceneMeta,
} from "@/components/preview/scenes";

/**
 * The registry, read through the interface it satisfies rather than through its
 * literal type.
 *
 * `PREVIEW_SCENES` is `as const` so the renderer can be keyed by a literal
 * `PreviewSurface` union — which is what makes a scene with no render fail to
 * compile. The cost is that a scenario omitting its optional `description` has
 * no such property on its literal type at all, so reading `.description` off
 * the union does not type-check. This page only ever reads metadata, so it
 * reads through `PreviewSceneMeta`, where `description` is the optional field
 * it was declared as.
 */
const SCENES: readonly PreviewSceneMeta[] = PREVIEW_SCENES;

/**
 * **UI Previews** — the single home for the full-page preview scenes.
 *
 * The style guide next door demos *components*; a page-level change has to be
 * judged as a page, with real chrome, a real viewport and real scrolling. That
 * is what a scene is, and this page is the index of them.
 *
 * The list is generated from the scene registry, so adding a scene surfaces its
 * links here with no edit to this file. That is deliberate: the previous home for
 * these links was a section buried at the bottom of a two-thousand-line style
 * guide, which made them effectively undiscoverable, and any index that had to
 * be hand-maintained would drift the first time someone added a scenario.
 *
 * Everything rendered here is literal English. Scene titles, descriptions and
 * scenario labels are developer-facing metadata on an admin-only page — they are
 * never shown to a user in any locale, and translating them would put fixture
 * bookkeeping into the message files. Anything a scene itself *renders* is
 * user-facing-shaped and goes through next-intl as usual.
 */
export default function AdminUIPreviewsPage() {
  const sceneCount = PREVIEW_SCENES.length;
  const scenarioCount = PREVIEW_SCENES.reduce(
    (total, scene) => total + scene.scenarios.length,
    0,
  );

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">UI Previews</h1>
        <p className="max-w-prose text-muted-foreground">
          Full-page preview scenes: one fixture-driven page each, served at{" "}
          <code>/preview/{"{surface}"}/{"{scenario}"}</code> inside the same
          header / sidebar / footer shell the real route composes, with no network
          calls behind it. Scenes render the <em>same</em> page body the live
          route renders (or the draft body that will replace it), so they
          can&rsquo;t drift into a parallel design. Pure-UI interactions work
          against local state; anything that would hit a backend renders its real
          state with the action inert.
        </p>
        <p className="text-sm text-muted-foreground">
          {sceneCount} scenes, {scenarioCount} scenarios &mdash; generated from
          the scene registry, so a new scene appears here on its own.
        </p>
      </div>

      <div className="space-y-6">
        {SCENES.map((scene) => (
          <section
            key={scene.surface}
            className="space-y-3 rounded-lg border p-6"
          >
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{scene.title}</h2>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {scene.chrome} chrome &middot;{" "}
                <code>/preview/{scene.surface}</code>
              </p>
            </div>
            <p className="max-w-prose text-sm text-muted-foreground">
              {scene.description}
            </p>
            {/* Two shapes on purpose. A scene whose scenarios each say what
                they uniquely show gets a list with room to say it; a scene
                enumerating one axis (every state of a panel) gets the compact
                row of links, because a description per link there would be the
                label again with more words. */}
            {scene.scenarios.some((s) => s.description !== undefined) ? (
              <ul className="space-y-3">
                {scene.scenarios.map((scenario) => (
                  <li key={scenario.slug} className="flex flex-col gap-1.5">
                    <a
                      href={previewSceneHref(scene.surface, scenario.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "self-start",
                      })}
                    >
                      {scenario.label} &rarr;
                    </a>
                    {scenario.description !== undefined && (
                      <p className="max-w-prose text-sm text-muted-foreground">
                        {scenario.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-wrap gap-2">
                {scene.scenarios.map((scenario) => (
                  <a
                    key={scenario.slug}
                    href={previewSceneHref(scene.surface, scenario.slug)}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    {scenario.label} &rarr;
                  </a>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
