import type { TypecheckConfig } from '../../scripts/typecheck-docs/config'

const config: TypecheckConfig = {
  lang: 'ts',
  sdkPackage: '@photon-ai/advanced-imessage',
  importPreamble: `
import type {
  AdvancedIMessage,
  AttachmentInfo,
  Chat,
  LocationRequestReceipt,
  Message,
  MiniAppCardSession,
  MiniAppMessageResult,
  Poll,
  UploadAttachmentResult,
} from "@photon-ai/advanced-imessage";

import {
  AuthenticationError,
  ConnectionError,
  ErrorCode,
  IMessageError,
  MessageEffect,
  NotFoundError,
  RateLimitError,
  TextEffect,
  ValidationError,
  createClient,
} from "@photon-ai/advanced-imessage";
`.trim(),
  declarePreamble: `
declare const im: AdvancedIMessage;
declare const chat: Chat;
declare const group: Chat;
declare const sent: Message;
declare const message: Message;
declare const uploaded: UploadAttachmentResult;
declare const audio: UploadAttachmentResult;
declare const attachment: AttachmentInfo;
declare const poll: Poll;
declare const receipt: LocationRequestReceipt;
declare const lastHandledSequence: number | undefined;
declare const pageToken: string | undefined;
declare const since: number | undefined;
declare const job: { id: string };
declare function readFile(path: string): Promise<Uint8Array>;
declare function updateMap(location: unknown): void;
declare function handleEvent(event: unknown): Promise<void>;
declare function saveSequence(sequence: number): Promise<void>;
`.trim(),
}

export default config
