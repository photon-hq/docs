import { copyFileSync, mkdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

function resolveAssetPath(root: string, path: string): string {
  const absolute = resolve(root, path)
  const rel = relative(root, absolute)
  if (isAbsolute(path) || !rel || rel === '..' || rel.startsWith(`..${sep}`))
    throw new Error(`asset path must stay within its root: ${path}`)
  return absolute
}

// Assets bypass Vellum so contracts retain their original bytes and filenames.
export function copySourceAssets(
  source: string,
  contentDir: string,
  siteRoot: string,
  assets: Record<string, string>,
): void {
  for (const [from, to] of Object.entries(assets)) {
    const input = resolveAssetPath(contentDir, from)
    const output = resolveAssetPath(siteRoot, to)
    if (!statSync(input, { throwIfNoEntry: false })?.isFile())
      throw new Error(`source "${source}": asset file is missing or not a file (${from})`)
    mkdirSync(dirname(output), { recursive: true })
    copyFileSync(input, output)
  }
}
