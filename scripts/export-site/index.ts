import type { Handle } from 'mdast-util-from-markdown'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { createProcessor } from '@mdx-js/mdx'
import remarkFrontmatter from 'remark-frontmatter'
import { parseDocument } from 'yaml'

const PREFIX = '/beta'
const destinationStarts = new WeakMap<object, number>()
// Capture only the destination token, excluding link labels and titles. Keep
// the parser's normal buffering so it still decodes URLs for localUrl checks.
const captureDestination: Handle = function (token) {
  const node = this.stack[this.stack.length - 1]
  destinationStarts.set(node, token.start.offset)
  this.buffer()
}
const parser = createProcessor({ remarkPlugins: [remarkFrontmatter] })
Object.assign(parser.data(), {
  fromMarkdownExtensions: [{
    enter: {
      resourceDestinationString: captureDestination,
      definitionDestinationString: captureDestination,
    },
  }],
})

function localUrl(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') ? `${PREFIX}${value}` : value
}

// Only navigation paths are namespaced. API selectors and external URLs keep
// their meaning; a schema's directory controls where Mintlify creates pages.
export function prefixNavigation(node: unknown, key = ''): unknown {
  if (Array.isArray(node))
    return node.map(value => prefixNavigation(value, key))
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([name, value]) => [name, prefixNavigation(value, name)]))
  }
  if (typeof node !== 'string')
    return node
  if (['pages', 'root', 'directory'].includes(key) && !/^(?:https?:\/\/|[A-Z]+ )/.test(node))
    return `${PREFIX.slice(1)}/${node.replace(/^\//, '')}`
  if (['href', 'source', 'icon', 'openapi', 'asyncapi'].includes(key))
    return localUrl(node)
  return node
}

// Apply edits at parser-provided offsets so code samples, prose, and formatting
// survive unchanged. In particular, /v1 API paths inside code are not doc links.
export function prefixMdx(source: string): string {
  const edits: { start: number, end: number, value: string }[] = []
  const tree = parser.parse(source)
  function attributeLiteral(node: { position?: { start: { offset?: number }, end: { offset?: number } } }, value: string) {
    if (localUrl(value) === value)
      return
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined)
      throw new Error(`Missing source position for ${value}`)
    const offset = source.slice(start, end).lastIndexOf(value)
    if (offset < 0)
      throw new Error(`Cannot locate documentation URL ${value}`)
    edits.push({ start: start + offset, end: start + offset + value.length, value: localUrl(value) })
  }
  function visit(node: any) {
    if (['link', 'image', 'definition'].includes(node.type) && localUrl(node.url) !== node.url) {
      const start = destinationStarts.get(node)
      if (typeof start !== 'number')
        throw new Error(`Missing destination position for ${node.url}`)
      // Insert before the raw URL to preserve Markdown escapes and entities.
      edits.push({ start, end: start, value: PREFIX })
    }
    if (node.type === 'mdxjsEsm') {
      for (const statement of node.data.estree.body) {
        if (statement.source && typeof statement.source.value === 'string') {
          const value = statement.source.value
          if (localUrl(value) !== value)
            edits.push({ start: statement.source.start + 1, end: statement.source.end - 1, value: localUrl(value) })
        }
      }
    }
    for (const attribute of node.attributes ?? []) {
      if (['href', 'src', 'icon', 'poster'].includes(attribute.name) && typeof attribute.value === 'string')
        attributeLiteral(attribute, attribute.value)
    }
    if (node.type === 'yaml') {
      const document = parseDocument(node.value)
      let changed = false
      for (const key of ['openapi', 'asyncapi', 'icon']) {
        const value = document.get(key)
        if (typeof value === 'string' && localUrl(value) !== value) {
          document.set(key, localUrl(value))
          changed = true
        }
      }
      if (changed) {
        edits.push({ start: node.position.start.offset, end: node.position.end.offset, value: `---\n${document.toString()}---` })
      }
    }
    for (const child of node.children ?? [])
      visit(child)
  }
  visit(tree)
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.value + source.slice(edit.end)
  return source
}

export function exportSite(root: string) {
  const output = join(root, 'site')
  const config = JSON.parse(readFileSync(join(root, 'docs.json'), 'utf8'))
  const maintain = join(root, '.vellum-src/.sites/maintain')
  const maintainConfig = JSON.parse(readFileSync(join(maintain, 'docs.json'), 'utf8'))
  rmSync(output, { recursive: true, force: true })
  mkdirSync(output, { recursive: true })
  const excluded = new Set(['node_modules', 'scripts', 'docs-src', 'site'])
  const assets = new Set(['.jsx', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.ico', '.woff', '.woff2', '.yaml', '.yml', '.pdf'])
  function copy(dir: string, destination: string, rewrite: boolean, relative = '') {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || excluded.has(entry.name))
        continue
      const path = join(dir, entry.name)
      const target = join(destination, relative, entry.name)
      if (entry.isDirectory()) {
        copy(path, destination, rewrite, join(relative, entry.name))
      }
      else if (entry.isFile() && (extname(path) === '.mdx' || assets.has(extname(path)) || (relative !== '' && extname(path) === '.json'))) {
        // Global scripts and styles belong to the staging site, not a version.
        if (relative === '' && extname(path) === '.js')
          continue
        mkdirSync(dirname(target), { recursive: true })
        if (rewrite && extname(path) === '.mdx')
          writeFileSync(target, prefixMdx(readFileSync(path, 'utf8')))
        else
          copyFileSync(path, target)
      }
    }
  }
  copy(maintain, output, false)
  copy(root, join(output, PREFIX.slice(1)), true)
  // Keep production's hidden/draft page exclusions when serving its snapshot.
  if (existsSync(join(maintain, '.mintignore')))
    copyFileSync(join(maintain, '.mintignore'), join(output, '.mintignore'))

  // Branding stays owned here and uses root-relative URLs in docs.base.json.
  function copyBranding(node: unknown) {
    if (typeof node === 'string' && node.startsWith('/') && !node.startsWith('//')) {
      const source = join(root, node)
      if (existsSync(source) && statSync(source).isFile()) {
        const target = join(output, node)
        mkdirSync(dirname(target), { recursive: true })
        copyFileSync(source, target)
      }
    }
    else if (node && typeof node === 'object') {
      for (const value of Object.values(node))
        copyBranding(value)
    }
  }
  const { navigation, redirects: betaRedirects = [], ...settings } = config
  copyBranding(settings)
  for (const entry of readdirSync(root)) {
    if (['.css', '.js'].includes(extname(entry)))
      copyFileSync(join(root, entry), join(output, entry))
  }
  // Problem type URLs are published API identifiers. Preserve their existing
  // /problems/<slug> entry points as aliases to the versioned catalogue.
  const redirects = betaRedirects.flatMap((redirect: { source: string, destination: string }) => {
    const mounted = { ...redirect, source: localUrl(redirect.source), destination: localUrl(redirect.destination) }
    return redirect.source.startsWith('/problems/') ? [mounted, { ...mounted, source: redirect.source }] : [mounted]
  })
  const combined = {
    ...settings,
    navigation: {
      ...navigation,
      versions: navigation.versions.map((version: { version: string }) =>
        version.version === 'Beta' ? prefixNavigation(version) : version,
      ),
    },
    redirects: [...(maintainConfig.redirects ?? []), ...redirects],
  }
  writeFileSync(join(output, 'docs.json'), `${JSON.stringify(combined, null, 2)}\n`)
  process.stdout.write('export-site: wrote the combined Maintain/Beta staging site to site/\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  exportSite(resolve(import.meta.dirname, '../..'))
