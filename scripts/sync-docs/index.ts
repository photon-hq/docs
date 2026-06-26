import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'

// Assemble the vellum template tree (.vellum-src) from:
//   1. local templates in docs-src/ (areas not yet migrated + site-owned prose),
//      minus any subtree owned by a source mount, and
//   2. each source in scripts/sources.json, pulled from its repo via git
//      (sparse checkout of <docsDir> at the tag matching the installed package
//      version) or copied from a local fallback path.
//
// Each source's nav fragment is copied to .vellum-src/.nav/<mount>.json for
// build-nav to merge. See ENG-1742.

const ROOT = resolve(import.meta.dirname, '../..')
const LOCAL_DOCS = join(ROOT, 'docs-src')
const STAGING = join(ROOT, '.vellum-src')
const NAV_DIR = join(STAGING, '.nav')
const SOURCES = join(ROOT, 'scripts/sources.json')

interface Source {
  name: string
  mount: string
  package?: string
  repo?: string
  docsDir?: string
  tagPrefix?: string
  ref?: string | null
  nav?: string
  local?: string
}

type Mode = 'git' | 'local'

function log(msg: string) {
  process.stdout.write(`sync-docs: ${msg}\n`)
}

function envKey(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '_')
}

function installedVersion(pkg: string): string | null {
  const path = join(ROOT, 'node_modules', pkg, 'package.json')
  if (!existsSync(path))
    return null
  return JSON.parse(readFileSync(path, 'utf8')).version ?? null
}

function resolveRef(src: Source): string {
  const override = process.env[`DOCS_REF_${envKey(src.name)}`]
  if (override)
    return override
  if (src.ref)
    return src.ref
  if (src.package) {
    const version = installedVersion(src.package)
    if (version)
      return `${src.tagPrefix ?? 'v'}${version}`
  }
  return 'main'
}

function cloneUrl(repo: string): string {
  const token = process.env.DOCS_GH_TOKEN ?? process.env.GITHUB_TOKEN
  return token
    ? `https://x-access-token:${token}@github.com/${repo}.git`
    : `https://github.com/${repo}.git`
}

// Sparse-checkout <docsDir> of <repo> at <ref> into a temp dir; return the
// absolute path to the docs directory, or null if it doesn't exist at that ref.
function gitFetch(src: Source, ref: string): string | null {
  const repo = src.repo!
  const docsDir = src.docsDir ?? 'docs'
  const tmp = mkdtempSync(join(tmpdir(), `vellum-${src.name}-`))
  const run = (args: string[]) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  log(`fetching ${repo}#${ref}:${docsDir}`)
  run(['clone', '--filter=blob:none', '--no-checkout', '--quiet', cloneUrl(repo), tmp])
  run(['-C', tmp, 'sparse-checkout', 'init', '--cone'])
  run(['-C', tmp, 'sparse-checkout', 'set', docsDir])
  run(['-C', tmp, 'checkout', '--quiet', ref])
  const dir = join(tmp, docsDir)
  return existsSync(dir) ? dir : null
}

// Resolve a source to its on-disk docs directory, honoring DOCS_SOURCE_MODE and
// falling back from git to local when a repo has no docs at the ref yet.
function resolveContentDir(src: Source): string {
  const mode = process.env.DOCS_SOURCE_MODE as Mode | undefined
  const localDir = src.local ? resolve(ROOT, src.local) : null
  const hasLocal = !!localDir && existsSync(localDir)

  if (mode === 'local') {
    if (!hasLocal)
      throw new Error(`source "${src.name}": DOCS_SOURCE_MODE=local but local path is missing (${src.local})`)
    log(`${src.name}: using local ${src.local}`)
    return localDir!
  }

  const wantGit = mode === 'git' || !hasLocal
  if (wantGit) {
    if (!src.repo)
      throw new Error(`source "${src.name}": git mode requested but no "repo" configured`)
    try {
      const dir = gitFetch(src, resolveRef(src))
      if (dir)
        return dir
      log(`${src.name}: repo has no ${src.docsDir ?? 'docs'}/ at this ref`)
    }
    catch (err) {
      log(`${src.name}: git fetch failed (${(err as Error).message.split('\n')[0]})`)
    }
    if (hasLocal) {
      log(`${src.name}: falling back to local ${src.local}`)
      return localDir!
    }
    throw new Error(`source "${src.name}": could not fetch docs from git and no local fallback exists`)
  }

  log(`${src.name}: using local ${src.local}`)
  return localDir!
}

function isUnderMount(absSrc: string, mounts: string[]): boolean {
  const rel = relative(LOCAL_DOCS, absSrc)
  return mounts.some(m => rel === m || rel.startsWith(m + sep))
}

function main() {
  const { sources } = JSON.parse(readFileSync(SOURCES, 'utf8')) as { sources: Source[] }
  const mounts = sources.map(s => s.mount)

  rmSync(STAGING, { recursive: true, force: true })
  mkdirSync(NAV_DIR, { recursive: true })

  // 1. Local templates, minus anything owned by a source mount.
  if (existsSync(LOCAL_DOCS)) {
    cpSync(LOCAL_DOCS, STAGING, {
      recursive: true,
      filter: src => src === LOCAL_DOCS || !isUnderMount(src, mounts),
    })
  }

  // 2. Each source's templates + nav fragment.
  for (const src of sources) {
    const contentDir = resolveContentDir(src)
    const navName = src.nav ?? 'nav.json'
    const navFile = join(contentDir, navName)
    const dest = join(STAGING, src.mount)

    cpSync(contentDir, dest, {
      recursive: true,
      filter: p => basename(p) !== '.git' && p !== navFile,
    })

    if (existsSync(navFile))
      cpSync(navFile, join(NAV_DIR, `${src.mount}.json`))
    else
      log(`${src.name}: warning — no nav fragment at ${navName}`)

    log(`${src.name}: mounted at ${relative(ROOT, dest)}`)
  }

  log(`assembled ${relative(ROOT, STAGING)} from ${sources.length} source(s)`)
}

main()
