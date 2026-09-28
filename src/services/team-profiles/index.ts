// The barrel carries the React Query hooks, which are a browser module: a
// Server Component imports the service and the types from their own modules.
export { TeamProfilesService } from "./team-profiles.service";
export {
  teamProfileKeys,
  useTeamProfile,
  useSaveOwnTeamProfile,
  useSaveGeduTeamProfile,
  useSetGeduTeamProfileApproval,
} from "./team-profiles.queries";
export * from "./team-profiles.types";
export { saveTeamProfileResult } from "./team-profiles.contracts";
