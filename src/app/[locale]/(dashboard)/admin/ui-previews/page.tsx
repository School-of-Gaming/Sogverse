/* eslint-disable i18next/no-literal-string -- internal admin-only index of fixture-driven preview scenes; every string here is scene metadata or an explanation of the mechanism, not user-facing copy that ships in any locale */
import { buttonVariants } from "@/components/ui/button";
import { previewScenePath } from "@/components/preview/href";
import {
  PREVIEW_SCENE_LIST,
  PREVIEW_TOPIC_PARAM,
  type PreviewSceneMeta,
} from "@/components/preview/scenes";
import { PRODUCT_TOPICS, PRODUCT_TOPIC_VALUES } from "@/lib/products/topics";

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
/**
 * The topic axis, as a row of links under a scene that declares it.
 *
 * A topic is not a scenario — it is a value every scenario of these two scenes
 * can be read at — so it gets its own row rather than twelve more entries in
 * the list above it. The links point at the scene's **first** scenario, which
 * the registry defines as the sensible default to open; from there the axis
 * survives the reader switching scenario by hand, and the product page's own
 * CTA carries it across to the confirmation page.
 */
function TopicAxisRow({ scene }: { scene: PreviewSceneMeta }) {
  // Every scene has at least one scenario — the registry test asserts it, and
  // asserts it again for a scene declaring this flag, since an empty list here
  // would be a row of links to nowhere.
  const defaultScenario = scene.scenarios[0];

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        By topic &middot; <code>?{PREVIEW_TOPIC_PARAM}=</code> on{" "}
        <code>{defaultScenario.slug}</code>
      </p>
      <div className="flex flex-wrap gap-2">
        {PRODUCT_TOPIC_VALUES.map((topic) => (
          <a
            key={topic}
            href={`${previewScenePath(scene.surface, defaultScenario.slug)}?${PREVIEW_TOPIC_PARAM}=${topic}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            {PRODUCT_TOPICS[topic].label}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function AdminUIPreviewsPage() {
  const sceneCount = PREVIEW_SCENE_LIST.length;
  const scenarioCount = PREVIEW_SCENE_LIST.reduce(
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
        {PREVIEW_SCENE_LIST.map((scene) => (
          <section
            key={scene.surface}
            className="space-y-3 rounded-lg border border-border p-6"
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
                      href={previewScenePath(scene.surface, scenario.slug)}
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
                    href={previewScenePath(scene.surface, scenario.slug)}
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
            {scene.topicAxis === true && <TopicAxisRow scene={scene} />}
          </section>
        ))}
      </div>
    </div>
  );
}
