import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'

// A real linked-worktree hook exports GIT_DIR and GIT_INDEX_FILE. Keep the
// fixture commands independent of any Git environment running this test.
const env = { ...process.env }
for (const key of execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).trim().split('\n'))
  delete env[key]

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', ['-C', cwd, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

test('source checkout in a commit hook preserves the parent worktree and branch', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'docs source-git-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const parent = join(root, 'parent')
  const source = join(root, 'source')
  const worktree = join(root, 'worktree')
  const clone = join(root, 'clone')
  const hooks = join(root, 'hooks')
  mkdirSync(hooks)
  for (const repo of [parent, source]) {
    mkdirSync(repo)
    git(repo, 'init', '--quiet', '--initial-branch=main')
    git(repo, 'config', 'user.name', 'Docs test')
    git(repo, 'config', 'user.email', 'test@example.invalid')
    git(repo, 'config', 'core.hooksPath', hooks)
    mkdirSync(join(repo, 'docs'))
    writeFileSync(join(repo, 'docs', 'sample.md'), `${repo === parent ? 'parent' : 'source'}\n`)
    git(repo, 'add', 'docs/sample.md')
    git(repo, 'commit', '--quiet', '-m', 'fixture')
  }
  const originalMain = git(parent, 'rev-parse', 'main')
  git(parent, 'switch', '--quiet', '-c', 'primary')
  git(parent, 'worktree', 'add', '--quiet', '-b', 'topic', worktree)

  const hookScript = join(root, 'hook.mjs')
  writeFileSync(hookScript, `
import { runSourceGit } from ${JSON.stringify(new URL('./git.ts', import.meta.url).href)};
runSourceGit(['clone', '--quiet', '--no-checkout', ${JSON.stringify(source)}, ${JSON.stringify(clone)}]);
runSourceGit(['-C', ${JSON.stringify(clone)}, 'sparse-checkout', 'init', '--cone']);
runSourceGit(['-C', ${JSON.stringify(clone)}, 'sparse-checkout', 'set', 'docs']);
runSourceGit(['-C', ${JSON.stringify(clone)}, 'checkout', '--quiet', 'main']);
`)
  const quote = (value: string) => `'${value.replaceAll('\'', '\'\\\'\'')}'`
  const hook = join(hooks, 'pre-commit')
  writeFileSync(hook, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(hookScript)}\n`)
  chmodSync(hook, 0o755)
  writeFileSync(join(worktree, 'change.md'), 'pending change\n')
  git(worktree, 'add', 'change.md')
  git(worktree, 'commit', '--quiet', '-m', 'topic change')

  assert.equal(git(worktree, 'branch', '--show-current'), 'topic')
  assert.equal(git(parent, 'rev-parse', 'main'), originalMain)
  assert.equal(git(worktree, 'show', '--format=', '--name-only', 'HEAD'), 'change.md')
  assert.equal(readFileSync(join(worktree, 'docs', 'sample.md'), 'utf8'), 'parent\n')
  assert.equal(readFileSync(join(clone, 'docs', 'sample.md'), 'utf8'), 'source\n')
  assert.equal(git(worktree, 'status', '--porcelain'), '')
})
