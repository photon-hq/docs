import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const ROOT = resolve(import.meta.dirname, '../..')
const DOCS_JSON = join(ROOT, 'docs.json')
const BASE_URL = 'https://photon.codes/docs'

const PRODUCT_NAME = 'Photon'
const PRODUCT_SUMMARY = 'Photon is a multi-platform agent framework. Build an agent once with Spectrum and connect it to iMessage, WhatsApp, and other interfaces; or drop down to the low-level SDKs for direct platform control.'

const CODE_FENCE = '```'

interface DocsConfig {
  name: string
  navigation: { tabs: Tab[] }
}
interface Tab {
  tab: string
  groups: Group[]
}
interface Group {
  group?: string
  icon?: string
  pages?: (string | Group)[]
  openapi?: string
}

interface PageFile {
  title: string
  description: string
  body: string
}

type WalkNode
  = | { kind: 'heading', depth: number, title: string }
    | { kind: 'page', depth: number, slug: string, page: PageFile }
    | { kind: 'openapi', depth: number, source: string, label: string }

function slugifyTab(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function dedent(text: string): string {
  const lines = text.split('\n')
  const nonBlank = lines.filter(l => l.trim() !== '')
  if (nonBlank.length === 0)
    return text
  const minIndent = Math.min(...nonBlank.map(l => l.match(/^[ \t]*/)![0].length))
  if (minIndent === 0)
    return text
  return lines.map(l => l.slice(minIndent)).join('\n')
}

function parseFrontmatter(raw: string): Record<string, string> {
  const m = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!m)
    return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):(.*)$/)
    if (!kv)
      continue
    let val = kv[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
      val = val.slice(1, -1)
    }
    out[kv[1]] = val
  }
  return out
}

function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\n[\s\S]*?\n---\n*/, '')
}

function maskCodeBlocks(text: string): { masked: string, blocks: string[] } {
  const blocks: string[] = []
  const fenceRe = new RegExp(`^([ \\t]*)${CODE_FENCE}([^\\n]*)\\n([\\s\\S]*?)\\n\\1${CODE_FENCE}$`, 'gm')
  const masked = text.replace(fenceRe, (_m, indent: string, lang: string, content: string) => {
    const dedented = indent === ''
      ? content
      : content
          .split('\n')
          .map(l => l.startsWith(indent) ? l.slice(indent.length) : l)
          .join('\n')
    blocks.push(`${CODE_FENCE}${lang}\n${dedented}\n${CODE_FENCE}`)
    return `${indent}CODEBLOCK${blocks.length - 1}END`
  })
  return { masked, blocks }
}

function restoreCodeBlocks(text: string, blocks: string[]): string {
  return text.replace(/CODEBLOCK(\d+)END/g, (_, n: string) => blocks[Number(n)])
}

function cleanBody(body: string): string {
  const { masked, blocks } = maskCodeBlocks(body)
  let text = masked

  text = text.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

  const lines = text.split('\n')
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  while (i < lines.length && lines[i].trimStart().startsWith('import ')) {
    lines[i] = ''
    i++
  }
  text = lines.join('\n')

  text = text.replace(/\{%[\s\S]*?%\}/g, '')

  text = text.replace(/<TypeTooltip\b[\s\S]*?\/>/g, (match) => {
    const nameMatch = match.match(/name=["']([^"']+)["']/)
    return nameMatch ? `\`${nameMatch[1]}\`` : ''
  })

  text = text.replace(
    /^[ \t]*<Card\b([^>]*)>([\s\S]*?)<\/Card>/gm,
    (_m, attrs: string, inner: string) => {
      const title = attrs.match(/title=["']([^"']+)["']/)?.[1] ?? ''
      const href = attrs.match(/href=["']([^"']+)["']/)?.[1]
      const cleaned = dedent(inner).trim()
      if (href) {
        const url = href.startsWith('/') ? `${BASE_URL}${href}` : href
        return `- [**${title}**](${url})${cleaned ? ` — ${cleaned}` : ''}`
      }
      return `**${title}**${cleaned ? `\n\n${cleaned}` : ''}`
    },
  )

  text = text.replace(
    /^[ \t]*<Tab\b([^>]*)>([\s\S]*?)<\/Tab>/gm,
    (_m, attrs: string, inner: string) => {
      const title = attrs.match(/title=["']([^"']+)["']/)?.[1] ?? ''
      return `\n**${title}**\n\n${dedent(inner).trim()}\n`
    },
  )

  text = text.replace(
    /^[ \t]*<Step\b([^>]*)>([\s\S]*?)<\/Step>/gm,
    (_m, attrs: string, inner: string) => {
      const title = attrs.match(/title=["']([^"']+)["']/)?.[1] ?? ''
      return `\n**${title}**\n\n${dedent(inner).trim()}\n`
    },
  )

  text = text.replace(
    /^[ \t]*<Accordion\b([^>]*)>([\s\S]*?)<\/Accordion>/gm,
    (_m, attrs: string, inner: string) => {
      const title = attrs.match(/title=["']([^"']+)["']/)?.[1] ?? ''
      const desc = attrs.match(/description=["']([^"']+)["']/)?.[1]
      const head = desc ? `**${title}** — ${desc}` : `**${title}**`
      return `\n${head}\n\n${dedent(inner).trim()}\n`
    },
  )

  const unwrap = [
    'CardGroup',
    'AccordionGroup',
    'Tabs',
    'Steps',
    'CodeGroup',
    'Note',
    'Tip',
    'Warning',
    'Info',
    'Frame',
    'Columns',
    'Column',
  ]
  for (const tag of unwrap) {
    text = text.replace(
      new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g'),
      '$1',
    )
    text = text.replace(new RegExp(`<${tag}\\b[^/>]*/>`, 'g'), '')
  }

  text = restoreCodeBlocks(text, blocks)

  text = text
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

  return `${text.trim()}\n`
}

function readPage(slug: string): PageFile {
  const path = join(ROOT, `${slug}.mdx`)
  const raw = readFileSync(path, 'utf8')
  const fm = parseFrontmatter(raw)
  const body = cleanBody(stripFrontmatter(raw))
  return {
    title: fm.title ?? slug,
    description: fm.description ?? '',
    body,
  }
}

function emitGroup(group: Group, depth: number, out: WalkNode[]) {
  if (group.openapi) {
    if (group.group)
      out.push({ kind: 'heading', depth, title: group.group })
    out.push({
      kind: 'openapi',
      depth: group.group ? depth + 1 : depth,
      source: group.openapi,
      label: group.group ?? 'OpenAPI',
    })
    return
  }
  if (group.group)
    out.push({ kind: 'heading', depth, title: group.group })
  const childDepth = depth + (group.group ? 1 : 0)
  for (const p of group.pages ?? []) {
    if (typeof p === 'string')
      out.push({ kind: 'page', depth: childDepth, slug: p, page: readPage(p) })
    else
      emitGroup(p, childDepth, out)
  }
}

function walkTab(tab: Tab): WalkNode[] {
  const nodes: WalkNode[] = []
  for (const group of tab.groups)
    emitGroup(group, 2, nodes)
  return nodes
}

function pageUrl(slug: string): string {
  return `${BASE_URL}/${slug}`
}

function openapiUrl(source: string): string {
  return source.startsWith('http') ? source : `${BASE_URL}/${source}`
}

function shiftHeadings(text: string, by: number): string {
  if (by === 0)
    return text
  const { masked, blocks } = maskCodeBlocks(text)
  const shifted = masked.replace(/^(#{1,5}) /gm, (_m, h: string) =>
    `${'#'.repeat(Math.min(6, h.length + by))} `)
  return restoreCodeBlocks(shifted, blocks)
}

function renderTabFile(tab: Tab, nodes: WalkNode[]): string {
  const lines: string[] = []
  lines.push(`# ${PRODUCT_NAME} — ${tab.tab}`)
  lines.push('')

  const firstPage = nodes.find((n): n is Extract<WalkNode, { kind: 'page' }> => n.kind === 'page')
  if (firstPage?.page.description) {
    lines.push(`> ${firstPage.page.description}`)
    lines.push('')
  }

  for (const node of nodes) {
    if (node.kind === 'heading') {
      lines.push(`${'#'.repeat(Math.min(6, node.depth))} ${node.title}`)
      lines.push('')
    }
    else if (node.kind === 'page') {
      lines.push(`${'#'.repeat(Math.min(6, node.depth))} ${node.page.title}`)
      lines.push('')
      lines.push(`Source: ${pageUrl(node.slug)}`)
      lines.push('')
      if (node.page.body)
        lines.push(shiftHeadings(node.page.body, node.depth - 1))
      lines.push('')
    }
    else {
      lines.push(`OpenAPI specification: <${openapiUrl(node.source)}>`)
      lines.push('')
    }
  }

  return `${lines.join('\n').trim()}\n`
}

function renderIndexTab(tab: Tab, nodes: WalkNode[]): string {
  const tabSlug = slugifyTab(tab.tab)
  const lines: string[] = []
  lines.push(`## ${tab.tab}`)
  lines.push('')
  lines.push(`[Full content for this tab](${BASE_URL}/llms-${tabSlug}.txt)`)
  lines.push('')

  for (const node of nodes) {
    if (node.kind === 'heading') {
      if (lines[lines.length - 1] !== '')
        lines.push('')
      lines.push(`${'#'.repeat(Math.min(6, node.depth + 1))} ${node.title}`)
      lines.push('')
    }
    else if (node.kind === 'page') {
      const desc = node.page.description ? `: ${node.page.description}` : ''
      lines.push(`- [${node.page.title}](${pageUrl(node.slug)})${desc}`)
    }
    else {
      lines.push(`- [${node.label} (OpenAPI)](${openapiUrl(node.source)})`)
    }
  }

  return lines.join('\n').trim()
}

function renderFullFile(tabs: Tab[], tabFiles: Map<string, string>): string {
  const lines: string[] = []
  lines.push(`# ${PRODUCT_NAME}`)
  lines.push('')
  lines.push(`> ${PRODUCT_SUMMARY}`)
  lines.push('')

  tabs.forEach((tab, idx) => {
    const slug = slugifyTab(tab.tab)
    const content = tabFiles.get(slug)!
    const stripped = content.replace(/^# [^\n]*\n+(> [^\n]*\n+)?/, '')
    const shifted = shiftHeadings(stripped, 1)
    lines.push(`## ${tab.tab}`)
    lines.push('')
    lines.push(shifted.trim())
    lines.push('')
    if (idx < tabs.length - 1) {
      lines.push('---')
      lines.push('')
    }
  })

  return `${lines.join('\n').trim()}\n`
}

function main() {
  const docs: DocsConfig = JSON.parse(readFileSync(DOCS_JSON, 'utf8'))

  const tabNodes = new Map<string, WalkNode[]>()
  for (const tab of docs.navigation.tabs)
    tabNodes.set(slugifyTab(tab.tab), walkTab(tab))

  const tabFileContents = new Map<string, string>()
  for (const tab of docs.navigation.tabs) {
    const slug = slugifyTab(tab.tab)
    const content = renderTabFile(tab, tabNodes.get(slug)!)
    tabFileContents.set(slug, content)
    writeFileSync(join(ROOT, `llms-${slug}.txt`), content)
    process.stdout.write(`wrote llms-${slug}.txt (${content.length} bytes)\n`)
  }

  const indexLines: string[] = []
  indexLines.push(`# ${PRODUCT_NAME}`)
  indexLines.push('')
  indexLines.push(`> ${PRODUCT_SUMMARY}`)
  indexLines.push('')
  for (const tab of docs.navigation.tabs) {
    indexLines.push(renderIndexTab(tab, tabNodes.get(slugifyTab(tab.tab))!))
    indexLines.push('')
  }
  const indexOut = `${indexLines.join('\n').trim()}\n`
  writeFileSync(join(ROOT, 'llms.txt'), indexOut)
  process.stdout.write(`wrote llms.txt (${indexOut.length} bytes)\n`)

  const fullOut = renderFullFile(docs.navigation.tabs, tabFileContents)
  writeFileSync(join(ROOT, 'llms-full.txt'), fullOut)
  process.stdout.write(`wrote llms-full.txt (${fullOut.length} bytes)\n`)
}

main()
