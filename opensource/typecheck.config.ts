import type { TypecheckConfig } from '../scripts/typecheck-docs/config'

const config: TypecheckConfig = {
  lang: 'ts',
  sdkPackage: '@photon-ai/imessage-kit',
  importPreamble: `
import {
  IMessageSDK,
  MessageScheduler,
  Reminders,
  IMessageError,
  ConfigError,
  DatabaseError,
  PlatformError,
  SendError,
  WebhookError,
  loggerPlugin,
  definePlugin,
  attachmentExists,
  downloadAttachment,
  getAttachmentExtension,
  getAttachmentMetadata,
  getAttachmentSize,
  isAudioAttachment,
  isImageAttachment,
  isVideoAttachment,
  readAttachment,
} from "@photon-ai/imessage-kit";
import type { Attachment, Message } from "@photon-ai/imessage-kit";
`.trim(),
  declarePreamble: `
declare const sdk: IMessageSDK;
declare const scheduler: MessageScheduler;
declare const reminders: Reminders;
declare const msg: Message;
declare const attachment: Attachment;
`.trim(),
}

export default config
