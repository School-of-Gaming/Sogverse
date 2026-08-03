/**
 * Link target for one preview scene × scenario pair.
 *
 * It lives in its own module, apart from the scene registry, because scene
 * fixtures need to build preview links (a dashboard card pointing at the
 * product-page scene) while the registry needs to read those fixtures' scenario
 * lists — importing the whole registry from a fixture would close that loop.
 */
export function previewSceneHref(surface: string, scenario: string): string {
  return `/preview/${surface}/${scenario}`;
}
