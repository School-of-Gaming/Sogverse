/**
 * The chat components — presentational, transport-free, and shared by every
 * surface that will ever show a chat.
 *
 * See `./CLAUDE.md` for the contract these hold to and why.
 */

export { ChatView, type ChatViewHandlers } from "./ChatView";
export { ChatMessageList, type ChatLogHandlers } from "./ChatMessageList";
export { ChatComposer } from "./ChatComposer";
export { ChatMessageRow } from "./ChatMessageRow";
export { ChatTombstone } from "./ChatTombstone";
export { ChatQuotedMessage, ChatReplyStrip } from "./ChatReply";
export { ChatDeliveryNote } from "./ChatDeliveryNote";
export { ChatReactionRow, ChatReactionPicker } from "./ChatReactionRow";
export { ChatImageRun } from "./ChatImageRun";
export { ChatBodyText } from "./ChatBodyText";

export {
  deriveChatComposerCapabilities,
  deriveChatMessageCapabilities,
  isChatModerator,
  type ChatComposerCapabilities,
  type ChatMessageCapabilities,
  type ChatViewerState,
} from "./capabilities";
export {
  chatBodyMentions,
  chatBodyPlainText,
  chatMentionIds,
  chatMentionToken,
  parseChatBody,
  resolveChatMentions,
  type ChatBodySegment,
} from "./chat-body";
export {
  groupChatMessages,
  type ChatGroupItem,
  type ChatMessageGroup,
} from "./chat-grouping";
export {
  tallyChatReactions,
  toggleChatReaction,
  type ChatReactionTally,
} from "./chat-reactions";
export {
  chatSendIsEmpty,
  fanOutChatSend,
  stageChatImages,
  type ChatSendDraft,
  type ChatStagingResult,
  type StagedChatImage,
} from "./composer-staging";
export { readStagedChatImage, readStagedChatImages } from "./stage-files";
export type {
  ChatAccount,
  ChatDelivery,
  ChatImageRef,
  ChatMessage,
  ChatReactionEntry,
  ChatRole,
} from "./types";
