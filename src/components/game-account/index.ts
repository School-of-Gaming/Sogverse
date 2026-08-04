export {
  GAME_PLATFORMS,
  gameFigureHeight,
  gameAccountStatus,
  useVerifyGameAccount,
  type GameAccountExternalId,
  type GameAccountStatus,
  type GameAvatarModel,
  type GameFigure,
  type GameFigureModel,
  type GamePlatform,
  type GamePlatformDescriptor,
  type VerifiedGameAccount,
} from "./platforms";
// Two components, and between them every way a game identity is ever shown:
// the row when it is only being read, the editable row when it is being set for
// the first time *or* changed. `GameAvatarBox` is shared between the two but
// stays internal to the directory — it is a piece of one row, not a variant.
export { GameUsernameRow } from "./game-username-row";
export {
  GameUsernameEditableRow,
  type CommittedGameAccount,
} from "./game-username-editable-row";
