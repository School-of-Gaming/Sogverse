// A thin shell over the shared family product page — see
// `src/components/family/product-page/route.tsx` for why there are six of these,
// why the `[id]` is a participation id, and why the proxy needs no change.
export {
  familyProductMetadata as generateMetadata,
  CustomerFamilyProductRoute as default,
} from "@/components/family/product-page/route";
