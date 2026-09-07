import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'

test('expands source groups inside API Reference without moving other groups', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'docs-nav-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  function json(path: string, value: unknown) {
    const output = join(root, path)
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, JSON.stringify(value))
  }

  json('package.json', { type: 'module' })
  json('scripts/sources.json', { sources: [{ name: 'fusor-ws', mount: 'websocket' }] })
  const groups = [
    { group: 'WebSocket protocol', pages: ['websocket/index', 'websocket/connect'] },
    { group: 'Frame reference', pages: ['websocket/frames'] },
  ]
  json('.vellum-src/.nav/websocket.json', { source: 'fusor-ws', groups })
  const endpoints = { group: 'Endpoints', openapi: { source: 'https://example.com/openapi.json' } }
  json('docs.base.json', {
    navigation: {
      tabs: [{
        tab: 'API Reference',
        groups: [
          { group: 'WebSocket', pages: groups.map(({ group }) => ({ $source: 'fusor-ws', group })) },
          endpoints,
        ],
      }],
    },
  })
  const script = join(root, 'scripts/build-nav/index.ts')
  mkdirSync(dirname(script), { recursive: true })
  copyFileSync(new URL('./index.ts', import.meta.url), script)
  execFileSync(process.execPath, [script], { cwd: root })
  const output = JSON.parse(readFileSync(join(root, 'docs.json'), 'utf8'))
  assert.deepEqual(output.navigation.tabs[0].groups, [
    { group: 'WebSocket', pages: groups },
    endpoints,
  ])
  assert.ok(!JSON.stringify(output).includes('$source'))
})
