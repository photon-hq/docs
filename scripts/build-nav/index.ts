import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

// Merge the centrally-owned navigation skeleton (docs.base.json) with the
// per-source nav fragments fetched into .vellum-src/.nav/ by sync-docs, then
// write the final docs.json that Mintlify and the llms generator consume.
//
// docs.base.json contains marker objects of the form
//   { "$source": "<name>", "group": "<group name>" }
// Each marker is replaced, in place, by the matching group from that source's
// fragment — preserving the exact group ordering authored in the skeleton.

const ROOT = resolve(import.meta.dirname, '../..')
const BASE = join(ROOT, 'docs.base.json')
const OUT = join(ROOT, 'docs.json')
const SOURCES = join(ROOT, 'scripts/sources.json')
const NAV_DIR = join(ROOT, '.vellum-src/.nav')

interface Source {
  name: string
  mount: string
  nav?: string
}

interface NavFragment {
  source: string
  groups: { group: string, [k: string]: unknown }[]
}

interface Marker {
  $source: string
  group?: string
}

function isMarker(node: unknown): node is Marker {
  return !!node && typeof node === 'object' && !Array.isArray(node) && '$source' in node
}

function loadFragments(): Map<string, NavFragment> {
  const { sources } = JSON.parse(readFileSync(SOURCES, 'utf8')) as { sources: Source[] }
  const out = new Map<string, NavFragment>()
  for (const src of sources) {
    const path = join(NAV_DIR, `${src.mount}.json`)
    if (!existsSync(path))
      continue
    const fragment = JSON.parse(readFileSync(path, 'utf8')) as NavFragment
    out.set(src.name, fragment)
  }
  return out
}

function resolveMarker(marker: Marker, fragments: Map<string, NavFragment>): unknown[] {
  const fragment = fragments.get(marker.$source)
  if (!fragment)
    throw new Error(`nav: no fragment for source "${marker.$source}" (is it synced? does sources.json list it?)`)
  if (marker.group === undefined)
    return fragment.groups
  const group = fragment.groups.find(g => g.group === marker.group)
  if (!group)
    throw new Error(`nav: source "${marker.$source}" has no group "${marker.group}"`)
  return [group]
}

function walk(node: unknown, fragments: Map<string, NavFragment>): unknown {
  if (Array.isArray(node)) {
    const out: unknown[] = []
    for (const el of node) {
      if (isMarker(el))
        out.push(...resolveMarker(el, fragments))
      else
        out.push(walk(el, fragments))
    }
    return out
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node))
      out[k] = walk(v, fragments)
    return out
  }
  return node
}

function main() {
  const base = JSON.parse(readFileSync(BASE, 'utf8'))
  const fragments = loadFragments()
  const merged = walk(base, fragments)
  writeFileSync(OUT, `${JSON.stringify(merged, null, 2)}\n`)
  process.stdout.write(`wrote docs.json (merged ${fragments.size} nav fragment(s))\n`)
}

main()
