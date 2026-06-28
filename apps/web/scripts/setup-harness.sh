#!/usr/bin/env bash
# setup-harness.sh
# Reproduces the full project harness for a Next.js 16 + React 19 app.
# Usage: bash setup-harness.sh
#
# ── What this script sets up ──────────────────────────────────────────────────
#
# FORMATTING & GIT HOOKS
#   prettier 3.x                    Code formatter
#   prettier-plugin-tailwindcss     Auto-sorts Tailwind classes
#   husky 9.x                       Git hooks manager
#   lint-staged 16.x                Runs checks only on staged files
#   pre-commit hook                 prettier --write → eslint --fix
#
# LINTING
#   eslint 9.x (flat config)        Already included by Next.js
#   eslint-plugin-simple-import-sort  Import ordering (react/next → external → @/ → relative)
#   eslint-plugin-testing-library   RTL anti-pattern prevention (test files only)
#   eslint-plugin-vitest            Vitest-specific rules (test files only)
#   Strict TypeScript rules:
#     no-explicit-any → error
#     no-unused-vars → error (_prefix accepted)
#     consistent-type-imports → error (inline import type)
#     react-hooks/exhaustive-deps → error
#     no-console → warn (console.warn/error allowed)
#
# TESTING
#   vitest 4.x                      Test runner (ESM-native, Jest-compatible API)
#   @vitejs/plugin-react            React support for Vitest
#   jsdom                           Browser environment simulation
#   @testing-library/react          Component testing utilities
#   @testing-library/dom            DOM testing utilities
#   @testing-library/user-event     User interaction simulation
#   @testing-library/jest-dom       Extra matchers (toBeInTheDocument, etc.)
#   @playwright/test 1.61.x         E2E testing (Chromium local, all browsers CI)
#
# VALIDATION
#   zod 4.x                         Schema validation (types inferred via z.infer)
#
# DOCKER
#   Dockerfile                      Multi-stage build (deps → builder → runner)
#   docker-compose.yml              Local container run on port 3000
#   node:22-alpine base             ~204 MB final image, non-root user
#   output: "standalone"            Next.js minimal production output
#
# MCP SERVERS (Claude Code — .mcp.json + .claude/settings.json)
#   shadcn        npx shadcn@latest mcp          Component reference and installation
#   playwright    npx @playwright/mcp@latest      Browser navigation and E2E via MCP
#   context7      npx @upstash/context7-mcp       Up-to-date docs for stack libs
#   git           uvx mcp-server-git              Local git operations via MCP
#
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo ">>> Installing dependencies..."

npm install --save-dev \
  eslint-plugin-simple-import-sort \
  eslint-plugin-testing-library \
  eslint-plugin-vitest \
  vitest \
  @vitejs/plugin-react \
  jsdom \
  @testing-library/react \
  @testing-library/dom \
  @testing-library/user-event \
  @testing-library/jest-dom \
  @playwright/test \
  prettier \
  prettier-plugin-tailwindcss \
  husky \
  lint-staged \
  --legacy-peer-deps

npm install zod

echo ">>> Installing Playwright browsers..."
npx playwright install chromium

echo ">>> Initializing Husky..."
npx husky init

# ── .husky/pre-commit ─────────────────────────────────────────────────────────
cat > .husky/pre-commit << 'EOF'
npx lint-staged
EOF

# ── .prettierrc ───────────────────────────────────────────────────────────────
cat > .prettierrc << 'EOF'
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 80,
  "plugins": ["prettier-plugin-tailwindcss"]
}
EOF

# ── .prettierignore ───────────────────────────────────────────────────────────
cat > .prettierignore << 'EOF'
.next
out
build
node_modules
coverage
playwright-report
test-results
public
*.md
EOF

# ── eslint.config.mjs ─────────────────────────────────────────────────────────
cat > eslint.config.mjs << 'EOF'
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import testingLibrary from "eslint-plugin-testing-library";
import vitest from "eslint-plugin-vitest";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unsafe-assignment": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "react-hooks/exhaustive-deps": "error",
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            ["^react", "^next"],
            ["^@?\\w"],
            ["^@/"],
            ["^\\."],
          ],
        },
      ],
      "simple-import-sort/exports": "error",
    },
  },
  {
    files: ["**/*.{test,spec}.{ts,tsx}"],
    plugins: {
      "testing-library": testingLibrary,
      vitest,
    },
    rules: {
      ...testingLibrary.configs.react.rules,
      ...vitest.configs.recommended.rules,
      "vitest/expect-expect": "error",
      "vitest/no-disabled-tests": "warn",
      "vitest/no-focused-tests": "error",
    },
  },
]);

export default eslintConfig;
EOF

# ── vitest.config.mts ─────────────────────────────────────────────────────────
cat > vitest.config.mts << 'EOF'
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./vitest.setup.ts",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["node_modules", ".next", "vitest.setup.ts", "**/*.config.*"],
    },
  },
});
EOF

# ── vitest.setup.ts ───────────────────────────────────────────────────────────
cat > vitest.setup.ts << 'EOF'
import "@testing-library/jest-dom/vitest";
EOF

# ── playwright.config.ts ──────────────────────────────────────────────────────
cat > playwright.config.ts << 'EOF'
import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? "github" : "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(isCI
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
        ]
      : []),
  ],
  webServer: {
    command: isCI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
EOF

# ── next.config.ts ────────────────────────────────────────────────────────────
cat > next.config.ts << 'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
EOF

# ── tsconfig.json — add vitest/jest-dom types ─────────────────────────────────
node -e "
  const fs = require('fs');
  const cfg = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
  cfg.compilerOptions.types = ['vitest/globals', '@testing-library/jest-dom'];
  fs.writeFileSync('tsconfig.json', JSON.stringify(cfg, null, 2) + '\n');
"

# ── Dockerfile ────────────────────────────────────────────────────────────────
cat > Dockerfile << 'EOF'
FROM node:22-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
RUN mkdir .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
EOF

# ── docker-compose.yml ────────────────────────────────────────────────────────
cat > docker-compose.yml << 'EOF'
services:
  web:
    build:
      context: .
      target: runner
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
EOF

# ── .dockerignore ─────────────────────────────────────────────────────────────
cat > .dockerignore << 'EOF'
.git
.gitignore
.next
.env*
!.env.example
node_modules
npm-debug.log*
coverage
playwright-report
test-results
e2e
**/*.test.*
**/*.spec.*
vitest.config.mts
vitest.setup.ts
playwright.config.ts
.husky
eslint.config.*
.prettierrc
.prettierignore
*.md
Dockerfile
docker-compose*.yml
EOF

# ── .mcp.json ─────────────────────────────────────────────────────────────────
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    },
    "git": {
      "command": "uvx",
      "args": ["mcp-server-git", "--repository", "."]
    }
  }
}
EOF

# ── .claude/settings.json ─────────────────────────────────────────────────────
mkdir -p .claude
cat > .claude/settings.json << 'EOF'
{
  "enabledMcpjsonServers": ["shadcn", "playwright", "context7", "git"]
}
EOF

# ── package.json scripts + lint-staged ────────────────────────────────────────
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.scripts = {
    ...pkg.scripts,
    'format': 'prettier --write .',
    'format:check': 'prettier --check .',
    'test': 'vitest',
    'test:ci': 'vitest run',
    'test:coverage': 'vitest run --coverage',
    'e2e': 'playwright test',
    'e2e:ui': 'playwright test --ui',
    'e2e:debug': 'playwright test --debug',
  };
  pkg['lint-staged'] = {
    '*.{ts,tsx,js,jsx}': ['prettier --write', 'eslint --fix --max-warnings 0'],
    '*.{json,css,md}': ['prettier --write'],
  };
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# ── .gitignore additions ──────────────────────────────────────────────────────
cat >> .gitignore << 'EOF'
/playwright-report
/test-results
/blob-report
EOF

# ── e2e directory ─────────────────────────────────────────────────────────────
mkdir -p e2e

echo ""
echo "✓ Harness setup complete."
echo ""
echo "Next steps:"
echo "  npm run dev          start dev server"
echo "  npm test             run unit tests"
echo "  npm run e2e          run E2E tests"
echo "  npm run lint         check lint"
echo "  npm run format       format all files"
