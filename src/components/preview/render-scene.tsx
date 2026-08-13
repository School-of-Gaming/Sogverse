import { notFound } from "next/navigation";
import { isFamilyProductScenario } from "@/components/family/product-page/mock-fixtures";
import { isGamerDashboardScenario } from "@/components/gamer/mock-dashboard-fixtures";
import { isGeduDashboardScenario } from "@/components/gedu/mock-dashboard-fixtures";
import { isGeduProductScenario } from "@/components/gedu/session-details/mock-product-page-fixtures";
import { isParentDashboardScenario } from "@/components/parent/mock-dashboard-fixtures";
import {
  findConfirmationNotice,
  isPreviewScenario,
  isShopBrowseScenario,
} from "@/components/public/products/mock-detail-fixtures";
import { isLongDescriptionScenario } from "@/components/public/products/mock-long-description-fixtures";
import { PurchaseConfirmationNotice } from "@/components/public/products/purchase-confirmation-view";
import type { PreviewSurface } from "./scenes";
import { FamilyProductPageScene } from "./scenes/family-product-page-scene";
import { GamerDashboardScene } from "./scenes/gamer-dashboard-scene";
import { GeduDashboardScene } from "./scenes/gedu-dashboard-scene";
import { ParentDashboardScene } from "./scenes/parent-dashboard-scene";
import { GeduProductPageScene } from "./scenes/gedu-product-page-scene";
import { ProductDetailScene } from "./scenes/product-detail-scene";
import { ProductLongDescriptionScene } from "./scenes/product-long-description-scene";
import { PurchaseConfirmationScene } from "./scenes/purchase-confirmation-scene";
import { ShopBrowseScene } from "./scenes/shop-browse-scene";

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
  shop: (scenario) => {
    if (!isShopBrowseScenario(scenario)) notFound();
    return <ShopBrowseScene scenario={scenario} />;
  },
  products: (scenario) => {
    if (!isPreviewScenario(scenario)) notFound();
    return <ProductDetailScene scenario={scenario} />;
  },
  "product-long-description": (scenario) => {
    if (!isLongDescriptionScenario(scenario)) notFound();
    return <ProductLongDescriptionScene />;
  },
  confirmation: (scenario) => {
    // The paid no-order states need no fixture — the notice component takes
    // only which state it is — so they mount directly rather than through the
    // fixture-building scene.
    const notice = findConfirmationNotice(scenario);
    if (notice) return <PurchaseConfirmationNotice kind={notice.kind} />;
    if (!isPreviewScenario(scenario)) notFound();
    return <PurchaseConfirmationScene scenario={scenario} />;
  },
  "parent-dashboard": (scenario) => {
    if (!isParentDashboardScenario(scenario)) notFound();
    return <ParentDashboardScene scenario={scenario} />;
  },
  "gamer-dashboard": (scenario) => {
    if (!isGamerDashboardScenario(scenario)) notFound();
    return <GamerDashboardScene scenario={scenario} />;
  },
  "gedu-dashboard": (scenario) => {
    if (!isGeduDashboardScenario(scenario)) notFound();
    return <GeduDashboardScene scenario={scenario} />;
  },
  "gedu-product": (scenario) => {
    if (!isGeduProductScenario(scenario)) notFound();
    return <GeduProductPageScene scenario={scenario} />;
  },
  // Two surfaces, one body and one set of fixtures. The audience is the whole
  // difference between them, which is exactly what the pair of scenes is for:
  // opening both in adjacent tabs is how you check that the gamer's copy is the
  // parent's minus attendance and nothing else has quietly drifted.
  "parent-club": (scenario) => {
    if (!isFamilyProductScenario(scenario)) notFound();
    return <FamilyProductPageScene audience="customer" scenario={scenario} />;
  },
  "gamer-club": (scenario) => {
    if (!isFamilyProductScenario(scenario)) notFound();
    return <FamilyProductPageScene audience="gamer" scenario={scenario} />;
  },
};

export function renderPreviewScene(
  surface: PreviewSurface,
  scenario: string,
): React.ReactNode {
  return SCENE_RENDERERS[surface](scenario);
}
