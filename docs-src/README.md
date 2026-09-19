# docs-src

Vellum templates owned by this repository.

- `*.mdx.vel` templates here are rendered to `*.mdx` at the repo root by
  `vellum build`, preserving their path (`docs-src/a/b.mdx.vel` → `a/b.mdx`).
- Plain `.mdx` pages that need no templating stay at the repo root and are
  committed directly — they do not belong here.
- A subtree owned by a source in `scripts/sources.json` is filtered out of this
  directory during sync, so the source repo always wins for its mount.
