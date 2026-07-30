import { notFound } from "next/navigation";
import { isPreviewScenario } from "@/components/public/products/mock-detail-fixtures";
import type { PreviewSurface } from "./scenes";
import { ProductDetailScene } from "./scenes/product-detail-scene";
import { PurchaseConfirmationScene } from "./scenes/purchase-confirmation-scene";

/**
 * What each scene renders for a given scenario.
 *
 * Keyed by `PreviewSurface`, so a scene added to the registry with no render
 * here is a compile error rather than a blank page. Kept apart from the
 * registry itself so importing the scene *list* (the style guide does) doesn't
 * pull every scene's component tree into that bundle.
 *
 * Each entry narrows the scenario slug to whatever its own fixtures accept. The
 * route has already checked the slug against the registry, so a failure here
 * means the registry and the fixtures have drifted — a 404 is the honest
 * answer, not a half-rendered page.
 */
const SCENE_RENDERERS: Record<
  PreviewSurface,
  (scenario: string) => React.ReactNode
> = {
  products: (scenario) => {
    if (!isPreviewScenario(scenario)) notFound();
    return <ProductDetailScene scenario={scenario} />;
  },
  confirmation: (scenario) => {
    if (!isPreviewScenario(scenario)) notFound();
    return <PurchaseConfirmationScene scenario={scenario} />;
  },
};

export function renderPreviewScene(
  surface: PreviewSurface,
  scenario: string,
): React.ReactNode {
  return SCENE_RENDERERS[surface](scenario);
}
