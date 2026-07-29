export { LocationsService } from "./locations.service";
export type { LocationCodeRef, SiteWithChain } from "./locations.service";
export {
  locationKeys,
  useAllLocations,
  useLocation,
  useMunicipalitiesByCountry,
  useSites,
  useSitesByParent,
  useLocationsByIds,
  useLocationsByCodes,
  useCreateLocation,
  useMaterializeLocation,
  useUpdateLocation,
} from "./locations.queries";
export type { MaterializeLocationBody } from "./locations.contracts";
