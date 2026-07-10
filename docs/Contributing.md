# Contributing

## Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Install dependencies: `npm install`
4. Make your changes
5. Run checks: `npm run lint && npm run format && npm run test && npm run typecheck`

## Development Scripts

```bash
npm run dev          # Build + start server with file watch
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier check
npm run format:fix   # Prettier auto-format
npm test             # Run tests
npm run typecheck    # TypeScript type check
npm run benchmark    # Run performance benchmark
```

## Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add model comparison view
fix: handle empty conversation export
docs: update API documentation
refactor: extract queue logic into separate module
```

Commit messages are linted by commitlint on commit.

## Code Style

- **TypeScript** — Strict mode with `noUnusedLocals` and `noUnusedParameters`
- **Formatting** — Prettier (semicolons, single quotes, trailing commas)
- **Linting** — ESLint with `typescript-eslint` (recommended rules)
- All checks are enforced via Husky pre-commit hooks (lint-staged) and CI (GitHub Actions)

## Testing

- **Unit tests** — Vitest (run `npm test`)
- **Type checking** — `npm run typecheck` (dual tsconfig)
- **End-to-end** — Planned (Playwright)

## Pull Request Process

1. Ensure all checks pass locally
2. Update tests if adding/changing functionality
3. Update documentation if changing public APIs
4. Open a PR with a clear title and description

## Project Structure

```
ModelVerse/
├── server.ts              # Express server entry point
├── src/                   # Server-side TypeScript
│   ├── engines/           # 7 LLM backends
│   ├── plugins/           # Plugin system + 6 built-in plugins
│   ├── config-schemas.ts  # Zod validation
│   ├── profiles.ts        # Profile management
│   ├── model-metadata.ts  # Metadata CRUD
│   ├── model-scanner.ts   # Model discovery
│   └── logger.ts          # Logging
├── public/                # Client-side SPA
│   ├── index.html         # App shell
│   ├── css/               # 14 stylesheets
│   ├── src/               # 25 TypeScript modules
│   └── vendor/            # Third-party libraries
├── profiles/              # Built-in generation profiles
├── scripts/               # Build/utility scripts
├── tests/                 # Vitest tests
└── docs/                  # Documentation
```
