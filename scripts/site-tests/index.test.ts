import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'

test('syncs a rendered version, resolves navigation and redirects, and exports both versions without collisions', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'combined-docs-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  function file(path: string, content: string) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  function json(path: string, value: unknown) {
    file(path, JSON.stringify(value))
  }
  for (const name of ['sync-docs', 'build-nav', 'llms-generator']) {
    mkdirSync(join(root, 'scripts', name), { recursive: true })
    copyFileSync(new URL(`../${name}/index.ts`, import.meta.url), join(root, 'scripts', name, 'index.ts'))
  }
  json('package.json', { type: 'module' })
  json('scripts/sources.json', { sources: [{ name: 'docs-v2', mount: 'v2', local: 'export', format: 'rendered' }] })
  const redirects = [{ source: '/problems/rate-limited', destination: '/v2/problems/catalog#rate-limited' }]
  json('export/nav.json', {
    source: 'docs-v2',
    tabs: [{ tab: 'CLI', groups: [{ group: 'Start', pages: ['v2/cli'] }] }, {
      tab: 'API Reference',
      anchors: [{ anchor: 'WebSocket', groups: [{ group: 'Start', pages: ['v2/websocket'] }] }],
    }],
    redirects,
  })
  const page = (title: string, body: string) => `---\ntitle: ${title}\ndescription: ${title}\n---\n\n${body}\n`
  file('cli.mdx', page('Old CLI', 'V1_ONLY'))
  file('export/cli.mdx', page('New CLI', 'V2_ONLY'))
  file('export/websocket.mdx', page('WebSocket', 'WEBSOCKET_ONLY'))
  file('export/asyncapi/events.yaml', 'asyncapi: 3.0.0\n')
  file('v2/stale.mdx', 'obsolete generated page')
  json('docs.base.json', { name: 'Photon', navigation: { versions: [
    { version: 'Maintain', default: true, tabs: [{ tab: 'CLI', groups: [{ group: 'Start', pages: ['cli'] }] }] },
    { version: 'Beta', tabs: [{ $source: 'docs-v2' }] },
  ] } })
  const run = (name: string) => execFileSync(process.execPath, [join(root, 'scripts', name, 'index.ts')], {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, DOCS_SOURCE_MODE: 'local' },
  })
  run('sync-docs')
  run('build-nav')
  run('llms-generator')
  const config = JSON.parse(readFileSync(join(root, 'docs.json'), 'utf8'))
  assert.deepEqual(config.redirects, redirects)
  assert.equal(config.navigation.versions[1].tabs[1].anchors[0].anchor, 'WebSocket')
  assert.ok(config.navigation.versions.every((version: object) => !('href' in version)))
  assert.equal(readFileSync(join(root, 'v2/asyncapi/events.yaml'), 'utf8'), 'asyncapi: 3.0.0\n')
  assert.throws(() => readFileSync(join(root, 'v2/stale.mdx')))
  assert.match(readFileSync(join(root, 'llms-cli.txt'), 'utf8'), /V1_ONLY/)
  assert.match(readFileSync(join(root, 'llms-beta-cli.txt'), 'utf8'), /V2_ONLY/)
  assert.match(readFileSync(join(root, 'llms-beta-api-reference.txt'), 'utf8'), /WEBSOCKET_ONLY/)
  const full = readFileSync(join(root, 'llms-full.txt'), 'utf8')
  for (const marker of ['V1_ONLY', 'V2_ONLY', 'WEBSOCKET_ONLY'])
    assert.equal(full.split(marker).length - 1, 1)

  json('scripts/sources.json', { sources: [{ name: 'bad', mount: '.', local: 'export', format: 'rendered' }] })
  assert.throws(() => run('sync-docs'), /rendered mount must stay inside the site root/)
  assert.match(readFileSync(join(root, 'cli.mdx'), 'utf8'), /V1_ONLY/)
})
