# Documentation project instructions

## About this project

- This is the ground-up rewrite of Photon documentation.
- The site is built and hosted with Mintlify.
- Pages are MDX files with YAML frontmatter.
- Site configuration lives in `docs.base.json`; `docs.json` is generated.
- Run `pnpm install`, then `pnpm docs:generate` before previewing.
- Run `mint dev` to preview locally.
- Run `mint validate` and `mint broken-links` before publishing.
- Use Node.js 24 for the build pipeline and Mintlify CLI commands.

## Content ownership

This repository aggregates documentation from more than one place. Before
editing, work out which of the three a page belongs to:

1. **Plain `.mdx` at the repo root** — owned here, committed as-is, no build
   step. This is the default for new prose.
2. **`docs-src/**/*.mdx.vel`** — owned here, but templated. `vellum build`
   renders them to `.mdx` at the matching root path.
3. **A source repo** — SDK docs authored next to the code and pulled in at build
   time. Sources are declared in `scripts/sources.json`. Never edit the synced
   copies; edit them in the source repo and re-run the sync.

Rules:

- Do not edit `docs.json`, `.vellum-src/`, `llms*.txt`, or any generated `.mdx`.
  They are gitignored here and regenerated on every build. Edit
  `docs.base.json`, the templates, or the source repo instead.
- Adding a source repo means: an entry in `scripts/sources.json`, a `nav.json`
  fragment in that repo's docs directory, its generated `.mdx` output paths in
  `.gitignore`, and the repo added to the `repositories:` list in both workflows.
- Treat the existing `photon-hq/docs` site as reference material, not as the
  structure for this rewrite.

## Navigation

- `docs.base.json` is the navigation skeleton and is owned here.
- A `{"$source": "<name>", "group": "<group>"}` marker in it is replaced, in
  place, by that group from the source's `nav.json` fragment — so group order
  stays owned by this repo while page lists stay owned by the source.
- Add every visible page to the navigation, either directly in `docs.base.json`
  or in the owning source's `nav.json`.
- Group names in a source's `nav.json` are a cross-repo contract. `build-nav`
  hard-fails on a marker whose group is missing, and sources are pulled at their
  `ref` at build time — so renaming a group in a source repo breaks this build
  before anyone edits `docs.base.json`. Rename on both sides in one go.

## Style

- Use active voice and second person ("you").
- Keep sentences concise and focused on one idea.
- Use sentence case for headings.
- Bold UI labels, such as **Settings**.
- Use code formatting for commands, paths, file names, and code references.
- Avoid marketing language and filler.

## Mintlify conventions

- Use root-relative internal links without file extensions.
- Give every MDX page a `title` and `description` in frontmatter.
- Prefer built-in Mintlify components over custom components.
