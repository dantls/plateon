# Contributing

## Base Stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router, RSC) | 16.2.9 |
| UI | React | 19.2.4 |
| Language | TypeScript strict | 5.x |
| Styling | Tailwind CSS (CSS-first, no JS config) | 4.x |
| Components | shadcn/ui, `radix-nova` style | 4.x |
| Icons | lucide-react | — |
| Validation | Zod | 4.x |

## Formatting & Git Hooks

**Prettier 3.x** — configured in `.prettierrc`

| Option | Value |
|---|---|
| `semi` | true |
| `singleQuote` | false |
| `tabWidth` | 2 |
| `trailingComma` | all |
| `printWidth` | 80 |
| plugin | `prettier-plugin-tailwindcss` (auto-sorts Tailwind classes) |

**Husky + lint-staged** — pre-commit hook at `.husky/pre-commit`

On every `git commit`, runs only on staged files:
- `*.{ts,tsx,js,jsx}` → `prettier --write` + `eslint --fix --max-warnings 0`
- `*.{json,css,md}` → `prettier --write`

If ESLint finds errors it cannot auto-fix, the commit is blocked.

```bash
npm run format        # format all files
npm run format:check  # check without modifying (CI)
```

## Lint

**ESLint 9 (flat config)**

Configured in `eslint.config.mjs`. Extends `next/core-web-vitals` + `next/typescript` and adds:

| Rule | Level | Reason |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | error | Enforces explicit typing; Zod makes `any` unnecessary |
| `@typescript-eslint/no-unused-vars` | error | `_prefix` accepted for intentional discards |
| `@typescript-eslint/consistent-type-imports` | error | Inline `import type` — tree-shaking and clarity |
| `react-hooks/exhaustive-deps` | error | Prevents stale closures in hooks |
| `no-console` | warn | Allows `console.warn/error`; blocks `console.log` in production |
| `simple-import-sort/imports` | error | Order: react/next → external → `@/` → relative |

Test-specific rules (applied automatically to `*.test.*`):
- `testing-library/` — prevents RTL anti-patterns (wrong queries, misused `waitFor`)
- `vitest/no-focused-tests` — error: blocks `it.only` from reaching CI
- `vitest/no-disabled-tests` — warn: catches forgotten `it.skip`

```bash
npm run lint            # check
npm run lint -- --fix   # auto-fix
```

## Schema Validation (Zod)

- Schemas always exported as `const` with a descriptive name
- Types inferred via `z.infer<typeof Schema>` — never declared manually
- `z.object` for entities, `z.string().min(1)` instead of `.nonempty()` (Zod v4)

## Testing

| Layer | Tool | Version |
|---|---|---|
| Unit / Component | Vitest + React Testing Library | vitest 4.x, RTL 16.x |
| Extra matchers | `@testing-library/jest-dom` | 6.x |
| User interaction | `@testing-library/user-event` | 14.x |
| E2E | Playwright | 1.61.x |

Jest was discarded: friction with pure ESM from Tailwind 4 + Next.js 16.

**Conventions:**
- Test files colocated or in `__tests__/`: `*.test.tsx` / `*.spec.tsx`
- Globals enabled (`describe`, `it`, `expect` without imports)
- Async Server Components: test via E2E (Playwright), not Vitest — React ecosystem limitation

**Playwright — `playwright.config.ts`:**
- Tests in `e2e/`
- Local: Chromium only, reuses existing dev server, 0 retries
- CI (`CI=true`): Chromium + Firefox + WebKit, 1 worker, 2 retries, GitHub reporter
- `webServer` starts Next.js automatically before running tests

```bash
npm test              # watch mode (Vitest)
npm run test:ci       # single run (Vitest CI)
npm run test:coverage # coverage via v8
npm run e2e           # headless E2E
npm run e2e:ui        # Playwright interactive UI
npm run e2e:debug     # Playwright debugger
```

## AI Agent Behavior

**Ponytail** — installed globally via `/plugin install ponytail@ponytail`

Enforces a "lazy senior dev" coding ladder before writing any code:

1. Does this need to exist? (YAGNI) → skip it
2. Already in this codebase? → reuse it
3. Stdlib does it? → use it
4. Native platform feature? → use it
5. Installed dependency covers it? → use it
6. Can it be one line? → make it one line
7. Only then: write the minimum that works

Intentional simplifications are marked with a `ponytail:` comment naming the known ceiling and upgrade path.

## Claude Code MCPs

Configured in `.mcp.json` (project root) and enabled in `.claude/settings.json`. Everything at project level — nothing in the user profile.

| MCP | Package | Purpose |
|---|---|---|
| shadcn | `shadcn@latest mcp` (built into CLI) | Component reference, installation, and shadcn/ui customization |
| playwright | `@playwright/mcp@latest` | Browser navigation and E2E test execution via MCP |
| context7 | `@upstash/context7-mcp@latest` | Up-to-date docs for stack libs (Next.js, React, Zod, Tailwind, etc.) |
| git | `mcp-server-git` via `uvx` | Local git operations (status, diff, log, commit, branch, etc.) |

## Docker

`output: "standalone"` enabled in `next.config.ts` — Next.js generates `.next/standalone` with only the files required to run.

**Multi-stage build (`Dockerfile`):**

| Stage | Base | What it does |
|---|---|---|
| `deps` | `node:22-alpine` | `npm ci` — installs all dependencies |
| `builder` | `node:22-alpine` | `npm run build` — compiles the application |
| `runner` | `node:22-alpine` | Copies standalone + static only, runs as non-root user |

- Final image: ~204 MB
- Non-root user (`nextjs:nodejs` uid/gid 1001)
- Telemetry disabled (`NEXT_TELEMETRY_DISABLED=1`)
- `.dockerignore` excludes tests, dev configs, `.git`, `.env*`

```bash
docker build -t plateon-web .   # build
docker compose up               # run locally on port 3000
docker compose up --build       # rebuild and run
```
