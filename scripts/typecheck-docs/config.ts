export interface TypecheckConfig {
  /** Language to check: "ts" for TypeScript */
  lang: string;
  /** The npm package name (used for stripping duplicate imports) */
  sdkPackage: string;
  /** Import statements prepended to every output file */
  importPreamble: string;
  /** Ambient variable declarations (declare const, etc.) */
  declarePreamble: string;
}
