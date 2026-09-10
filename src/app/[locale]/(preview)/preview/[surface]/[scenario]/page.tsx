import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PreviewChrome } from "@/components/preview/preview-chrome";
import { renderPreviewScene } from "@/components/preview/render-scene";
import {
  PREVIEW_TOPIC_PARAM,
  findPreviewScene,
  parsePreviewTopic,
  sceneHasScenario,
} from "@/components/preview/scenes";

/**
 * The one route behind every full-page preview scene.
 *
 * Fully fixture-driven — no DB calls, nothing to leak — and admin-only: the
 * proxy gates `/preview/*` on the admin role, so every future scene is covered
 * with no new code. Never indexed. Links live on `/admin/ui-previews`.
 *
 * Unknown surface or a scenario the scene doesn't declare 404s, so a stale link
 * fails loudly instead of rendering an empty shell.
 *
 * `?topic=` is the one search param a scene may read: an override of the topic
 * the fixture carries, for the surfaces whose cards are decided by it. It is
 * parsed against the enum here and an unusable value simply reads as absent —
 * the slug in the path is what has to resolve, and a lens over a page is not
 * grounds for taking the page away.
 */
interface PageProps {
  params: Promise<{ surface: string; scenario: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PreviewScenePage({
  params,
  searchParams,
}: PageProps) {
  const { surface, scenario } = await params;
  const query = await searchParams;

  const scene = findPreviewScene(surface);
  if (!scene || !sceneHasScenario(scene, scenario)) {
    notFound();
  }

  return (
    <PreviewChrome chrome={scene.chrome}>
      {renderPreviewScene(scene.surface, scenario, {
        topic: parsePreviewTopic(query[PREVIEW_TOPIC_PARAM]),
      })}
    </PreviewChrome>
  );
}
