import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { copySourceAssets } from './assets'

test('copies a contract verbatim and replaces an older generated asset', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'docs-assets-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const source = join(root, 'source')
  const site = join(root, 'site')
  mkdirSync(source)
  const contract = Buffer.from('# Keep comments and line endings\r\nasyncapi: 3.0.0\r\n')
  writeFileSync(join(source, 'event-delivery-websocket.yaml'), contract)
  const mapping = { 'event-delivery-websocket.yaml': 'asyncapi/event-delivery-websocket.yaml' }

  copySourceAssets('fusor-ws', source, site, mapping)
  assert.deepEqual(readFileSync(join(site, mapping['event-delivery-websocket.yaml'])), contract)

  const updated = Buffer.concat([contract, Buffer.from('# updated\n')])
  writeFileSync(join(source, 'event-delivery-websocket.yaml'), updated)
  copySourceAssets('fusor-ws', source, site, mapping)
  assert.deepEqual(readFileSync(join(site, mapping['event-delivery-websocket.yaml'])), updated)
})

test('fails when a declared asset is missing or is a directory', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'docs-assets-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const mapping = { 'event-delivery-websocket.yaml': 'asyncapi/event-delivery-websocket.yaml' }
  const copy = () => copySourceAssets('fusor-ws', root, join(root, 'site'), mapping)

  assert.throws(copy, /source "fusor-ws": asset file is missing or not a file \(event-delivery-websocket.yaml\)/)
  mkdirSync(join(root, 'event-delivery-websocket.yaml'))
  assert.throws(copy, /asset file is missing or not a file/)
})

test('rejects absolute paths and paths outside the source or site root', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'docs-assets-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(join(root, 'event-delivery-websocket.yaml'), 'asyncapi: 3.0.0\n')

  const mappings: Record<string, string>[] = [
    { '../event-delivery-websocket.yaml': 'asyncapi/event-delivery-websocket.yaml' },
    { [join(root, 'event-delivery-websocket.yaml')]: 'asyncapi/event-delivery-websocket.yaml' },
    { 'event-delivery-websocket.yaml': '../outside.yaml' },
    { 'event-delivery-websocket.yaml': join(root, 'outside.yaml') },
    { 'event-delivery-websocket.yaml': '.' },
  ]
  for (const mapping of mappings) {
    assert.throws(
      () => copySourceAssets('fusor-ws', root, join(root, 'site'), mapping),
      /asset path must stay within its root/,
    )
  }
})
