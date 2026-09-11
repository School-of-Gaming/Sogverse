/**
 * Link target for one preview scene × scenario pair.
 *
 * It lives in its own module, apart from the scene registry, because scene
 * fixtures need to build preview links (a dashboard card pointing at the
 * product-page scene) while the registry needs to read those fixtures' scenario
 * lists — importing the whole registry from a fixture would close that loop.
 */
export function previewSceneHref(surface: string, scenario: string) {
  return {
    pathname: "/preview/[surface]/[scenario]",
    params: { surface, scenario },
  } as const;
}

/**
 * The same target as a plain string, for the admin index's `target="_blank"`
 * anchors — a real `<a>` rather than a routed link, because a scene is opened
 * beside the page listing it. It carries no locale prefix, so it takes the one
 * proxy hop every bare path takes.
 */
export function previewScenePath(surface: string, scenario: string): string {
  return `/preview/${surface}/${scenario}`;
}
