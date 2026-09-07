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
  writeFileSync(join(source, 'asyncapi.yaml'), contract)
  const mapping = { 'asyncapi.yaml': 'asyncapi/fusor-v2.yaml' }

  copySourceAssets('fusor-ws', source, site, mapping)
  assert.deepEqual(readFileSync(join(site, mapping['asyncapi.yaml'])), contract)

  const updated = Buffer.concat([contract, Buffer.from('# updated\n')])
  writeFileSync(join(source, 'asyncapi.yaml'), updated)
  copySourceAssets('fusor-ws', source, site, mapping)
  assert.deepEqual(readFileSync(join(site, mapping['asyncapi.yaml'])), updated)
})

test('fails when a declared asset is missing or is a directory', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'docs-assets-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const mapping = { 'asyncapi.yaml': 'asyncapi/fusor-v2.yaml' }
  const copy = () => copySourceAssets('fusor-ws', root, join(root, 'site'), mapping)

  assert.throws(copy, /source "fusor-ws": asset file is missing or not a file \(asyncapi.yaml\)/)
  mkdirSync(join(root, 'asyncapi.yaml'))
  assert.throws(copy, /asset file is missing or not a file/)
})

test('rejects absolute paths and paths outside the source or site root', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'docs-assets-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(join(root, 'asyncapi.yaml'), 'asyncapi: 3.0.0\n')

  const mappings: Record<string, string>[] = [
    { '../asyncapi.yaml': 'asyncapi/fusor-v2.yaml' },
    { [join(root, 'asyncapi.yaml')]: 'asyncapi/fusor-v2.yaml' },
    { 'asyncapi.yaml': '../outside.yaml' },
    { 'asyncapi.yaml': join(root, 'outside.yaml') },
    { 'asyncapi.yaml': '.' },
  ]
  for (const mapping of mappings) {
    assert.throws(
      () => copySourceAssets('fusor-ws', root, join(root, 'site'), mapping),
      /asset path must stay within its root/,
    )
  }
})
