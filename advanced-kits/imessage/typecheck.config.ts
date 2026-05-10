import type { TypecheckConfig } from '../../scripts/typecheck-docs/config'

const config: TypecheckConfig = {
  lang: 'ts',
  sdkPackage: '@photon-ai/advanced-imessage',
  importPreamble: `
import type {
  AdvancedIMessage,
  Chat,
  Message,
  AttachmentInfo,
  AttachmentInput,
  UploadAttachmentResult,
  DownloadAttachmentChunk,
  CompanionInfo,
  SendOptions,
  MessagePart,
  MessageListFilter,
  MessageListPage,
  SettableMessageReaction,
  EmbeddedMedia,
  ChatServiceType,
  TransferState,
  StickerPlacement,
  TextFormatInput,
  MultiServiceAddressInfo,
  SingleServiceAddressInfo,
  CreateChatOptions,
  CreateChatResult,
  Poll,
  PollOption,
  PollParticipantVote,
  GroupIcon,
  GroupChange,
  SharedFriendLocation,
  SharedFriendLocationUpdated,
  RetryOptions,
  ClientOptions,
  ChatEvent,
  GroupEvent,
  MessageEvent,
  PollEvent,
  CatchUpEvent,
  IdempotencyOptions,
} from "@photon-ai/advanced-imessage";

import {
  createClient,
  MessageEffect,
  TextEffect,
  ErrorCode,
  AuthenticationError,
  ConnectionError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  IMessageError,
} from "@photon-ai/advanced-imessage";
`.trim(),
  declarePreamble: `
declare const im: AdvancedIMessage;
declare const chat: string;
declare const chatGuid: string;
declare const messageGuid: string;
declare const someMessageGuid: string;
declare const someGuid: string;
declare const pollMessageGuid: string;
declare const optionIdentifier: string;
declare const attachmentGuid: string;
declare const imageBytes: Uint8Array;
declare const videoBytes: Uint8Array;
declare let token: string;
declare const err: unknown;
declare const since: number | undefined;
declare const lastHandledSequence: number | undefined;
declare function sleep(ms: number): Promise<void>;
declare function refreshToken(): Promise<string>;
declare function updateMapPin(friend: any): void;
declare function handleEvent(event: unknown): Promise<void>;
declare function saveSequence(sequence: number): Promise<void>;
`.trim(),
}

export default config
