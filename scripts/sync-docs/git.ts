import { execFileSync } from 'node:child_process'
import process from 'node:process'

export function runSourceGit(args: string[]) {
  // Hooks export repository-local variables that override even `git -C`.
  // Source clones must not inherit the parent worktree or index.
  const env = { ...process.env }
  const localVariables = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
  for (const key of localVariables.trim().split('\n'))
    delete env[key]

  return execFileSync('git', args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
}
