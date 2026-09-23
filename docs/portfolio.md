---
title: Example Project
description: Reference Portfolio.md that Gitsink parses. Copy this into a repo root and edit it.
tags: [example, reference]
featured: true
published: true
category: reference
order: 1
demoUrl: https://example.com
repoUrl: https://github.com/Enochthedev/gitsink-api
homepage: https://example.com
documentation: https://example.com/docs
version: 1.0.0
license: BUSL-1.1
status: active
visibility: public
priority: medium
githubSync: true
startDate: 2026-01-01T00:00:00.000Z
lastUpdated: 2026-09-22T00:00:00.000Z
technologyStack:
  languages: [TypeScript]
  frameworks: [NestJS]
  databases: [PostgreSQL, Redis]
  tools: [Prisma, Docker]
  platforms: [Railway]
requirements:
  - Node.js 20+
  - PostgreSQL 15
installation: npm ci && npx prisma migrate deploy
usage: npm start
metrics:
  complexity: moderate
  teamSize: 1
contributors: [Enochthedev]
socialLinks:
  - platform: github
    url: https://github.com/Enochthedev
    username: Enochthedev
seo:
  keywords: [portfolio, api, gitsink]
  ogTitle: Example Project
  ogDescription: Reference Portfolio.md for Gitsink
  twitterCard: summary_large_image
custom:
  highlight: Anything extra goes under `custom` as strings, numbers, booleans, arrays or objects.
---

# Example Project

Everything above the `---` is the metadata Gitsink reads. Everything below it is the
project body, rendered as-is on your portfolio.

## Fields

`title` and `description` are the only required fields. The rest are optional, but the
enums are strict:

| Field | Allowed values |
|---|---|
| `status` | `active`, `maintenance`, `deprecated`, `archived` |
| `visibility` | `public`, `private`, `unlisted` |
| `priority` | `low`, `medium`, `high`, `critical` |
| `metrics.complexity` | `simple`, `moderate`, `complex`, `enterprise` |
| `seo.twitterCard` | `summary`, `summary_large_image`, `app`, `player` |

Every `*Url`, `homepage`, `documentation`, `changelog`, `issues`, `wiki`, `image` and
`socialLinks[].url` must be a full URL. Dates (`startDate`, `endDate`, `lastUpdated`)
must be ISO 8601 with a time component, e.g. `2026-01-01T00:00:00.000Z`.

## Validating before you commit

```bash
npx ts-node scripts/validate-markdown.ts docs/portfolio.md
```

CI runs the same check against this file on every pull request that touches the parser,
so it stays in step with `src/parser/types/portfolio.schema.ts`.
