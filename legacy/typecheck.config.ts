import type { TypecheckConfig } from "../scripts/typecheck-docs/config";

const config: TypecheckConfig = {
  lang: "ts",
  sdkPackage: "@photon-ai/advanced-imessage-kit",
  importPreamble: `
import { SDK } from "@photon-ai/advanced-imessage-kit";
`.trim(),
  declarePreamble: `
declare const sdk: ReturnType<typeof SDK>;
declare const tomorrow9am: Date;
`.trim(),
};

export default config;
