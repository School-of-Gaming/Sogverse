export {
  UsersService,
  type UserSearchResult,
  type VerificationEmailSendOutcome,
} from "./users.service";
export {
  useProfile,
  useUsers,
  useUsersByRole,
  useSearchUsers,
  useUpdateProfile,
  useUpdateUserGameAccount,
  useParentGamerLinks,
  useSendVerificationEmail,
} from "./users.queries";
export {
  adminGameAccountBody,
  adminGameAccountWriteResult,
  type AdminGameAccountBody,
  type AdminGameAccountWriteResult,
} from "./users.contracts";
export {
  registerParentBody,
  type RegisterParentBody,
} from "./parent-registration.contracts";
