import type { TypecheckConfig } from "../../scripts/typecheck-docs/config";

const config: TypecheckConfig = {
  lang: "ts",
  sdkPackage: "@photon-ai/advanced-imessage",
  importPreamble: `
import type {
  AdvancedIMessage,
  ChatGuid,
  MessageGuid,
  AttachmentGuid,
  ScheduledMessageId,
  Chat,
  Message,
  AttachmentInfo,
  StreamedDownload,
  SendReceipt,
  CommandReceipt,
  ScheduledMessage,
  ScheduledMessageStatus,
  AddressInfo,
  ChatServiceType,
  TransferState,
  StickerPlacement,
  BackgroundInfo,
  TextFormatInput,
} from "@photon-ai/advanced-imessage";

import {
  createClient,
  directChat,
  groupChat,
  parseChatGuid,
  MessageBuilder,
  MessageEffect,
  TextEffect,
  Reaction,
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
declare const chat: ChatGuid;
declare const chatGuid: ChatGuid;
declare const messageGuid: MessageGuid;
declare const someMessageGuid: MessageGuid;
declare const someGuid: MessageGuid;
declare const guid: any;
declare const attachmentGuid: AttachmentGuid;
declare const scheduledMessageId: ScheduledMessageId;
declare const imageBytes: Uint8Array;
declare const videoBytes: Uint8Array;
declare let token: string;
declare const err: unknown;
declare function sleep(ms: number): Promise<void>;
declare function refreshToken(): Promise<string>;
declare function process(...args: any[]): void;
`.trim(),
};

export default config;
