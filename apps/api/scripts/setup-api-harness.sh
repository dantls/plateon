#!/usr/bin/env bash
# setup-api-harness.sh
# Reproduces the full project harness for a Fastify 5 + TypeScript API.
# Usage: bash setup-api-harness.sh
#
# ── What this script sets up ──────────────────────────────────────────────────
#
# RUNTIME & BUILD
#   fastify 5.x                     Web framework (Node.js)
#   tsx 4.x                         TypeScript runner for dev (tsx watch)
#   typescript 5.x strict           Compiled to dist/ for production
#   tsconfig.build.json             Excludes test files from production build
#
# FASTIFY PLUGINS
#   @fastify/cors                   CORS headers
#   @fastify/helmet                 Security headers
#   @fastify/sensible               Error helpers (notFound, badRequest, etc.)
#   fastify-type-provider-zod       Zod schema integration for routes
#
# VALIDATION
#   zod 4.x                         Schema validation and type inference
#
# LINTING
#   eslint 9.x (flat config)        TypeScript rules only, no React
#   typescript-eslint strict        strictTypeChecked preset
#   eslint-plugin-simple-import-sort  Import ordering
#   no-console → warn (console.warn/error/info allowed)
#
# FORMATTING
#   prettier 3.x                    Code formatter (shared config with web)
#
# TESTING
#   vitest 3.x                      Test runner, environment: node
#   @vitest/coverage-v8             Coverage reports
#
# DOCKER
#   Dockerfile                      Multi-stage build (deps → builder → runner)
#   docker-compose.yml              Runs API in isolation on port 3001
#   node:22-alpine base             Non-root user fastify:nodejs uid/gid 1001
#
# MCP SERVERS (Claude Code — .mcp.json + .claude/settings.json)
#   context7     npx @upstash/context7-mcp      Up-to-date docs (Fastify, Zod, Node.js)
#   git          uvx mcp-server-git             Local git operations via MCP
#   (shadcn and playwright omitted — not relevant for a backend API)
#
# STRUCTURE
#   src/app.ts                      Fastify instance + Zod type provider
#   src/server.ts                   Entry point (listen)
#   src/plugins/cors.ts             CORS plugin registration
#   src/plugins/sensible.ts         Sensible plugin registration
#   src/routes/health.ts            GET /health → { status, timestamp }
#   .env.example                    PORT, HOST, LOG_LEVEL, CORS_ORIGIN
#
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo ">>> Installing dependencies..."

npm install \
  fastify \
  @fastify/cors \
  @fastify/helmet \
  @fastify/sensible \
  fastify-type-provider-zod \
  zod

npm install --save-dev \
  typescript \
  tsx \
  @types/node \
  vitest \
  @vitest/coverage-v8 \
  eslint \
  typescript-eslint \
  "@eslint/js" \
  eslint-plugin-simple-import-sort \
  prettier

# ── tsconfig.json ─────────────────────────────────────────────────────────────
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# ── tsconfig.build.json ───────────────────────────────────────────────────────
cat > tsconfig.build.json << 'EOF'
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.spec.ts"]
}
EOF

# ── eslint.config.mjs ─────────────────────────────────────────────────────────
cat > eslint.config.mjs << 'EOF'
import js from "@eslint/js";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
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
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
);
EOF

# ── vitest.config.mts ─────────────────────────────────────────────────────────
cat > vitest.config.mts << 'EOF'
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["node_modules", "dist", "**/*.config.*"],
    },
  },
});
EOF

# ── .prettierrc ───────────────────────────────────────────────────────────────
cat > .prettierrc << 'EOF'
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 80
}
EOF

# ── Dockerfile ────────────────────────────────────────────────────────────────
cat > Dockerfile << 'EOF'
FROM node:22-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 fastify
COPY --from=deps --chown=fastify:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=fastify:nodejs /app/dist ./dist
USER fastify
EXPOSE 3001
CMD ["node", "dist/server.js"]
EOF

# ── docker-compose.yml ────────────────────────────────────────────────────────
cat > docker-compose.yml << 'EOF'
services:
  api:
    build:
      context: .
      target: runner
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - HOST=0.0.0.0
      - LOG_LEVEL=info
      - CORS_ORIGIN=http://localhost:3000
    restart: unless-stopped
EOF

# ── .env.example ──────────────────────────────────────────────────────────────
cat > .env.example << 'EOF'
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:3000
EOF

# ── .gitignore ────────────────────────────────────────────────────────────────
cat > .gitignore << 'EOF'
node_modules
dist
.env
coverage
EOF

# ── package.json scripts ──────────────────────────────────────────────────────
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.scripts = {
    ...pkg.scripts,
    'dev': 'tsx watch src/server.ts',
    'build': 'tsc --project tsconfig.build.json',
    'start': 'node dist/server.js',
    'lint': 'eslint .',
    'lint:fix': 'eslint . --fix',
    'format': 'prettier --write .',
    'format:check': 'prettier --check .',
    'test': 'vitest',
    'test:ci': 'vitest run',
    'test:coverage': 'vitest run --coverage',
  };
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# ── .mcp.json ─────────────────────────────────────────────────────────────────
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
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
  "enabledMcpjsonServers": ["context7", "git"]
}
EOF

# ── source files ──────────────────────────────────────────────────────────────
mkdir -p src/plugins src/routes

cat > src/plugins/cors.ts << 'EOF'
import fastifyCors from "@fastify/cors";
import { type FastifyInstance } from "fastify";

export async function corsPlugin(app: FastifyInstance) {
  await app.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN ?? "*",
  });
}
EOF

cat > src/plugins/sensible.ts << 'EOF'
import fastifySensible from "@fastify/sensible";
import { type FastifyInstance } from "fastify";

export async function sensiblePlugin(app: FastifyInstance) {
  await app.register(fastifySensible);
}
EOF

cat > src/routes/health.ts << 'EOF'
import { type FastifyInstance } from "fastify";
import { z } from "zod";

const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string(),
});

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", {
    schema: {
      response: { 200: healthResponseSchema },
    },
    handler: async () => ({
      status: "ok" as const,
      timestamp: new Date().toISOString(),
    }),
  });
}
EOF

cat > src/app.ts << 'EOF'
import fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

import { corsPlugin } from "./plugins/cors.js";
import { sensiblePlugin } from "./plugins/sensible.js";
import { healthRoutes } from "./routes/health.js";

export function buildApp() {
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  void app.register(corsPlugin);
  void app.register(sensiblePlugin);
  void app.register(healthRoutes);

  return app;
}
EOF

cat > src/server.ts << 'EOF'
import { buildApp } from "./app.js";

const app = buildApp();

try {
  await app.listen({
    port: Number(process.env.PORT ?? 3001),
    host: process.env.HOST ?? "0.0.0.0",
  });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
EOF

echo ""
echo "✓ API harness setup complete."
echo ""
echo "Next steps:"
echo "  npm run dev          start dev server (port 3001)"
echo "  npm test             run unit tests"
echo "  npm run build        compile to dist/"
echo "  npm run lint         check lint"
echo "  npm run format       format all files"
