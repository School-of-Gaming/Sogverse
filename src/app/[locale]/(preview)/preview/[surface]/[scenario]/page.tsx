import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PreviewChrome } from "@/components/preview/preview-chrome";
import { renderPreviewScene } from "@/components/preview/render-scene";
import { findPreviewScene, sceneHasScenario } from "@/components/preview/scenes";

/**
 * The one route behind every full-page preview scene.
 *
 * Fully fixture-driven — no DB calls, nothing to leak — and admin-only: the
 * proxy gates `/preview/*` on the admin role, so every future scene is covered
 * with no new code. Never indexed. Links live on `/admin/ui-previews`.
 *
 * Unknown surface or a scenario the scene doesn't declare 404s, so a stale link
 * fails loudly instead of rendering an empty shell.
 */
interface PageProps {
  params: Promise<{ surface: string; scenario: string }>;
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PreviewScenePage({ params }: PageProps) {
  const { surface, scenario } = await params;

  const scene = findPreviewScene(surface);
  if (!scene || !sceneHasScenario(scene, scenario)) {
    notFound();
  }

  return (
    <PreviewChrome chrome={scene.chrome}>
      {renderPreviewScene(scene.surface, scenario)}
    </PreviewChrome>
  );
}
