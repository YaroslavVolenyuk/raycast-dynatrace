# Contributing

Thanks for your interest in improving the Dynatrace Connector for Raycast.
This document describes how to set up your environment, the quality bar a change
must clear, and how to submit it.

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Development setup

Requires **Node 22 or newer** (the Raycast CLI can fail on older Node).

```bash
git clone https://github.com/<owner>/raycast-dynatrace.git
cd raycast-dynatrace
npm install
```

Common commands:

```bash
npm run lint        # eslint, including the layer-boundary rules
npm run typecheck   # tsc --noEmit
npm test            # jest
npm run dev         # ray develop
npm run build       # ray build
npm run knip        # unused files/exports/dependencies
```

## Architecture & boundaries

The codebase is split into three layers with a hard, enforced boundary:

```
src/sdk        Layer 1 — standalone Dynatrace client (no Raycast, no React)
src/services   Layer 2 — application logic (no fetch, no JSX)
src/ui         Layer 3 — Raycast presentation (thin: hooks + rendering)
```

Non-negotiable rules (enforced by ESLint `no-restricted-imports` and a CI grep):

- `src/sdk` imports nothing from `@raycast/api`, `@raycast/utils`, or `react`.
- No layer imports a layer above it.
- All network calls live in `src/sdk/http`. Calling `fetch` from a command fails review.
- Resource modules export **normalized domain models**, never raw API shapes.

## Contract-first against the real API

We do not invent schemas. For every endpoint the SDK touches, capture one
**sanitized** live response into `src/sdk/resources/__fixtures__/<resource>/<endpoint>.json`
and add a contract test asserting `schema.parse(fixture)` succeeds.

> A PR that adds an endpoint without a fixture will be rejected.

Never commit real tokens or unsanitized tenant data in fixtures.

## Quality gates

A change must pass all of the following before it can be merged:

- `npm run lint`, `npm run typecheck`, and `npm test` are green.
- The SDK layer boundary is respected (no Raycast/React in `src/sdk`).
- New code is covered by tests. Coverage targets (enforced as the SDK grows):
  **70%** overall, **80%** on new code, **90%** for `src/sdk/http` and `src/sdk/auth`.
- No secrets are introduced (gitleaks must pass).
- **No placeholder data.** A metric we can't fetch is not rendered; a feature we
  can't implement is not added to the manifest.

## Definition of Done (per command)

A command is *done* when:

1. every API call goes through the SDK with a fixture-backed schema;
2. loading / empty / error states are rendered distinctly (a failure is never
   visually identical to "all healthy");
3. required scopes are declared in the resource module and surfaced in the 403
   error message and docs;
4. it works in mock mode via the mock transport;
5. it has a deep link to the corresponding Dynatrace app;
6. the README table and docs page are updated;
7. integration smoke covers it.

## Commits & pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
  `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:` …
  These drive semantic versioning and the changelog.
- Keep PRs focused — one resource / concern per PR. No resource merges while
  another is half-done.
- Fill in the pull request template, link any related issue, and describe how you
  verified the change (commands run, results).
- Update [CHANGELOG.md](./CHANGELOG.md) under `## [Unreleased]` when your change is
  user-facing.

## License

By contributing, you agree that your contributions are licensed under the
[MIT](./LICENSE) license.
