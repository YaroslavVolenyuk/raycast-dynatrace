# Dynatrace Connector for Raycast

Monitor your Dynatrace environment directly from Raycast — logs, problems, DQL,
deployments and entities, without leaving your keyboard.

> **Status: Phase 0 — foundation.** This repository is a ground-up rewrite of the
> original prototype, rebuilt to dynatrace-oss engineering standards. This commit
> establishes the layered architecture, tooling and CI gates. Commands are ported
> in Phase 1 (see the rewrite plan).

## Architecture

The codebase is split into three layers with a hard, lint-enforced boundary:

```
src/
├── sdk/        Layer 1 — standalone Dynatrace client (no Raycast, no React)
│   ├── auth/        OAuth client-credentials, token cache, TenantConfig
│   ├── http/        single transport: timeout, 401-retry, pagination, errors
│   ├── grail/       DQL execution, query builders
│   └── resources/   one module per resource (endpoints + zod schemas + normalizers)
├── services/   Layer 2 — application logic (no fetch, no JSX)
├── ui/         Layer 3 — Raycast presentation (thin: hooks + rendering)
└── mocks/      fixtures-derived mock data + mock transport
```

Rules that make the boundary real (enforced by ESLint `no-restricted-imports`
and a CI grep):

- `src/sdk` imports nothing from `@raycast/api`, `@raycast/utils`, or `react`.
- No layer imports a layer above it (`sdk` ✗→ `services`/`ui`; `services` ✗→ `ui`).
- All network calls live in `src/sdk/http`.

## Development

Requires Node 22 or newer.

```bash
npm install
npm run lint        # eslint (incl. layer boundary rules)
npm run typecheck   # tsc --noEmit
npm test            # jest
```

`npm run dev` / `npm run build` (Raycast CLI) become active in Phase 1, once
commands are added to the manifest.

## License

Apache-2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

This is an independent, community-built extension and is not an official
Dynatrace product.
