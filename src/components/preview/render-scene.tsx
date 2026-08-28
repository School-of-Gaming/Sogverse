import { notFound } from "next/navigation";
import { isAdminDashboardScenario } from "@/components/admin/dashboard/mock-dashboard-fixtures";
import { isFamilyProductScenario } from "@/components/family/product-page/mock-fixtures";
import { isGamerDashboardScenario } from "@/components/gamer/mock-dashboard-fixtures";
import { isGeduContractScenario } from "@/components/gedu/contract/mock-contract-fixtures";
import { isGeduDashboardScenario } from "@/components/gedu/mock-dashboard-fixtures";
import { isGroupWorkspaceScenario } from "@/components/group-workspace/mock-workspace-fixtures";
import { isParentDashboardScenario } from "@/components/parent/mock-dashboard-fixtures";
import { isSeatOfferScenario } from "@/components/seat-offer/mock-seat-offer-fixtures";
import { isVoiceRoomScenario } from "@/components/voice/mock-room-fixtures";
import {
  findConfirmationNotice,
  isPreviewScenario,
  isShopBrowseScenario,
} from "@/components/public/products/mock-detail-fixtures";
import { PurchaseConfirmationNotice } from "@/components/public/products/purchase-confirmation-view";
import {
  REGION_LOCK_BASE_SCENARIO,
  findRegionLockScenario,
} from "@/components/public/products/region-lock/region-lock-scenarios";
import {
  REQUIRED_CONSENTS_SCENARIO,
  // TEMP — strip before merge.
  REQUIRED_CONSENTS_TALL_SCENARIO,
} from "@/components/public/products/required-consents-scenario";
import type { PreviewSurface } from "./scenes";
import { AdminDashboardScene } from "./scenes/admin-dashboard-scene";
import { FamilyProductPageScene } from "./scenes/family-product-page-scene";
import { GamerDashboardScene } from "./scenes/gamer-dashboard-scene";
import { GeduContractScene } from "./scenes/gedu-contract-scene";
import { GeduDashboardScene } from "./scenes/gedu-dashboard-scene";
import { ParentDashboardScene } from "./scenes/parent-dashboard-scene";
import { GeduProductPageScene } from "./scenes/gedu-product-page-scene";
import { ProductDetailScene } from "./scenes/product-detail-scene";
import { PurchaseConfirmationScene } from "./scenes/purchase-confirmation-scene";
import { SeatOfferScene } from "./scenes/seat-offer-scene";
import { ShopBrowseScene } from "./scenes/shop-browse-scene";
import { VoiceRoomScene } from "./scenes/voice-room-scene";

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
    // Checked and not handed on: there is one storefront grid, so the scene
    // body branches on nothing. The check still belongs here — it is what makes
    // a slug the registry does not declare 404 rather than render the grid
    // under a made-up name.
    if (!isShopBrowseScenario(scenario)) notFound();
    return <ShopBrowseScene />;
  },
  products: (scenario) => {
    // The region-lock scenarios are this page under a lock, so they go through
    // the same scene — they share the surface but not its fixtures, rendering
    // one club fixture with the gate as the only thing that varies.
    const regionLock = findRegionLockScenario(scenario);
    if (regionLock) {
      return (
        <ProductDetailScene
          scenario={REGION_LOCK_BASE_SCENARIO}
          regionLock={regionLock}
        />
      );
    }
    // Same page again, on a product that attaches conditions to a seat. Like
    // the region-lock trio it shares the surface but not the fixtures: one club
    // fixture, with the requirement set as the only thing that varies.
    if (scenario === REQUIRED_CONSENTS_SCENARIO.slug) {
      return (
        <ProductDetailScene
          scenario={REQUIRED_CONSENTS_SCENARIO.baseScenario}
          requiredConsentSlugs={REQUIRED_CONSENTS_SCENARIO.documentSlugs}
        />
      );
    }
    // TEMP — strip before merge. The same page with extra fake consent rows
    // inside the panel, so the sticky rail's two-end clamp can be judged by
    // scrolling a panel that is taller than the window.
    if (scenario === REQUIRED_CONSENTS_TALL_SCENARIO.slug) {
      return (
        <ProductDetailScene
          scenario={REQUIRED_CONSENTS_TALL_SCENARIO.baseScenario}
          requiredConsentSlugs={REQUIRED_CONSENTS_TALL_SCENARIO.documentSlugs}
          fillerConsents={REQUIRED_CONSENTS_TALL_SCENARIO.fillerConsentLabels}
        />
      );
    }
    if (!isPreviewScenario(scenario)) notFound();
    return <ProductDetailScene scenario={scenario} />;
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
  "gedu-contract": (scenario) => {
    if (!isGeduContractScenario(scenario)) notFound();
    return <GeduContractScene scenario={scenario} />;
  },
  "gedu-product": (scenario) => {
    if (!isGroupWorkspaceScenario(scenario)) notFound();
    return <GeduProductPageScene scenario={scenario} />;
  },
  "voice-room": (scenario) => {
    if (!isVoiceRoomScenario(scenario)) notFound();
    return <VoiceRoomScene scenario={scenario} />;
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
  "seat-offer": (scenario) => {
    if (!isSeatOfferScenario(scenario)) notFound();
    return <SeatOfferScene scenario={scenario} />;
  },
  "admin-dashboard": (scenario) => {
    if (!isAdminDashboardScenario(scenario)) notFound();
    return <AdminDashboardScene scenario={scenario} />;
  },
};

export function renderPreviewScene(
  surface: PreviewSurface,
  scenario: string,
): React.ReactNode {
  return SCENE_RENDERERS[surface](scenario);
}
