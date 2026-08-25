# Documentation project instructions

## About this project

- This is the ground-up rewrite of Photon documentation.
- The site is built and hosted with Mintlify.
- Pages are MDX files with YAML frontmatter.
- Site configuration lives in `docs.json`.
- Run `mint dev` to preview locally.
- Run `mint validate` and `mint broken-links` before publishing.
- Use Node.js 22 for Mintlify CLI commands.

## Content ownership

- Write source content directly in this repository.
- Do not copy generated files or generation workflows from `photon-hq/docs`.
- Do not import content from another repository unless the project explicitly
  adopts that source as an owner.
- Treat the existing Photon documentation as reference material, not as the
  structure for this rewrite.

## Style

- Use active voice and second person ("you").
- Keep sentences concise and focused on one idea.
- Use sentence case for headings.
- Bold UI labels, such as **Settings**.
- Use code formatting for commands, paths, file names, and code references.
- Avoid marketing language and filler.

## Mintlify conventions

- Add every visible page to the navigation in `docs.json`.
- Use root-relative internal links without file extensions.
- Give every MDX page a `title` and `description` in frontmatter.
- Prefer built-in Mintlify components over custom components.
