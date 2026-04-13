import type { VellumConfig } from '@vellum-docs/core'
import { NunjucksEngine } from '@vellum-docs/engine-nunjucks'
import { TypeScriptExtractor } from '@vellum-docs/extractor-typescript'
import { MintlifyProfile } from '@vellum-docs/profile-mintlify'

const config: VellumConfig = {
  root: new URL('.', import.meta.url).pathname,
  sources: {
    ts: { include: [], packages: ['@photon-ai/advanced-imessage'] },
  },
  templates: 'docs-src',
  outDir: '.',
  extractors: [new TypeScriptExtractor()],
  engine: new NunjucksEngine(),
  profile: new MintlifyProfile(),
}

export default config
