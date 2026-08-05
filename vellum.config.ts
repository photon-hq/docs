import type { VellumConfig } from '@vellum-docs/core'
import { NunjucksEngine } from '@vellum-docs/engine-nunjucks'
import { TypeScriptExtractor } from '@vellum-docs/extractor-typescript'
import { MintlifyProfile } from '@vellum-docs/profile-mintlify'

const config: VellumConfig = {
  root: new URL('.', import.meta.url).pathname,
  sources: {
    ts: {
      include: [],
      packages: [
        '@photon-ai/advanced-imessage',
        '@photon-ai/imessage-kit',
        '@photon-ai/whatsapp-business',
        'chat',
        'eve/channels/photon',
        'spectrum-ts',
      ],
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
