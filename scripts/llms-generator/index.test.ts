import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'

test('exports groups and anchored API content without losing or duplicating pages', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'docs-llms-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  function file(path: string, content: string) {
    const output = join(root, path)
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, content)
  }

  file('package.json', JSON.stringify({ type: 'module' }))
  file('docs.json', JSON.stringify({
    name: 'Photon',
    navigation: {
      tabs: [
        { tab: 'Overview', groups: [{ group: 'Get started', pages: ['index'] }] },
        {
          tab: 'API Reference',
          anchors: [
            {
              anchor: 'API Endpoints',
              groups: [
                { group: 'Get started', pages: ['api-reference/index'] },
                { group: 'Endpoints', openapi: { source: 'https://example.com/openapi.json' } },
              ],
            },
            {
              anchor: 'WebSocket',
              groups: [{ group: 'Frame reference', pages: ['websocket/frames'] }],
            },
          ],
        },
      ],
    },
  }))
  for (const [slug, title, content] of [
    ['index', 'Welcome', 'OVERVIEW_CONTENT'],
    ['api-reference/index', 'API introduction', 'REST_CONTENT'],
    ['websocket/frames', 'Frame reference', 'WEBSOCKET_CONTENT'],
  ]) {
    file(`${slug}.mdx`, `---\ntitle: ${title}\ndescription: ${title}\n---\n\n${content}\n`)
  }
  const script = join(root, 'scripts/llms-generator/index.ts')
  mkdirSync(dirname(script), { recursive: true })
  copyFileSync(new URL('./index.ts', import.meta.url), script)
  execFileSync(process.execPath, [script], { cwd: root })

  const api = readFileSync(join(root, 'llms-api-reference.txt'), 'utf8')
  assert.match(api, /## API Endpoints\n/)
  assert.match(api, /## WebSocket\n/)
  assert.match(api, /REST_CONTENT/)
  assert.match(api, /WEBSOCKET_CONTENT/)
  assert.match(api, /OpenAPI specification: <https:\/\/example.com\/openapi.json>/)
  const index = readFileSync(join(root, 'llms.txt'), 'utf8')
  assert.match(index, /\[API introduction\].*\/api-reference\/index/)
  assert.match(index, /\[Frame reference\].*\/websocket\/frames/)
  const full = readFileSync(join(root, 'llms-full.txt'), 'utf8')
  for (const marker of ['OVERVIEW_CONTENT', 'REST_CONTENT', 'WEBSOCKET_CONTENT'])
    assert.equal(full.split(marker).length - 1, 1, marker)
})
