# Photon docs v2

This private repository contains the ground-up rewrite of Photon documentation.
It deploys as a separate Mintlify site.

It is an **aggregator**: pages can live here, or be authored next to the code in
the repo they document and pulled in at build time.

## Where docs live

| Kind              | Location                           | Built by                             |
| ----------------- | ---------------------------------- | ------------------------------------ |
| Plain pages       | `*.mdx` at the repo root           | nothing — committed as-is            |
| Templated pages   | `docs-src/**/*.mdx.vel`            | `vellum build`                       |
| Source-repo pages | declared in `scripts/sources.json` | `scripts/sync-docs` + `vellum build` |

Registered sources:

| Source       | Repo                                                        | Mount | Owns                                                      |
| ------------ | ----------------------------------------------------------- | ----- | --------------------------------------------------------- |
| `photon-cli` | [photon-hq/cli-beta](https://github.com/photon-hq/cli-beta) | `cli` | The whole **CLI** tab, from that repo's `docs/` on `main` |

## Build pipeline

```bash
pnpm install
pnpm docs:generate
```

which runs:

1. `scripts/sync-docs` — assembles `.vellum-src/` from `docs-src/` plus each
   source in `scripts/sources.json` (blobless clone + cone sparse checkout of the
   source's docs directory at its configured `ref`). Each source's `nav.json` is
   copied to `.vellum-src/.nav/<mount>.json`.
2. `scripts/build-nav` — merges `docs.base.json` with those nav fragments and
   writes `docs.json`.
3. `vellum build` — renders `.vellum-src/**/*.mdx.vel` to `.mdx` at the repo root.
4. `scripts/llms-generator` — writes `llms.txt`, `llms-full.txt`, and a
   per-tab `llms-<tab>.txt` from `docs.json` and the rendered pages.

`docs.json`, `.vellum-src/`, `llms*.txt`, and generated `.mdx` are gitignored.
**Don't edit `docs.json` directly** — edit `docs.base.json` or the source's
`nav.json` fragment.

### Environment

| Variable                         | Effect                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `DOCS_SOURCE_MODE`               | `git` (strict; used by CI) or `local` (use each source's `local` path). Unset prefers `local` when present. |
| `DOCS_GH_TOKEN` / `GITHUB_TOKEN` | Token for cloning private source repos.                                                                     |
| `DOCS_REF_<name>`                | Override one source's ref. Non-alphanumerics in the name become `_`.                                        |
| `DOCS_BASE_URL`                  | Public site URL used in `llms*.txt` links.                                                                  |

## Adding a source repo

1. Author the docs in the source repo (default `docs/`), with a `nav.json`
   fragment: `{"source": "<name>", "groups": [ ...Mintlify groups... ]}`.
   Page slugs must already be prefixed with the mount.
2. Add an entry to `scripts/sources.json`.
3. Reference its groups from `docs.base.json` with
   `{"$source": "<name>", "group": "<group>"}` markers.
4. Add the source's generated `.mdx` output paths to `.gitignore`, and the repo
   to the `repositories:` list in `.github/workflows/deploy-dist.yml` and
   `.github/workflows/ci.yml`.
5. If the source's templates reference type symbols, add its npm package to both
   `package.json` devDependencies and `vellum.config.ts`.
6. Optionally add a `dispatch-docs` workflow in the source repo that sends a
   `repository_dispatch` here when its docs change.

Note the split: prose comes from the source repo's `ref` (usually `main`), while
type symbols come from the package version installed _here_. The nightly CI run
is what catches those drifting apart.

## Local development

Use Node.js 24, then run:

```bash
pnpm docs:generate
npx --yes mint@latest dev
```

The local site is available at `http://localhost:3000`.

## Validation

Before pushing changes, run:

```bash
pnpm lint
pnpm typecheck:docs
npx --yes mint@latest validate
npx --yes mint@latest broken-links
```

## Deployment

`.github/workflows/deploy-dist.yml` runs the pipeline with
`DOCS_SOURCE_MODE=git` and force-pushes the generated tree to the **`dist`**
branch, which is the branch Mintlify serves. `main` is never modified by the
build. It triggers on push to `main`, on `workflow_dispatch`, and on
`repository_dispatch` from a source repo.
