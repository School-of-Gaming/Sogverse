/**
 * A statically imported image, as Next's bundler hands it to `next/image`: an
 * object carrying the file's intrinsic size beside its URL.
 *
 * Vite resolves the same import to a bare URL string, and `next/image` given a
 * string needs both dimensions spelled out — so a component that sizes a
 * static import by its height alone, letting the width follow the file's
 * proportions, throws under Vitest while working in the app. A test rendering
 * one mocks the import with this module body:
 *
 *   vi.mock("@/assets/…/mark.svg", () => staticImageModule("/mark.svg", 127, 96));
 *
 * As with the other factories here, the `vi.mock` call stays in the test file
 * (Vitest hoists it), and this file's import must come before any import that
 * pulls the mocked asset in.
 */
export function staticImageModule(src: string, width: number, height: number) {
  return { default: { src, width, height } };
}
