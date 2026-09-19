import type { VellumConfig } from '@vellum-docs/core'
import { fileURLToPath } from 'node:url'
import { NunjucksEngine } from '@vellum-docs/engine-nunjucks'
import { TypeScriptExtractor } from '@vellum-docs/extractor-typescript'
import { MintlifyProfile } from '@vellum-docs/profile-mintlify'

const config: VellumConfig = {
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Packages are added alongside the source that needs their type symbols.
  sources: {
    ts: {
      include: [],
      packages: [],
    },
  },
  templates: '.vellum-src',
  outDir: '.',
  extractors: [new TypeScriptExtractor()],
  // Preserve 0.2 behavior until every synced template is strict-safe.
  engine: new NunjucksEngine({ strict: false }),
  profile: new MintlifyProfile(),
}

export default config
