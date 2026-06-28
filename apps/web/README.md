# plateon/web

Next.js 16 web application.

## Stack

- **Next.js 16** — App Router, React Server Components
- **React 19** + **TypeScript** (strict)
- **Tailwind CSS 4** — CSS-first config
- **shadcn/ui** — `radix-nova` style
- **Zod 4** — schema validation

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run format` | Format all files with Prettier |
| `npm run format:check` | Check formatting without modifying |
| `npm test` | Run unit tests (watch mode) |
| `npm run test:ci` | Run unit tests once (CI) |
| `npm run test:coverage` | Run unit tests with coverage |
| `npm run e2e` | Run E2E tests (headless) |
| `npm run e2e:ui` | Run E2E tests with Playwright UI |
| `npm run e2e:debug` | Run E2E tests in debug mode |

## Testing

- **Unit / Component**: Vitest + React Testing Library — files named `*.test.tsx`
- **E2E**: Playwright — files in `e2e/`

```bash
npm run test:ci   # unit tests
npm run e2e       # end-to-end tests
```

## Docker

```bash
docker build -t plateon-web .
docker compose up
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for tooling decisions and development conventions.
