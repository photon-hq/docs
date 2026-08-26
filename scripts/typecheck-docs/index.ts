import type { TypecheckConfig } from './config'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'

const ROOT = resolve(import.meta.dirname, '../..')
const OUTPUT_DIR = join(ROOT, '.typecheck-output')
const TSCONFIG_CHECK = join(import.meta.dirname, 'tsconfig.check.json')

const LANG_TAGS: Record<string, { tags: string[], ext: string }> = {
  ts: { tags: ['ts', 'typescript'], ext: '.ts' },
}

// ---------------------------------------------------------------------------
// 1. Discover typecheck.config.ts files
// ---------------------------------------------------------------------------

function findConfigs(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.'))
      continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findConfigs(full))
    }
    else if (entry.name === 'typecheck.config.ts') {
      results.push(full)
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// 2. Extract code blocks from MDX
// ---------------------------------------------------------------------------

type BlockKind = 'standalone' | 'snippet' | 'interface' | 'skip'

interface CodeBlock {
  source: string
  line: number
  lang: string
  code: string
  kind: BlockKind
  configDir: string
}

function findMdxFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.'))
      continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findMdxFiles(full))
    }
    else if (entry.name.endsWith('.mdx')) {
      results.push(full)
    }
  }
  return results
}

function extractBlocks(mdxPath: string, tags: string[], sdkPackage: string, configDir: string): CodeBlock[] {
  const content = readFileSync(mdxPath, 'utf-8')
  const relPath = relative(ROOT, mdxPath)
  const lines = content.split('\n')
  const blocks: CodeBlock[] = []

  let i = 0
  while (i < lines.length) {
    const fenceMatch = lines[i].match(/^```(\w+)/)
    if (fenceMatch && tags.includes(fenceMatch[1])) {
      const lang = fenceMatch[1]
      const startLine = i + 1
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      const code = codeLines.join('\n')
      blocks.push({
        source: relPath,
        line: startLine,
        lang,
        code,
        kind: classify(code, sdkPackage),
        configDir,
      })
    }
    i++
  }

  return blocks
}

function classify(code: string, sdkPackage: string): BlockKind {
  const trimmed = code.trim()

  if (!trimmed)
    return 'skip'

  // Skip blocks that are purely comments or ASCII art
  if (trimmed.split('\n').every(l => l.trim() === '' || l.trim().startsWith('//')))
    return 'skip'

  // Skip pseudo-code signature lines like: const im = createClient(options: ClientOptions): AdvancedIMessage;
  if (/^\s*const \w+ = \w+\(.*:\s*\w+\):\s*\w+/.test(trimmed))
    return 'skip'

  // Skip resource listing blocks (im.messages  // comment)
  if (trimmed.split('\n').every(l => /^\s*\w+\.\w+\s+\/\//.test(l.trim())))
    return 'skip'

  // Interface/class/type declarations - descriptive, skip them
  if (/^\s*(?:export\s+)?(?:interface|class|type)\s+\w+/.test(trimmed))
    return 'interface'

  // Standalone if it has its own SDK import
  const escapedPkg = sdkPackage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`from\\s+["']${escapedPkg}`).test(code))
    return 'standalone'

  return 'snippet'
}

// ---------------------------------------------------------------------------
// 3. Assemble compilable files
// ---------------------------------------------------------------------------

function sanitize(code: string): string {
  return code.replace(/\{\s*\.\.\.\s*\}/g, '{\n}')
}

function stripSdkImports(code: string, sdkPackage: string): string {
  const escaped = sdkPackage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Multi-line imports: import { ... } from "pkg";
  const multiLine = new RegExp(
    String.raw`^\s*import\s+(?:type\s+)?\{[^}]*\}\s*from\s*["']${escaped}["'];?\s*$`,
    'gms',
  )
  // Single-line imports: import X from "pkg";
  const singleLine = new RegExp(
    String.raw`^\s*import\s+(?:type\s+)?[\w\s{},*]+from\s+["']${escaped}["'];?\s*$`,
    'gm',
  )
  return code.replace(multiLine, '').replace(singleLine, '')
}

function assemble(
  blocks: CodeBlock[],
  config: TypecheckConfig,
  ext: string,
): Map<string, string> {
  const files = new Map<string, string>()
  let idx = 0

  for (const block of blocks) {
    if (block.kind === 'skip' || block.kind === 'interface')
      continue
    idx++

    const header = `// Source: ${block.source}:${block.line}\n// Block type: ${block.kind}\n\n`
    const code = sanitize(block.code)
    let content: string

    if (block.kind === 'standalone') {
      const strippedCode = stripSdkImports(code, config.sdkPackage)
      content = `${[header, config.importPreamble, '', config.declarePreamble, '', `async function __check() {`, strippedCode, `}`].join('\n')}\n`
    }
    else {
      content = `${[header, config.importPreamble, '', config.declarePreamble, '', `async function __check() {`, code, `}`].join('\n')}\n`
    }

    files.set(`block_${String(idx).padStart(3, '0')}${ext}`, content)
  }

  return files
}

// ---------------------------------------------------------------------------
// 4. Run type checker and map errors back to source
// ---------------------------------------------------------------------------

interface TypeErrorInfo {
  file: string
  tscLine: number
  sourceMdx: string
  sourceLine: number
  message: string
}

function parseErrors(tscOutput: string, blocks: CodeBlock[], ext: string): TypeErrorInfo[] {
  const errors: TypeErrorInfo[] = []
  const lineRegex = /^(.+?)\((\d+),\d+\): error TS\d+: (.+)$/gm

  const fileToBlock = new Map<string, CodeBlock>()
  let idx = 0
  for (const block of blocks) {
    if (block.kind === 'skip' || block.kind === 'interface')
      continue
    idx++
    fileToBlock.set(`block_${String(idx).padStart(3, '0')}${ext}`, block)
  }

  let match = lineRegex.exec(tscOutput)
  while (match !== null) {
    const file = basename(match[1])
    const tscLine = Number.parseInt(match[2], 10)
    const message = match[3]

    const block = fileToBlock.get(file)
    if (block) {
      errors.push({ file, tscLine, sourceMdx: block.source, sourceLine: block.line, message })
    }
    match = lineRegex.exec(tscOutput)
  }

  return errors
}

// ---------------------------------------------------------------------------
// 5. Main
// ---------------------------------------------------------------------------

async function main() {
  const configPaths = findConfigs(ROOT)

  if (configPaths.length === 0) {
    console.log('No typecheck.config.ts files found.')
    process.exit(0)
  }

  console.log(`Found ${configPaths.length} typecheck config(s):\n${configPaths.map(p => `  ${relative(ROOT, p)}`).join('\n')}\n`)

  let totalErrors = 0

  for (const configPath of configPaths) {
    const configDir = dirname(configPath)
    const relDir = relative(ROOT, configDir)
    const mod = await import(configPath)
    const config: TypecheckConfig = mod.default
    const langInfo = LANG_TAGS[config.lang]

    if (!langInfo) {
      console.error(`Unknown lang "${config.lang}" in ${relative(ROOT, configPath)}`)
      process.exit(1)
    }

    console.log(`\n--- ${relDir}/ (${config.sdkPackage}) ---\n`)

    // Find MDX files in this directory tree
    const mdxFiles = findMdxFiles(configDir)
    if (mdxFiles.length === 0) {
      console.log('  No MDX files found, skipping.')
      continue
    }
    console.log(`  Found ${mdxFiles.length} MDX file(s)`)

    // Extract code blocks
    const allBlocks: CodeBlock[] = []
    for (const file of mdxFiles) {
      allBlocks.push(...extractBlocks(file, langInfo.tags, config.sdkPackage, configDir))
    }

    const checkable = allBlocks.filter(b => b.kind !== 'skip' && b.kind !== 'interface')
    const interfaces = allBlocks.filter(b => b.kind === 'interface').length
    const skipped = allBlocks.filter(b => b.kind === 'skip').length
    console.log(`  Extracted ${allBlocks.length} code blocks (${checkable.length} to check, ${interfaces} interface skipped, ${skipped} non-code skipped)`)

    if (checkable.length === 0) {
      console.log('  Nothing to check.')
      continue
    }

    // Clean and prepare output directory (per config to avoid collisions)
    const outputDir = join(OUTPUT_DIR, relDir.replace(/\//g, '__'))
    if (existsSync(outputDir))
      rmSync(outputDir, { recursive: true })
    mkdirSync(outputDir, { recursive: true })

    // Assemble files
    const files = assemble(allBlocks, config, langInfo.ext)
    for (const [name, content] of files) {
      writeFileSync(join(outputDir, name), content)
    }
    console.log(`  Wrote ${files.size} files`)

    // Write a tsconfig for this batch that extends the shared one
    const batchTsconfig = join(outputDir, 'tsconfig.json')
    writeFileSync(batchTsconfig, JSON.stringify({
      extends: relative(outputDir, TSCONFIG_CHECK),
      include: [`./*${langInfo.ext}`],
    }, null, 2))

    // Run type checker
    const cmd = `tsgo --project ${batchTsconfig} --noEmit`
    console.log(`  Running: tsgo --noEmit\n`)
    try {
      execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf-8' })
      console.log(`  All ${checkable.length} code blocks type-check successfully!`)
    }
    catch (err: any) {
      const output = (err.stdout || '') + (err.stderr || '')
      const errors = parseErrors(output, allBlocks, langInfo.ext)

      if (errors.length === 0) {
        console.error('  Type checking failed:\n')
        console.error(output)
        totalErrors++
      }
      else {
        totalErrors += errors.length
        console.error(`  Found ${errors.length} type error(s):\n`)
        for (const e of errors) {
          console.error(`    ${e.sourceMdx}:${e.sourceLine}`)
          console.error(`      ${e.message}\n`)
        }
      }
    }

    // Run format checker on raw code blocks
    const fmtDir = join(OUTPUT_DIR, `${relDir.replace(/\//g, '__')}__fmt`)
    if (existsSync(fmtDir))
      rmSync(fmtDir, { recursive: true })
    mkdirSync(fmtDir, { recursive: true })

    const fmtBlocks = allBlocks.filter(b => b.kind !== 'skip')
    let fmtIdx = 0
    const fmtFileToBlock = new Map<string, CodeBlock>()
    for (const block of fmtBlocks) {
      fmtIdx++
      const name = `block_${String(fmtIdx).padStart(3, '0')}${langInfo.ext}`
      const code = sanitize(block.code)
      // Prepend `export {};` to make it a module (enables top-level `for await`, `await using`)
      writeFileSync(join(fmtDir, name), `export {};\n${code}\n`)
      fmtFileToBlock.set(name, block)
    }

    console.log(`\n  Running: oxfmt --check\n`)
    try {
      execSync(`oxfmt --check ${fmtDir}`, { cwd: ROOT, stdio: 'pipe', encoding: 'utf-8' })
      console.log(`  All ${fmtBlocks.length} code blocks are formatted correctly!`)
    }
    catch (fmtErr: any) {
      const fmtOutput: string = (fmtErr.stdout || '') + (fmtErr.stderr || '')
      // oxfmt --check lists files that differ
      const unformatted = fmtOutput.split('\n')
        .map(l => l.trim())
        .filter(l => l.endsWith(langInfo.ext))
        .map(l => basename(l))

      if (unformatted.length === 0) {
        console.error('  Format check failed:\n')
        console.error(fmtOutput)
        totalErrors++
      }
      else {
        totalErrors += unformatted.length
        console.error(`  Found ${unformatted.length} unformatted code block(s):\n`)
        for (const f of unformatted) {
          const block = fmtFileToBlock.get(f)
          if (block) {
            console.error(`    ${block.source}:${block.line}`)
          }
        }
        console.error('')
        console.error('  Run `oxfmt --write` on the MDX code blocks to fix formatting.')
        console.error('')
      }
    }
  }

  if (totalErrors > 0) {
    console.error(`\nFailed with ${totalErrors} error(s).`)
    process.exit(1)
  }

  console.log('\nAll docs type-check successfully!')
}

main()
