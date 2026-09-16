import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { exportSite } from './index'

test('imports a published Maintain site and builds both versions entirely in docs-v2', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'docs-staging-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  function file(path: string, content: string) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  function json(path: string, value: unknown) {
    file(path, JSON.stringify(value))
  }
  for (const name of ['sync-docs/index.ts', 'sync-docs/assets.ts', 'sync-docs/git.ts', 'build-nav/index.ts', 'llms-generator/index.ts']) {
    const target = join(root, 'scripts', name)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(new URL(`../${name}`, import.meta.url), target)
  }
  json('package.json', { type: 'module' })
  json('scripts/sources.json', { sources: [{ name: 'maintain', mount: 'maintain', format: 'mintlify', local: 'published' }] })
  const maintainNavigation = {
    tabs: [{ tab: 'CLI', groups: [{ group: 'Start', pages: ['cli/overview'] }] }],
    global: { anchors: [{ anchor: 'Blog', href: 'https://photon.codes/blog' }] },
  }
  json('published/docs.json', { navigation: maintainNavigation })
  file('published/docs-src/do-not-render.mdx.vel', 'not a staging template')
  const page = (title: string, content: string) => `---\ntitle: ${title}\ndescription: ${title}\n---\n\n${content}\n`
  file('published/cli/overview.mdx', page('Maintain CLI', 'MAINTAIN_ONLY'))
  file('cli/index.mdx', page('Beta CLI', 'BETA_ONLY [CLI](/cli)'))
  json('docs.base.json', { name: 'Photon', navigation: { versions: [
    { $source: 'maintain', version: 'Maintain' },
    { version: 'Beta', default: true, tabs: [{ tab: 'CLI', groups: [{ group: 'Start', pages: ['cli/index'] }] }] },
  ] } })
  const run = (name: string, ...args: string[]) => execFileSync(resolve(import.meta.dirname, '../../node_modules/.bin/tsx'), [join(root, 'scripts', name, 'index.ts'), ...args], {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, DOCS_SOURCE_MODE: 'local', DOCS_BASE_URL: 'https://photon-staging.mintlify.site' },
  })
  run('sync-docs')
  run('build-nav')
  exportSite(root)
  run('llms-generator', join(root, 'site'))
  const config = JSON.parse(readFileSync(join(root, 'site/docs.json'), 'utf8'))
  assert.deepEqual(config.navigation.versions[0], { version: 'Maintain', ...maintainNavigation })
  assert.deepEqual(config.navigation.versions[1].tabs[0].groups[0].pages, ['beta/cli/index'])
  assert.deepEqual(config.redirects, [])
  assert.ok(config.navigation.versions.every((version: object) => !('href' in version)))
  assert.throws(() => readFileSync(join(root, '.vellum-src/.sites/maintain/docs-src/do-not-render.mdx.vel')))
  assert.match(readFileSync(join(root, 'site/llms-cli.txt'), 'utf8'), /MAINTAIN_ONLY/)
  assert.match(readFileSync(join(root, 'site/llms-beta-cli.txt'), 'utf8'), /BETA_ONLY/)
  assert.match(readFileSync(join(root, 'site/llms.txt'), 'utf8'), /https:\/\/photon-staging\.mintlify\.site\/beta\/cli\/index/)
  assert.match(readFileSync(join(root, 'site/beta/cli/index.mdx'), 'utf8'), /\[CLI\]\(\/beta\/cli\)/)
})
