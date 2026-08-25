# Photon docs v2

This private repository contains the ground-up rewrite of Photon documentation.
It deploys as a separate Mintlify site and does not share the generated-content
pipeline used by `photon-hq/docs`.

## Local development

Use Node.js 22, then run:

```bash
npx --yes mint@latest dev
```

The local site is available at `http://localhost:3000`.

## Validation

Before pushing changes, run:

```bash
npx --yes mint@latest validate
npx --yes mint@latest broken-links
```

Mintlify deploys the `main` branch after the repository is connected in the
Mintlify dashboard.
