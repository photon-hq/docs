import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { exportSite, prefixMdx, prefixNavigation } from './index'

test('mounts documentation links, imports, attributes and contracts without rewriting API examples', () => {
  const source = [
    '---',
    'title: Frames',
    'asyncapi: "/asyncapi/events.yaml subscribe"',
    '---',
    '',
    'import { Table } from "/snippets/table.jsx"',
    '',
    '[CLI](/cli#login) and [external](https://example.com/path).',
    '![Image](/images/example.png)',
    '[Reference][ref]',
    '',
    '[ref]: /api-reference?tab=example',
    '',
    '<Card href="/websocket/frames" icon="code">Frames</Card>',
    '',
    '`/v1/messages` and `href="/cli"` are examples.',
    '',
    '```ts',
    'fetch("/v1/messages")',
    'const example = "[CLI](/cli)"',
    '```',
  ].join('\n')
  const output = prefixMdx(source)
  assert.match(output, /asyncapi: "\/beta\/asyncapi\/events.yaml subscribe"/)
  assert.match(output, /from "\/beta\/snippets\/table.jsx"/)
  assert.match(output, /\[CLI\]\(\/beta\/cli#login\)/)
  assert.match(output, /!\[Image\]\(\/beta\/images\/example.png\)/)
  assert.match(output, /\[ref\]: \/beta\/api-reference\?tab=example/)
  assert.match(output, /href="\/beta\/websocket\/frames" icon="code"/)
  assert.ok(output.includes('`/v1/messages` and `href="/cli"` are examples.'))
  assert.ok(output.includes('fetch("/v1/messages")\nconst example = "[CLI](/cli)"'))
  assert.ok(output.includes('[external](https://example.com/path)'))
})

test('rewrites Markdown destinations without changing repeated URLs in labels or titles', () => {
  const cases = [
    ['[CLI](/cli "/cli")', '[CLI](/beta/cli "/cli")'],
    ['[/cli](/cli \'/cli\')', '[/cli](/beta/cli \'/cli\')'],
    ['![Image /cli](</cli> "/cli")', '![Image /cli](</beta/cli> "/cli")'],
    ['[ref]: /cli "/cli"', '[ref]: /beta/cli "/cli"'],
    ['[/cli]: </cli>\n  \'/cli\'', '[/cli]: </beta/cli>\n  \'/cli\''],
    ['[CLI](/cli?x=1&amp;y=2 "/cli?x=1&y=2")', '[CLI](/beta/cli?x=1&amp;y=2 "/cli?x=1&y=2")'],
    [String.raw`[CLI](/cli\(example\) "/cli(example)")`, String.raw`[CLI](/beta/cli\(example\) "/cli(example)")`],
    ['[External](//example.com "/cli")', '[External](//example.com "/cli")'],
  ]
  for (const [source, expected] of cases)
    assert.equal(prefixMdx(source), expected, source)
})

test('namespaces nested navigation and generated endpoint paths, preserving API selectors', () => {
  assert.deepEqual(prefixNavigation({ tabs: [{
    tab: 'API Reference',
    anchors: [{ anchor: 'Endpoints', groups: [{
      group: 'REST',
      openapi: { source: 'https://api.example.com/openapi.json', directory: 'api-reference' },
      pages: ['api-reference/index', 'GET /v1/messages'],
    }] }],
  }] }), { tabs: [{
    tab: 'API Reference',
    anchors: [{ anchor: 'Endpoints', groups: [{
      group: 'REST',
      openapi: { source: 'https://api.example.com/openapi.json', directory: 'beta/api-reference' },
      pages: ['beta/api-reference/index', 'GET /v1/messages'],
    }] }],
  }] })
})

test('assembles Maintain and Beta with separate pages, shared branding, and working problem identifiers', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'docs-site-export-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'asyncapi'))
  mkdirSync(join(root, 'scripts'))
  mkdirSync(join(root, 'site'))
  const maintain = join(root, '.vellum-src/.sites/maintain')
  mkdirSync(join(maintain, 'cli'), { recursive: true })
  mkdirSync(join(maintain, 'images'))
  const image = new Uint8Array([0, 1, 2, 255])
  writeFileSync(join(maintain, 'images/example.avif'), image)
  const maintainNavigation = { tabs: [{ tab: 'CLI', groups: [{ group: 'Start', pages: ['cli/overview'] }] }] }
  writeFileSync(join(maintain, 'docs.json'), JSON.stringify({ navigation: maintainNavigation }))
  writeFileSync(join(maintain, 'cli/overview.mdx'), 'MAINTAIN_CONTENT [CLI](/cli/overview)')
  writeFileSync(join(maintain, 'custom.css'), 'production styles')
  writeFileSync(join(maintain, 'tracking.js'), 'production tracking')
  writeFileSync(join(maintain, '.mintignore'), 'drafts/\n*.draft.mdx\n')
  writeFileSync(join(root, 'custom.css'), 'staging styles')
  writeFileSync(join(root, 'favicon.svg'), '<svg/>')
  writeFileSync(join(root, 'site/stale.mdx'), 'stale')
  writeFileSync(join(root, 'index.mdx'), '---\ntitle: Home\n---\n\n[Docs](/cli)\n')
  writeFileSync(join(root, 'asyncapi/events.yaml'), 'asyncapi: 3.0.0\n')
  writeFileSync(join(root, 'scripts/private.mdx'), 'not a page')
  writeFileSync(join(root, 'docs.json'), JSON.stringify({
    favicon: '/favicon.svg',
    navigation: { versions: [
      { version: 'Maintain', ...maintainNavigation },
      { version: 'Beta', default: true, tabs: [{ tab: 'Overview', groups: [{ group: 'Start', pages: ['index'] }] }] },
    ] },
    redirects: [{ source: '/problems/rate-limited', destination: '/problems/catalog#rate-limited', permanent: false }],
  }))
  exportSite(root)
  const config = JSON.parse(readFileSync(join(root, 'site/docs.json'), 'utf8'))
  assert.deepEqual(config.navigation.versions[0], { version: 'Maintain', ...maintainNavigation })
  assert.deepEqual(config.navigation.versions[1].tabs[0].groups[0].pages, ['beta/index'])
  assert.equal(config.navigation.versions[1].default, true)
  assert.deepEqual(config.redirects.map((redirect: { source: string, destination: string }) => [redirect.source, redirect.destination]), [
    ['/beta/problems/rate-limited', '/beta/problems/catalog#rate-limited'],
    ['/problems/rate-limited', '/beta/problems/catalog#rate-limited'],
  ])
  assert.equal(readFileSync(join(root, 'site/beta/asyncapi/events.yaml'), 'utf8'), 'asyncapi: 3.0.0\n')
  assert.match(readFileSync(join(root, 'site/beta/index.mdx'), 'utf8'), /\[Docs\]\(\/beta\/cli\)/)
  assert.equal(readFileSync(join(root, 'site/cli/overview.mdx'), 'utf8'), 'MAINTAIN_CONTENT [CLI](/cli/overview)')
  assert.deepEqual(new Uint8Array(readFileSync(join(root, 'site/images/example.avif'))), image)
  assert.equal(readFileSync(join(root, 'site/custom.css'), 'utf8'), 'staging styles')
  assert.equal(readFileSync(join(root, 'site/favicon.svg'), 'utf8'), '<svg/>')
  assert.equal(readFileSync(join(root, 'site/.mintignore'), 'utf8'), 'drafts/\n*.draft.mdx\n')
  assert.throws(() => readFileSync(join(root, 'site/index.mdx')))
  assert.throws(() => readFileSync(join(root, 'site/tracking.js')))
  assert.throws(() => readFileSync(join(root, 'site/beta/custom.css')))
  assert.throws(() => readFileSync(join(root, 'site/stale.mdx')))
  assert.throws(() => readFileSync(join(root, 'site/scripts/private.mdx')))
})
