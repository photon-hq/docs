import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { FALLBACK_GROUP, GROUP_RULES, groupFor } from './groups'

// Generate problems.mdx: one page cataloguing every RFC 9457 problem type the
// API publishes, appended to the hand-owned prose in intro.mdx.
//
// Every Photon service stamps its errors with a type URI of the form
// https://photon.codes/docs/problems/<slug> (error-ts/src/registry.ts). One page
// cannot resolve each of those, so the slug is the *heading* it anchors to:
// .../problems/<slug> is documented at /problems#<slug>, and docs.base.json
// redirects the former onto the page. Headings are therefore the slug verbatim,
// never the title -- a title like "Request Failed" would anchor to
// #request-failed and break the lookup for slug `http-error`.
//
// The OpenAPI spec is the catalog -- it carries every slug a service declares on
// an operation, with its code, status, title, and extension fields. Problems the
// chassis raises outside any operation are supplemented from chassis.json.

const ROOT = resolve(import.meta.dirname, '../..')
const OUT = join(ROOT, 'problems/catalog.mdx')
const HEADER = join(import.meta.dirname, 'catalog-header.mdx')
const CHASSIS = join(import.meta.dirname, 'chassis.json')
const SNAPSHOT = join(import.meta.dirname, 'catalog.json')
const REDIRECTS = join(ROOT, '.vellum-src/.redirects/problems.json')

const SPEC_URL = process.env.PHOTON_OPENAPI_URL ?? 'https://api.photon.codes/openapi.json'
const TYPE_BASE = 'https://photon.codes/docs/problems/'
const LEGACY_URN = 'urn:photon:problem:'

// Envelope fields defined by error-ts/src/problem.ts. Anything else on a branch
// is a problem-specific extension.
const ENVELOPE = new Set(['type', 'code', 'title', 'status', 'detail', 'instance', 'remediation', 'requestId'])

interface Operation {
  method: string
  path: string
  operationId?: string
  tags: string[]
}

interface Problem {
  slug: string
  code: string
  status: number
  title: string
  extensions: string[]
  operations: Operation[]
  chassisOnly?: true
}

interface Catalog {
  problems: Problem[]
  legacy: { urn: string, tags: string[] }[]
}

function log(msg: string) {
  process.stdout.write(`build-problems: ${msg}\n`)
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

interface Branch {
  properties?: Record<string, { const?: unknown }>
  required?: string[]
}

function branchesOf(schema: unknown): Branch[] {
  if (!schema || typeof schema !== 'object')
    return []
  const s = schema as { oneOf?: Branch[] }
  return Array.isArray(s.oneOf) ? s.oneOf : [schema as Branch]
}

function extract(spec: any): Catalog {
  const problems = new Map<string, Problem>()
  const legacy = new Map<string, Set<string>>()

  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const [method, op] of Object.entries(item as Record<string, any>)) {
      if (!op || typeof op !== 'object' || !op.responses)
        continue
      const tags: string[] = Array.isArray(op.tags) ? op.tags : []

      for (const response of Object.values(op.responses as Record<string, any>)) {
        const media = response?.content?.['application/problem+json']
        if (!media)
          continue

        for (const branch of branchesOf(media.schema)) {
          const props = branch.properties
          const type = props?.type?.const
          if (typeof type !== 'string')
            continue

          if (!type.startsWith(TYPE_BASE)) {
            // A type URI outside the canonical base has no docs page to resolve
            // to. Record it so the gap is visible instead of silently dropped.
            if (type.startsWith(LEGACY_URN)) {
              if (!legacy.has(type))
                legacy.set(type, new Set())
              tags.forEach(t => legacy.get(type)!.add(t))
            }
            continue
          }

          const slug = type.slice(TYPE_BASE.length)
          let problem = problems.get(slug)
          if (!problem) {
            problem = {
              slug,
              code: String(props?.code?.const ?? ''),
              status: Number(props?.status?.const ?? 0),
              title: String(props?.title?.const ?? slug),
              extensions: [],
              operations: [],
            }
            problems.set(slug, problem)
          }

          for (const key of Object.keys(props ?? {})) {
            if (!ENVELOPE.has(key) && !problem.extensions.includes(key))
              problem.extensions.push(key)
          }

          const seen = problem.operations.some(o => o.method === method && o.path === path)
          if (!seen)
            problem.operations.push({ method: method.toUpperCase(), path, operationId: op.operationId, tags })
        }
      }
    }
  }

  return {
    problems: [...problems.values()],
    legacy: [...legacy].map(([urn, tags]) => ({ urn, tags: [...tags].sort() })),
  }
}

function mergeChassis(catalog: Catalog): Catalog {
  const { problems: extra } = JSON.parse(readFileSync(CHASSIS, 'utf8')) as {
    problems: { slug: string, code: string, status: number, title: string }[]
  }
  const bySlug = new Map(catalog.problems.map(p => [p.slug, p]))
  let added = 0
  for (const entry of extra) {
    // The spec wins: a slug declared on an operation carries richer data.
    if (bySlug.has(entry.slug))
      continue
    catalog.problems.push({ ...entry, extensions: [], operations: [], chassisOnly: true })
    added++
  }
  log(`merged ${added} chassis-only problem(s) from chassis.json`)
  return catalog
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// The markdown table below is the catalogue -- the only copy of it.
//
// Mintlify server-renders a snippet component as null, so anything only the
// React table shows exists after hydration alone. Search engines deprioritise
// what they must run JavaScript to see, and the crawlers behind AI answers
// mostly do not run it at all, which would leave 106 documented error codes
// invisible on exactly the page people search an error code to find.
//
// So the rows are emitted as markdown, and snippets/problems-table.jsx reads
// them back out of the DOM and hides the static table once its own is live.
// Passing them as a prop instead would put the catalogue on the page twice:
// Mintlify's "Copy page" and the `contextual` options serve this page's
// markdown source, and a 14KB line of JSON ahead of the table is not what
// anyone means to paste.
function describe(row: { title: string, extensions?: string[], chassis?: boolean }): string {
  const parts = [row.title.endsWith('.') ? row.title : `${row.title}.`]
  if (row.extensions?.length)
    parts.push(`Adds ${row.extensions.map(e => `\`${e}\``).join(', ')}.`)
  if (row.chassis)
    parts.push('Raised by the chassis, so any endpoint can return it.')
  return parts.join(' ')
}

function staticTable(rows: any[]): string[] {
  const lines = [
    '| Type | Code | Status | Group | Description |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const row of rows) {
    lines.push(
      `| \`${row.slug}\` | \`${row.code}\` | \`${row.status}\` `
      + `| ${row.group} | ${describe(row)} |`,
    )
  }
  return lines
}

function renderCatalogue(problems: Problem[]): string {
  const ungrouped: string[] = []
  const order = new Map([...GROUP_RULES.map(r => r.group), FALLBACK_GROUP].map((g, i) => [g, i]))

  const rows = problems.map((problem) => {
    const group = groupFor(problem.slug)
    if (!group)
      ungrouped.push(problem.slug)
    return {
      slug: problem.slug,
      code: problem.code,
      status: problem.status,
      title: problem.title,
      group: group ?? FALLBACK_GROUP,
      ...(problem.extensions.length > 0 ? { extensions: problem.extensions } : {}),
      ...(problem.chassisOnly ? { chassis: true } : {}),
    }
  })

  if (ungrouped.length > 0) {
    // Never fatal: openapi-watch.yml redeploys on spec drift, so a new slug from
    // any service would otherwise break production deploys.
    process.stdout.write(
      `build-problems: warning — ${ungrouped.length} slug(s) matched no group rule `
      + `and went to "${FALLBACK_GROUP}": ${ungrouped.join(', ')}\n`
      + `build-problems: add a rule in scripts/build-problems/groups.ts\n`,
    )
  }

  // Group order drives the filter dropdown; slug order drives the initial sort.
  rows.sort((a, b) =>
    (order.get(a.group) ?? 0) - (order.get(b.group) ?? 0) || a.slug.localeCompare(b.slug))

  return [
    '<ProblemsTable />',
    '',
    // Blank lines around the markdown are what make MDX parse it as a table
    // rather than as JSX children.
    '<div id="problems-static">',
    '',
    ...staticTable(rows),
    '',
    '</div>',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function loadCatalog(): Promise<Catalog> {
  try {
    log(`fetching ${SPEC_URL}`)
    const res = await fetch(SPEC_URL, { signal: AbortSignal.timeout(120_000) })
    if (!res.ok)
      throw new Error(`HTTP ${res.status}`)
    const catalog = extract(await res.json())
    writeFileSync(SNAPSHOT, `${JSON.stringify(catalog, null, 2)}\n`)
    log(`extracted ${catalog.problems.length} problem type(s); refreshed catalog.json`)
    return catalog
  }
  catch (err) {
    // Keep local development and a flaky aggregator from failing the build; the
    // committed snapshot is the last catalog a successful build saw.
    if (!existsSync(SNAPSHOT))
      throw new Error(`could not fetch ${SPEC_URL} and no catalog.json snapshot exists: ${(err as Error).message}`)
    log(`warning — fetch failed (${(err as Error).message}); falling back to catalog.json`)
    return JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Catalog
  }
}

async function main() {
  const catalog = mergeChassis(await loadCatalog())
  const problems = catalog.problems.sort((a, b) => a.slug.localeCompare(b.slug))

  // One exact redirect per slug rather than a /problems/:slug* wildcard. The
  // wildcard also swallowed /problems/catalog.md -- the markdown endpoint behind
  // "Copy page" and every `contextual` option -- handing them a whole HTML
  // document. Listing the slugs keeps the redirect to exactly what it is for.
  mkdirSync(dirname(REDIRECTS), { recursive: true })
  writeFileSync(REDIRECTS, `${JSON.stringify(problems.map(problem => ({
    source: `/problems/${problem.slug}`,
    destination: `/problems/catalog#${problem.slug}`,
    permanent: false,
  })), null, 2)}\n`)
  log(`wrote ${problems.length} redirect(s) to .vellum-src/.redirects/problems.json`)

  const header = readFileSync(HEADER, 'utf8').trimEnd()
  mkdirSync(dirname(OUT), { recursive: true })

  // The catalogue used to be a root-level problems.mdx. Left behind it shadows
  // problems/index.mdx, and the only symptom is the wrong page title.
  const stale = join(ROOT, 'problems.mdx')
  if (existsSync(stale)) {
    rmSync(stale)
    log('removed stale problems.mdx from the previous layout')
  }
  writeFileSync(OUT, `${header}\n\n${renderCatalogue(problems).trimEnd()}\n`)
  log(`wrote problems/catalog.mdx (${problems.length} problem type(s))`)

  if (catalog.legacy.length > 0) {
    process.stdout.write(
      `build-problems: warning — ${catalog.legacy.length} type URI(s) still use the legacy `
      + `"${LEGACY_URN}" scheme and are not catalogued:\n${
        catalog.legacy.map(l => `build-problems:   ${l.urn} (${l.tags.join(', ')})\n`).join('')}`,
    )
  }
}

main()
