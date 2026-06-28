# Restaurant Menu — API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Fastify 5 REST API for the multi-tenant restaurant menu platform — schema, auth, all CRUD routes, file uploads, and admin approval — fully test-driven.

**Architecture:** Fastify 5 plugin-based architecture. JWT verification uses `@fastify/jwt` with `NEXTAUTH_SECRET` shared with the Next.js web app (NextAuth is configured in Plan 2 to emit plain HS256 JWTs). All routes use `fastify-type-provider-zod` for schema validation. PrismaClient connects via `PrismaPg` adapter. Tests use `app.inject()` against a real test database.

**Tech Stack:** Fastify 5, TypeScript strict, Prisma 7 + `@prisma/adapter-pg`, Zod 4, `@fastify/jwt`, `@fastify/multipart`, `@fastify/static`, Vitest 3.

## Global Constraints

- NodeNext module resolution — all local imports use `.js` extension
- `fastify-type-provider-zod` v7 — use `app.withTypeProvider<ZodTypeProvider>()` for typed routes
- `validatorCompiler` and `serializerCompiler` are already set in `src/app.ts` — do not set them again in plugins or routes
- `PrismaClient` is imported from `../generated/prisma/client.js` (local generated output), not `@prisma/client` — run `npx prisma generate` after every schema change
- `PrismaClient` always constructed with `PrismaPg` adapter: `new PrismaPg({ connectionString: process.env.DATABASE_URL! })`
- All Fastify plugins use `fp` from `fastify-plugin` to break encapsulation so decorators are visible app-wide
- **TDD mandatory:** write the failing test → run to confirm failure → write minimal implementation → run to confirm pass → commit
- Zod v4 API: use `z.string().min(1)` not `.nonempty()`; `z.enum(["A", "B"])` not `z.union`
- Supported locales: `"pt-BR"` and `"en-AU"` — no others
- Supported currencies: `"BRL"` and `"AUD"` — no others
- Ownership rule: every OWNER route must verify `dish/category/ingredient.restaurantId === restaurant.ownerId === request.user.sub`

---

## File Structure

**New files:**
- `apps/api/.env.test` — test environment variables
- `apps/api/src/test/setup.ts` — load `.env.test` before all tests
- `apps/api/src/test/helpers.ts` — `createTestApp`, `signOwnerToken`, `signAdminToken`, `cleanDb`, `seedUser`, `seedRestaurant`, `seedCategory`, `seedDish`, `seedIngredient`
- `apps/api/src/plugins/jwt.ts` — `authenticate` and `authorizeAdmin` preHandler decorators
- `apps/api/src/plugins/jwt.test.ts` — auth plugin tests
- `apps/api/src/routes/menu.ts` — `GET /restaurants/:slug/menu` (public)
- `apps/api/src/routes/menu.test.ts`
- `apps/api/src/routes/restaurants.ts` — `POST /restaurants`, `PUT /restaurants/:id`
- `apps/api/src/routes/restaurants.test.ts`
- `apps/api/src/routes/categories.ts` — `POST /categories`, `PUT /categories/:id`, `DELETE /categories/:id`
- `apps/api/src/routes/categories.test.ts`
- `apps/api/src/routes/dishes.ts` — `POST /dishes`, `PUT /dishes/:id`, `DELETE /dishes/:id`
- `apps/api/src/routes/dishes.test.ts`
- `apps/api/src/routes/ingredients.ts` — `POST /ingredients`, `PUT /ingredients/:id`, `DELETE /ingredients/:id`
- `apps/api/src/routes/ingredients.test.ts`
- `apps/api/src/routes/uploads.ts` — `POST /uploads`
- `apps/api/src/routes/uploads.test.ts`
- `apps/api/src/routes/admin.ts` — `GET /restaurants`, `PUT /restaurants/:id/status`
- `apps/api/src/routes/admin.test.ts`
- `apps/api/prisma/seed.ts` — seed ADMIN user

**Modified files:**
- `apps/api/prisma/schema.prisma` — add all domain models
- `apps/api/src/app.ts` — register jwt plugin, static plugin, and all new routes
- `apps/api/vitest.config.mts` — add `setupFiles`
- `apps/api/package.json` — add `@fastify/jwt`, `@fastify/multipart`, `@fastify/static`
- `apps/api/.env.example` — add `NEXTAUTH_SECRET`, `DATABASE_URL_TEST`

---

### Task 1: Prisma schema, packages, and test infrastructure

**Files:**
- Create: `apps/api/.env.test`
- Create: `apps/api/src/test/setup.ts`
- Create: `apps/api/src/test/helpers.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/vitest.config.mts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Produces: `createTestApp(): Promise<FastifyInstance>`, `signOwnerToken(app, userId, email): string`, `signAdminToken(app, userId, email): string`, `cleanDb(app): Promise<void>`, `seedUser(app, overrides?): Promise<User>`, `seedRestaurant(app, ownerId, overrides?): Promise<Restaurant>`, `seedCategory(app, restaurantId, overrides?): Promise<Category>`, `seedDish(app, categoryId, restaurantId, overrides?): Promise<Dish>`, `seedIngredient(app, restaurantId, overrides?): Promise<Ingredient>`

- [ ] **Step 1: Install new packages**

```bash
cd apps/api
npm install @fastify/jwt @fastify/multipart @fastify/static
```

Expected: `package.json` updated, no errors.

- [ ] **Step 2: Update the Prisma schema**

Replace `apps/api/prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model User {
  id          String       @id @default(cuid())
  email       String       @unique
  name        String?
  image       String?
  role        Role         @default(OWNER)
  restaurants Restaurant[]
  createdAt   DateTime     @default(now())
}

model Restaurant {
  id          String           @id @default(cuid())
  name        String
  slug        String           @unique
  logoUrl     String?
  currency    String           @default("BRL")
  status      RestaurantStatus @default(PENDING)
  ownerId     String
  owner       User             @relation(fields: [ownerId], references: [id])
  categories  Category[]
  dishes      Dish[]
  ingredients Ingredient[]
  createdAt   DateTime         @default(now())
}

model Category {
  id           String     @id @default(cuid())
  name         String
  order        Int        @default(0)
  restaurantId String
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])
  dishes       Dish[]
}

model Dish {
  id           String          @id @default(cuid())
  name         String
  description  String?
  price        Decimal         @db.Decimal(10, 2)
  imageUrl     String?
  available    Boolean         @default(true)
  categoryId   String
  category     Category        @relation(fields: [categoryId], references: [id])
  restaurantId String
  restaurant   Restaurant      @relation(fields: [restaurantId], references: [id])
  ingredients  DishIngredient[]
  createdAt    DateTime        @default(now())
}

model Ingredient {
  id           String                  @id @default(cuid())
  isAllergen   Boolean                 @default(false)
  dietaryTags  DietaryTag[]
  restaurantId String
  restaurant   Restaurant              @relation(fields: [restaurantId], references: [id])
  translations IngredientTranslation[]
  dishes       DishIngredient[]
}

model IngredientTranslation {
  id           String     @id @default(cuid())
  ingredientId String
  ingredient   Ingredient @relation(fields: [ingredientId], references: [id])
  locale       String
  name         String

  @@unique([ingredientId, locale])
}

model DishIngredient {
  dishId       String
  ingredientId String
  dish         Dish       @relation(fields: [dishId], references: [id])
  ingredient   Ingredient @relation(fields: [ingredientId], references: [id])

  @@id([dishId, ingredientId])
}

enum Role {
  OWNER
  ADMIN
}

enum RestaurantStatus {
  PENDING
  APPROVED
  REJECTED
}

enum DietaryTag {
  VEGAN
  VEGETARIAN
  GLUTEN_FREE
  LACTOSE_FREE
}
```

- [ ] **Step 3: Regenerate Prisma client and run migration**

```bash
cd apps/api
npx prisma generate
npx prisma migrate dev --name init-domain-models
```

Expected: migration file created in `prisma/migrations/`, no errors.

- [ ] **Step 4: Create a test database and `.env.test`**

Create a second PostgreSQL database named `plateon_test` (or equivalent), then create `apps/api/.env.test`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/plateon_test
NEXTAUTH_SECRET=test-secret-for-vitest-do-not-use-in-prod
LOG_LEVEL=silent
```

Apply schema to the test database:

```bash
cd apps/api
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/plateon_test npx prisma migrate deploy
```

Expected: all migrations applied to the test database.

- [ ] **Step 5: Update vitest config to load `.env.test`**

Edit `apps/api/vitest.config.mts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.ts"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      exclude: ["node_modules", "dist", "**/*.config.*"],
    },
  },
});
```

- [ ] **Step 6: Create the test setup file**

Create `apps/api/src/test/setup.ts`:

```typescript
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.test"), override: true });
```

- [ ] **Step 7: Create the test helpers**

Create `apps/api/src/test/helpers.ts`:

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../app.js";
import { PrismaClient } from "../generated/prisma/client.js";
import type {
  Category,
  Dish,
  Ingredient,
  Restaurant,
  User,
} from "../generated/prisma/models.js";

export async function createTestApp(): Promise<FastifyInstance> {
  const app = buildApp();
  await app.ready();
  return app;
}

export function signOwnerToken(
  app: FastifyInstance,
  userId: string,
  email: string,
): string {
  return app.jwt.sign({ sub: userId, email, role: "OWNER" });
}

export function signAdminToken(
  app: FastifyInstance,
  userId: string,
  email: string,
): string {
  return app.jwt.sign({ sub: userId, email, role: "ADMIN" });
}

export async function cleanDb(app: FastifyInstance): Promise<void> {
  await app.prisma.dishIngredient.deleteMany();
  await app.prisma.ingredientTranslation.deleteMany();
  await app.prisma.ingredient.deleteMany();
  await app.prisma.dish.deleteMany();
  await app.prisma.category.deleteMany();
  await app.prisma.restaurant.deleteMany();
  await app.prisma.user.deleteMany();
}

export async function seedUser(
  app: FastifyInstance,
  overrides: Partial<{ email: string; role: "OWNER" | "ADMIN" }> = {},
): Promise<User> {
  return app.prisma.user.create({
    data: {
      email: overrides.email ?? `user-${Date.now()}@test.com`,
      role: overrides.role ?? "OWNER",
    },
  });
}

export async function seedRestaurant(
  app: FastifyInstance,
  ownerId: string,
  overrides: Partial<{
    slug: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    currency: string;
  }> = {},
): Promise<Restaurant> {
  return app.prisma.restaurant.create({
    data: {
      name: "Test Restaurant",
      slug: overrides.slug ?? `test-${Date.now()}`,
      currency: overrides.currency ?? "BRL",
      status: overrides.status ?? "APPROVED",
      ownerId,
    },
  });
}

export async function seedCategory(
  app: FastifyInstance,
  restaurantId: string,
  overrides: Partial<{ name: string; order: number }> = {},
): Promise<Category> {
  return app.prisma.category.create({
    data: {
      name: overrides.name ?? "Test Category",
      order: overrides.order ?? 0,
      restaurantId,
    },
  });
}

export async function seedDish(
  app: FastifyInstance,
  categoryId: string,
  restaurantId: string,
  overrides: Partial<{ name: string; available: boolean; price: string }> = {},
): Promise<Dish> {
  return app.prisma.dish.create({
    data: {
      name: overrides.name ?? "Test Dish",
      price: overrides.price ?? "10.00",
      available: overrides.available ?? true,
      categoryId,
      restaurantId,
    },
  });
}

export async function seedIngredient(
  app: FastifyInstance,
  restaurantId: string,
  overrides: Partial<{ isAllergen: boolean }> = {},
): Promise<Ingredient> {
  return app.prisma.ingredient.create({
    data: {
      isAllergen: overrides.isAllergen ?? false,
      restaurantId,
      translations: {
        create: [
          { locale: "pt-BR", name: "Ingrediente" },
          { locale: "en-AU", name: "Ingredient" },
        ],
      },
    },
  });
}
```

- [ ] **Step 8: Update `.env.example`**

Add to `apps/api/.env.example`:
```
NEXTAUTH_SECRET=your-nextauth-secret-here
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/plateon_test
```

- [ ] **Step 9: Verify test infrastructure works**

```bash
cd apps/api
npm run test:ci
```

Expected: 0 tests run (no test files yet), no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/api/prisma/ apps/api/src/test/ apps/api/src/generated/ apps/api/vitest.config.mts apps/api/package.json apps/api/package-lock.json apps/api/.env.example apps/api/.env.test
git commit -m "chore(api): prisma schema, packages, test infrastructure"
```

---

### Task 2: JWT authentication plugin

**Files:**
- Create: `apps/api/src/plugins/jwt.ts`
- Create: `apps/api/src/plugins/jwt.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `buildApp` from `../app.js`; `createTestApp`, `signOwnerToken`, `signAdminToken`, `cleanDb` from `../test/helpers.js`
- Produces: `app.authenticate` preHandler (401 without token, 401 with invalid token, passes with valid token); `app.authorizeAdmin` preHandler (403 for OWNER role, passes for ADMIN role); `request.user.sub: string`, `request.user.email: string`, `request.user.role: "OWNER" | "ADMIN"`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/plugins/jwt.test.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDb,
  createTestApp,
  seedUser,
  signAdminToken,
  signOwnerToken,
} from "../test/helpers.js";

describe("JWT auth plugin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    // Register test-only routes before ready()
    app.register(async (testApp) => {
      testApp.get(
        "/test-protected",
        { preHandler: [testApp.authenticate] },
        async (req) => ({ userId: req.user.sub }),
      );
      testApp.get(
        "/test-admin",
        { preHandler: [testApp.authorizeAdmin] },
        async () => ({ ok: true }),
      );
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(app);
  });

  it("returns 401 with no Authorization header", async () => {
    const res = await app.inject({ method: "GET", url: "/test-protected" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 with a malformed token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/test-protected",
      headers: { authorization: "Bearer not-a-jwt" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("passes with a valid OWNER token and exposes user on request", async () => {
    const user = await seedUser(app);
    const token = signOwnerToken(app, user.id, user.email);
    const res = await app.inject({
      method: "GET",
      url: "/test-protected",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: user.id });
  });

  it("returns 403 on admin route with OWNER token", async () => {
    const user = await seedUser(app);
    const token = signOwnerToken(app, user.id, user.email);
    const res = await app.inject({
      method: "GET",
      url: "/test-admin",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("passes on admin route with ADMIN token", async () => {
    const user = await seedUser(app, { role: "ADMIN" });
    const token = signAdminToken(app, user.id, user.email);
    const res = await app.inject({
      method: "GET",
      url: "/test-admin",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
```

Fix the missing `buildApp` import at the top:
```typescript
import { buildApp } from "../app.js";
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd apps/api && npm run test:ci -- src/plugins/jwt.test.ts
```

Expected: FAIL — `app.authenticate is not a function` or similar.

- [ ] **Step 3: Implement the JWT plugin**

Create `apps/api/src/plugins/jwt.ts`:

```typescript
import fastifyJwt from "@fastify/jwt";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email: string; role: "OWNER" | "ADMIN" };
    user: { sub: string; email: string; role: "OWNER" | "ADMIN" };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    authorizeAdmin: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyJwt, {
    secret: process.env.NEXTAUTH_SECRET!,
  });

  app.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        reply.status(401).send({ error: "Unauthorized" });
      }
    },
  );

  app.decorate(
    "authorizeAdmin",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        reply.status(401).send({ error: "Unauthorized" });
        return;
      }
      if (request.user.role !== "ADMIN") {
        reply.status(403).send({ error: "Forbidden" });
      }
    },
  );
};

export const jwtPlugin = fp(plugin);
```

- [ ] **Step 4: Register the JWT plugin in app.ts**

Edit `apps/api/src/app.ts`:

```typescript
import fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

import { corsPlugin } from "./plugins/cors.js";
import { jwtPlugin } from "./plugins/jwt.js";
import { prismaPlugin } from "./plugins/prisma.js";
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
  void app.register(prismaPlugin);
  void app.register(jwtPlugin);
  void app.register(healthRoutes);

  return app;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/api && npm run test:ci -- src/plugins/jwt.test.ts
```

Expected: 5 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/plugins/jwt.ts apps/api/src/plugins/jwt.test.ts apps/api/src/app.ts
git commit -m "feat(api): JWT authentication plugin with authenticate and authorizeAdmin"
```

---

### Task 3: Public menu route

**Files:**
- Create: `apps/api/src/routes/menu.ts`
- Create: `apps/api/src/routes/menu.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `app.prisma`, `seedUser`, `seedRestaurant`, `seedCategory`, `seedDish`, `seedIngredient`, `cleanDb`, `createTestApp`
- Produces: `GET /restaurants/:slug/menu?locale=pt-BR` → `{ restaurant: { id, name, logoUrl, currency }, categories: [{ id, name, order, dishes: [{ id, name, description, price, imageUrl, ingredients: [{ id, isAllergen, dietaryTags, name }] }] }] }`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/menu.test.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDb,
  createTestApp,
  seedCategory,
  seedDish,
  seedIngredient,
  seedRestaurant,
  seedUser,
} from "../test/helpers.js";

describe("GET /restaurants/:slug/menu", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(app);
  });

  it("returns 404 for unknown slug", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/restaurants/does-not-exist/menu",
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for PENDING restaurant", async () => {
    const owner = await seedUser(app);
    await seedRestaurant(app, owner.id, { slug: "pending-rest", status: "PENDING" });
    const res = await app.inject({
      method: "GET",
      url: "/restaurants/pending-rest/menu",
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns categories and available dishes for APPROVED restaurant", async () => {
    const owner = await seedUser(app);
    const restaurant = await seedRestaurant(app, owner.id, { slug: "my-rest" });
    const category = await seedCategory(app, restaurant.id, { name: "Starters" });
    await seedDish(app, category.id, restaurant.id, { name: "Soup", available: true });
    await seedDish(app, category.id, restaurant.id, { name: "Hidden", available: false });

    const res = await app.inject({
      method: "GET",
      url: "/restaurants/my-rest/menu",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.restaurant.name).toBe("Test Restaurant");
    expect(body.categories).toHaveLength(1);
    expect(body.categories[0].dishes).toHaveLength(1);
    expect(body.categories[0].dishes[0].name).toBe("Soup");
  });

  it("returns ingredient names in the requested locale", async () => {
    const owner = await seedUser(app);
    const restaurant = await seedRestaurant(app, owner.id, { slug: "locale-rest" });
    const category = await seedCategory(app, restaurant.id);
    const ingredient = await seedIngredient(app, restaurant.id);
    const dish = await seedDish(app, category.id, restaurant.id);
    await app.prisma.dishIngredient.create({
      data: { dishId: dish.id, ingredientId: ingredient.id },
    });

    const resPt = await app.inject({
      method: "GET",
      url: "/restaurants/locale-rest/menu?locale=pt-BR",
    });
    expect(resPt.json().categories[0].dishes[0].ingredients[0].name).toBe("Ingrediente");

    const resEn = await app.inject({
      method: "GET",
      url: "/restaurants/locale-rest/menu?locale=en-AU",
    });
    expect(resEn.json().categories[0].dishes[0].ingredients[0].name).toBe("Ingredient");
  });

  it("defaults locale to pt-BR when not specified", async () => {
    const owner = await seedUser(app);
    const restaurant = await seedRestaurant(app, owner.id, { slug: "default-locale" });
    const category = await seedCategory(app, restaurant.id);
    const ingredient = await seedIngredient(app, restaurant.id);
    const dish = await seedDish(app, category.id, restaurant.id);
    await app.prisma.dishIngredient.create({
      data: { dishId: dish.id, ingredientId: ingredient.id },
    });

    const res = await app.inject({
      method: "GET",
      url: "/restaurants/default-locale/menu",
    });
    expect(res.json().categories[0].dishes[0].ingredients[0].name).toBe("Ingrediente");
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd apps/api && npm run test:ci -- src/routes/menu.test.ts
```

Expected: FAIL — route not found (404 on all requests).

- [ ] **Step 3: Implement the menu route**

Create `apps/api/src/routes/menu.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const menuResponseSchema = z.object({
  restaurant: z.object({
    id: z.string(),
    name: z.string(),
    logoUrl: z.string().nullable(),
    currency: z.string(),
  }),
  categories: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      order: z.number(),
      dishes: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().nullable(),
          price: z.string(),
          imageUrl: z.string().nullable(),
          ingredients: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              isAllergen: z.boolean(),
              dietaryTags: z.array(z.string()),
            }),
          ),
        }),
      ),
    }),
  ),
});

export const menuRoutes: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/restaurants/:slug/menu",
    {
      schema: {
        params: z.object({ slug: z.string() }),
        querystring: z.object({
          locale: z.enum(["pt-BR", "en-AU"]).default("pt-BR"),
        }),
        response: { 200: menuResponseSchema },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { locale } = request.query;

      const restaurant = await app.prisma.restaurant.findFirst({
        where: { slug, status: "APPROVED" },
        include: {
          categories: {
            orderBy: { order: "asc" },
            include: {
              dishes: {
                where: { available: true },
                include: {
                  ingredients: {
                    include: {
                      ingredient: {
                        include: {
                          translations: { where: { locale } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!restaurant) {
        return reply.status(404).send({ error: "Restaurant not found" });
      }

      return {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          logoUrl: restaurant.logoUrl,
          currency: restaurant.currency,
        },
        categories: restaurant.categories.map((cat) => ({
          id: cat.id,
          name: cat.name,
          order: cat.order,
          dishes: cat.dishes.map((dish) => ({
            id: dish.id,
            name: dish.name,
            description: dish.description,
            price: dish.price.toString(),
            imageUrl: dish.imageUrl,
            ingredients: dish.ingredients.map(({ ingredient }) => ({
              id: ingredient.id,
              name: ingredient.translations[0]?.name ?? "",
              isAllergen: ingredient.isAllergen,
              dietaryTags: ingredient.dietaryTags,
            })),
          })),
        })),
      };
    },
  );
};
```

- [ ] **Step 4: Register the menu route in app.ts**

Add to `apps/api/src/app.ts` imports and registration:

```typescript
import { menuRoutes } from "./routes/menu.js";
// ...
void app.register(menuRoutes);
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/api && npm run test:ci -- src/routes/menu.test.ts
```

Expected: 5 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/menu.ts apps/api/src/routes/menu.test.ts apps/api/src/app.ts
git commit -m "feat(api): public menu route GET /restaurants/:slug/menu"
```

---

### Task 4: Restaurant management routes

**Files:**
- Create: `apps/api/src/routes/restaurants.ts`
- Create: `apps/api/src/routes/restaurants.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `app.authenticate`, `app.prisma`, `request.user.sub`, `seedUser`, `seedRestaurant`, `cleanDb`, `createTestApp`, `signOwnerToken`
- Produces: `POST /restaurants` → 201 `{ id, name, slug, currency, status, ownerId }`; `PUT /restaurants/:id` → 200 same shape

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/restaurants.test.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDb,
  createTestApp,
  seedRestaurant,
  seedUser,
  signOwnerToken,
} from "../test/helpers.js";

describe("Restaurant routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(app);
  });

  describe("POST /restaurants", () => {
    it("returns 401 without token", async () => {
      const res = await app.inject({ method: "POST", url: "/restaurants", payload: {} });
      expect(res.statusCode).toBe(401);
    });

    it("creates a restaurant with PENDING status", async () => {
      const user = await seedUser(app);
      const token = signOwnerToken(app, user.id, user.email);
      const res = await app.inject({
        method: "POST",
        url: "/restaurants",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "My Bistro", slug: "my-bistro", currency: "BRL" },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.slug).toBe("my-bistro");
      expect(body.status).toBe("PENDING");
      expect(body.ownerId).toBe(user.id);
    });

    it("returns 409 when slug already exists", async () => {
      const user = await seedUser(app);
      const token = signOwnerToken(app, user.id, user.email);
      await seedRestaurant(app, user.id, { slug: "taken" });
      const res = await app.inject({
        method: "POST",
        url: "/restaurants",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Another", slug: "taken", currency: "BRL" },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("PUT /restaurants/:id", () => {
    it("updates own restaurant", async () => {
      const user = await seedUser(app);
      const token = signOwnerToken(app, user.id, user.email);
      const restaurant = await seedRestaurant(app, user.id);
      const res = await app.inject({
        method: "PUT",
        url: `/restaurants/${restaurant.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Updated Name" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("Updated Name");
    });

    it("returns 403 when updating another owner's restaurant", async () => {
      const owner = await seedUser(app);
      const attacker = await seedUser(app, { email: "attacker@test.com" });
      const token = signOwnerToken(app, attacker.id, attacker.email);
      const restaurant = await seedRestaurant(app, owner.id);
      const res = await app.inject({
        method: "PUT",
        url: `/restaurants/${restaurant.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Hacked" },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd apps/api && npm run test:ci -- src/routes/restaurants.test.ts
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Implement the restaurant routes**

Create `apps/api/src/routes/restaurants.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const restaurantSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
  currency: z.string(),
  status: z.string(),
  ownerId: z.string(),
});

const createBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, or hyphens"),
  logoUrl: z.string().url().optional(),
  currency: z.enum(["BRL", "AUD"]).default("BRL"),
});

const updateBody = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  logoUrl: z.string().url().nullable().optional(),
  currency: z.enum(["BRL", "AUD"]).optional(),
});

export const restaurantRoutes: FastifyPluginAsync = async (app) => {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/restaurants",
    {
      preHandler: [app.authenticate],
      schema: {
        body: createBody,
        response: { 201: restaurantSchema },
      },
    },
    async (request, reply) => {
      const { name, slug, logoUrl, currency } = request.body;
      const ownerId = request.user.sub;

      const existing = await app.prisma.restaurant.findUnique({ where: { slug } });
      if (existing) {
        return reply.status(409).send({ error: "Slug already taken" });
      }

      const restaurant = await app.prisma.restaurant.create({
        data: { name, slug, logoUrl, currency, ownerId },
      });

      return reply.status(201).send(restaurant);
    },
  );

  server.put(
    "/restaurants/:id",
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        body: updateBody,
        response: { 200: restaurantSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const ownerId = request.user.sub;

      const restaurant = await app.prisma.restaurant.findUnique({ where: { id } });
      if (!restaurant || restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const updated = await app.prisma.restaurant.update({
        where: { id },
        data: request.body,
      });

      return updated;
    },
  );
};
```

- [ ] **Step 4: Register in app.ts**

```typescript
import { restaurantRoutes } from "./routes/restaurants.js";
// ...
void app.register(restaurantRoutes);
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/api && npm run test:ci -- src/routes/restaurants.test.ts
```

Expected: 5 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/restaurants.ts apps/api/src/routes/restaurants.test.ts apps/api/src/app.ts
git commit -m "feat(api): restaurant create and update routes"
```

---

### Task 5: Category routes

**Files:**
- Create: `apps/api/src/routes/categories.ts`
- Create: `apps/api/src/routes/categories.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `app.authenticate`, `app.prisma`, `request.user.sub`, `seedUser`, `seedRestaurant`, `seedCategory`, `cleanDb`, `createTestApp`, `signOwnerToken`
- Produces: `POST /categories` → 201 `{ id, name, order, restaurantId }`; `PUT /categories/:id` → 200 same; `DELETE /categories/:id` → 204

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/categories.test.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDb,
  createTestApp,
  seedCategory,
  seedRestaurant,
  seedUser,
  signOwnerToken,
} from "../test/helpers.js";

describe("Category routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(app);
  });

  describe("POST /categories", () => {
    it("creates a category for own restaurant", async () => {
      const user = await seedUser(app);
      const token = signOwnerToken(app, user.id, user.email);
      const restaurant = await seedRestaurant(app, user.id);
      const res = await app.inject({
        method: "POST",
        url: "/categories",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Drinks", restaurantId: restaurant.id, order: 1 },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe("Drinks");
    });

    it("returns 403 when creating category for another owner's restaurant", async () => {
      const owner = await seedUser(app);
      const attacker = await seedUser(app, { email: "attacker@test.com" });
      const token = signOwnerToken(app, attacker.id, attacker.email);
      const restaurant = await seedRestaurant(app, owner.id);
      const res = await app.inject({
        method: "POST",
        url: "/categories",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Drinks", restaurantId: restaurant.id },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("PUT /categories/:id", () => {
    it("updates own category", async () => {
      const user = await seedUser(app);
      const token = signOwnerToken(app, user.id, user.email);
      const restaurant = await seedRestaurant(app, user.id);
      const category = await seedCategory(app, restaurant.id);
      const res = await app.inject({
        method: "PUT",
        url: `/categories/${category.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Updated", order: 5 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("Updated");
      expect(res.json().order).toBe(5);
    });

    it("returns 403 for another owner's category", async () => {
      const owner = await seedUser(app);
      const attacker = await seedUser(app, { email: "attacker@test.com" });
      const token = signOwnerToken(app, attacker.id, attacker.email);
      const restaurant = await seedRestaurant(app, owner.id);
      const category = await seedCategory(app, restaurant.id);
      const res = await app.inject({
        method: "PUT",
        url: `/categories/${category.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Hacked" },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("DELETE /categories/:id", () => {
    it("deletes own category", async () => {
      const user = await seedUser(app);
      const token = signOwnerToken(app, user.id, user.email);
      const restaurant = await seedRestaurant(app, user.id);
      const category = await seedCategory(app, restaurant.id);
      const res = await app.inject({
        method: "DELETE",
        url: `/categories/${category.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it("returns 403 for another owner's category", async () => {
      const owner = await seedUser(app);
      const attacker = await seedUser(app, { email: "attacker@test.com" });
      const token = signOwnerToken(app, attacker.id, attacker.email);
      const restaurant = await seedRestaurant(app, owner.id);
      const category = await seedCategory(app, restaurant.id);
      const res = await app.inject({
        method: "DELETE",
        url: `/categories/${category.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd apps/api && npm run test:ci -- src/routes/categories.test.ts
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Implement the category routes**

Create `apps/api/src/routes/categories.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number(),
  restaurantId: z.string(),
});

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/categories",
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          name: z.string().min(1),
          restaurantId: z.string(),
          order: z.number().int().min(0).default(0),
        }),
        response: { 201: categorySchema },
      },
    },
    async (request, reply) => {
      const { name, restaurantId, order } = request.body;
      const ownerId = request.user.sub;

      const restaurant = await app.prisma.restaurant.findUnique({ where: { id: restaurantId } });
      if (!restaurant || restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const category = await app.prisma.category.create({
        data: { name, order, restaurantId },
      });

      return reply.status(201).send(category);
    },
  );

  server.put(
    "/categories/:id",
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({
          name: z.string().min(1).optional(),
          order: z.number().int().min(0).optional(),
        }),
        response: { 200: categorySchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const ownerId = request.user.sub;

      const category = await app.prisma.category.findUnique({
        where: { id },
        include: { restaurant: true },
      });
      if (!category || category.restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      return app.prisma.category.update({ where: { id }, data: request.body });
    },
  );

  server.delete(
    "/categories/:id",
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const ownerId = request.user.sub;

      const category = await app.prisma.category.findUnique({
        where: { id },
        include: { restaurant: true },
      });
      if (!category || category.restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      await app.prisma.category.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
};
```

- [ ] **Step 4: Register in app.ts**

```typescript
import { categoryRoutes } from "./routes/categories.js";
// ...
void app.register(categoryRoutes);
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/api && npm run test:ci -- src/routes/categories.test.ts
```

Expected: 6 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/categories.ts apps/api/src/routes/categories.test.ts apps/api/src/app.ts
git commit -m "feat(api): category create, update, delete routes"
```

---

### Task 6: Dish routes

**Files:**
- Create: `apps/api/src/routes/dishes.ts`
- Create: `apps/api/src/routes/dishes.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `app.authenticate`, `app.prisma`, `request.user.sub`, `seedUser`, `seedRestaurant`, `seedCategory`, `seedDish`, `cleanDb`, `createTestApp`, `signOwnerToken`
- Produces: `POST /dishes` → 201 `{ id, name, description, price, imageUrl, available, categoryId, restaurantId }`; `PUT /dishes/:id` → 200 same; `DELETE /dishes/:id` → 204

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/dishes.test.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDb,
  createTestApp,
  seedCategory,
  seedDish,
  seedRestaurant,
  seedUser,
  signOwnerToken,
} from "../test/helpers.js";

describe("Dish routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(app);
  });

  describe("POST /dishes", () => {
    it("creates a dish for own restaurant", async () => {
      const user = await seedUser(app);
      const token = signOwnerToken(app, user.id, user.email);
      const restaurant = await seedRestaurant(app, user.id);
      const category = await seedCategory(app, restaurant.id);
      const res = await app.inject({
        method: "POST",
        url: "/dishes",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: "Pasta",
          price: "18.50",
          categoryId: category.id,
          restaurantId: restaurant.id,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe("Pasta");
      expect(res.json().available).toBe(true);
    });

    it("returns 403 when dish restaurantId belongs to another owner", async () => {
      const owner = await seedUser(app);
      const attacker = await seedUser(app, { email: "attacker@test.com" });
      const token = signOwnerToken(app, attacker.id, attacker.email);
      const restaurant = await seedRestaurant(app, owner.id);
      const category = await seedCategory(app, restaurant.id);
      const res = await app.inject({
        method: "POST",
        url: "/dishes",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Stolen", price: "5.00", categoryId: category.id, restaurantId: restaurant.id },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("PUT /dishes/:id", () => {
    it("updates availability of own dish", async () => {
      const user = await seedUser(app);
      const token = signOwnerToken(app, user.id, user.email);
      const restaurant = await seedRestaurant(app, user.id);
      const category = await seedCategory(app, restaurant.id);
      const dish = await seedDish(app, category.id, restaurant.id, { available: true });
      const res = await app.inject({
        method: "PUT",
        url: `/dishes/${dish.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { available: false },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().available).toBe(false);
    });

    it("returns 403 for another owner's dish", async () => {
      const owner = await seedUser(app);
      const attacker = await seedUser(app, { email: "attacker@test.com" });
      const token = signOwnerToken(app, attacker.id, attacker.email);
      const restaurant = await seedRestaurant(app, owner.id);
      const category = await seedCategory(app, restaurant.id);
      const dish = await seedDish(app, category.id, restaurant.id);
      const res = await app.inject({
        method: "PUT",
        url: `/dishes/${dish.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { available: false },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("DELETE /dishes/:id", () => {
    it("deletes own dish", async () => {
      const user = await seedUser(app);
      const token = signOwnerToken(app, user.id, user.email);
      const restaurant = await seedRestaurant(app, user.id);
      const category = await seedCategory(app, restaurant.id);
      const dish = await seedDish(app, category.id, restaurant.id);
      const res = await app.inject({
        method: "DELETE",
        url: `/dishes/${dish.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it("returns 403 for another owner's dish", async () => {
      const owner = await seedUser(app);
      const attacker = await seedUser(app, { email: "attacker@test.com" });
      const token = signOwnerToken(app, attacker.id, attacker.email);
      const restaurant = await seedRestaurant(app, owner.id);
      const category = await seedCategory(app, restaurant.id);
      const dish = await seedDish(app, category.id, restaurant.id);
      const res = await app.inject({
        method: "DELETE",
        url: `/dishes/${dish.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd apps/api && npm run test:ci -- src/routes/dishes.test.ts
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Implement the dish routes**

Create `apps/api/src/routes/dishes.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const dishSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.string(),
  imageUrl: z.string().nullable(),
  available: z.boolean(),
  categoryId: z.string(),
  restaurantId: z.string(),
});

export const dishRoutes: FastifyPluginAsync = async (app) => {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/dishes",
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          price: z.string().regex(/^\d+(\.\d{1,2})?$/),
          imageUrl: z.string().url().optional(),
          categoryId: z.string(),
          restaurantId: z.string(),
          available: z.boolean().default(true),
        }),
        response: { 201: dishSchema },
      },
    },
    async (request, reply) => {
      const { restaurantId } = request.body;
      const ownerId = request.user.sub;

      const restaurant = await app.prisma.restaurant.findUnique({ where: { id: restaurantId } });
      if (!restaurant || restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const dish = await app.prisma.dish.create({
        data: {
          ...request.body,
          price: request.body.price,
        },
      });

      return reply.status(201).send({ ...dish, price: dish.price.toString() });
    },
  );

  server.put(
    "/dishes/:id",
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({
          name: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
          imageUrl: z.string().url().nullable().optional(),
          available: z.boolean().optional(),
          categoryId: z.string().optional(),
        }),
        response: { 200: dishSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const ownerId = request.user.sub;

      const dish = await app.prisma.dish.findUnique({
        where: { id },
        include: { restaurant: true },
      });
      if (!dish || dish.restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const updated = await app.prisma.dish.update({ where: { id }, data: request.body });
      return { ...updated, price: updated.price.toString() };
    },
  );

  server.delete(
    "/dishes/:id",
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const ownerId = request.user.sub;

      const dish = await app.prisma.dish.findUnique({
        where: { id },
        include: { restaurant: true },
      });
      if (!dish || dish.restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      await app.prisma.dishIngredient.deleteMany({ where: { dishId: id } });
      await app.prisma.dish.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
};
```

- [ ] **Step 4: Register in app.ts**

```typescript
import { dishRoutes } from "./routes/dishes.js";
// ...
void app.register(dishRoutes);
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/api && npm run test:ci -- src/routes/dishes.test.ts
```

Expected: 6 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/dishes.ts apps/api/src/routes/dishes.test.ts apps/api/src/app.ts
git commit -m "feat(api): dish create, update, delete routes"
```

---

### Task 7: Ingredient routes and translations

**Files:**
- Create: `apps/api/src/routes/ingredients.ts`
- Create: `apps/api/src/routes/ingredients.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `app.authenticate`, `app.prisma`, `request.user.sub`, `seedUser`, `seedRestaurant`, `seedIngredient`, `cleanDb`, `createTestApp`, `signOwnerToken`
- Produces: `POST /ingredients` → 201 `{ id, isAllergen, dietaryTags, restaurantId, translations: [{ locale, name }] }`; `PUT /ingredients/:id` → 200 same; `DELETE /ingredients/:id` → 204

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/ingredients.test.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDb,
  createTestApp,
  seedIngredient,
  seedRestaurant,
  seedUser,
  signOwnerToken,
} from "../test/helpers.js";

describe("Ingredient routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(app);
  });

  describe("POST /ingredients", () => {
    it("creates an ingredient with bilingual translations", async () => {
      const user = await seedUser(app);
      const token = signOwnerToken(app, user.id, user.email);
      const restaurant = await seedRestaurant(app, user.id);
      const res = await app.inject({
        method: "POST",
        url: "/ingredients",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          restaurantId: restaurant.id,
          isAllergen: true,
          dietaryTags: ["VEGAN"],
          translations: [
            { locale: "pt-BR", name: "Glúten" },
            { locale: "en-AU", name: "Gluten" },
          ],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.isAllergen).toBe(true);
      expect(body.dietaryTags).toContain("VEGAN");
      expect(body.translations).toHaveLength(2);
      expect(body.translations.find((t: { locale: string }) => t.locale === "pt-BR")?.name).toBe("Glúten");
    });

    it("returns 403 when creating for another owner's restaurant", async () => {
      const owner = await seedUser(app);
      const attacker = await seedUser(app, { email: "attacker@test.com" });
      const token = signOwnerToken(app, attacker.id, attacker.email);
      const restaurant = await seedRestaurant(app, owner.id);
      const res = await app.inject({
        method: "POST",
        url: "/ingredients",
        headers: { authorization: `Bearer ${token}` },
        payload: {
          restaurantId: restaurant.id,
          isAllergen: false,
          dietaryTags: [],
          translations: [{ locale: "pt-BR", name: "X" }, { locale: "en-AU", name: "X" }],
        },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("PUT /ingredients/:id", () => {
    it("updates ingredient translations", async () => {
      const user = await seedUser(app);
      const token = signOwnerToken(app, user.id, user.email);
      const restaurant = await seedRestaurant(app, user.id);
      const ingredient = await seedIngredient(app, restaurant.id);
      const res = await app.inject({
        method: "PUT",
        url: `/ingredients/${ingredient.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          isAllergen: true,
          translations: [
            { locale: "pt-BR", name: "Leite" },
            { locale: "en-AU", name: "Milk" },
          ],
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().isAllergen).toBe(true);
      expect(res.json().translations.find((t: { locale: string }) => t.locale === "en-AU")?.name).toBe("Milk");
    });

    it("returns 403 for another owner's ingredient", async () => {
      const owner = await seedUser(app);
      const attacker = await seedUser(app, { email: "attacker@test.com" });
      const token = signOwnerToken(app, attacker.id, attacker.email);
      const restaurant = await seedRestaurant(app, owner.id);
      const ingredient = await seedIngredient(app, restaurant.id);
      const res = await app.inject({
        method: "PUT",
        url: `/ingredients/${ingredient.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { isAllergen: true, translations: [] },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("DELETE /ingredients/:id", () => {
    it("deletes own ingredient", async () => {
      const user = await seedUser(app);
      const token = signOwnerToken(app, user.id, user.email);
      const restaurant = await seedRestaurant(app, user.id);
      const ingredient = await seedIngredient(app, restaurant.id);
      const res = await app.inject({
        method: "DELETE",
        url: `/ingredients/${ingredient.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(204);
    });

    it("returns 403 for another owner's ingredient", async () => {
      const owner = await seedUser(app);
      const attacker = await seedUser(app, { email: "attacker@test.com" });
      const token = signOwnerToken(app, attacker.id, attacker.email);
      const restaurant = await seedRestaurant(app, owner.id);
      const ingredient = await seedIngredient(app, restaurant.id);
      const res = await app.inject({
        method: "DELETE",
        url: `/ingredients/${ingredient.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd apps/api && npm run test:ci -- src/routes/ingredients.test.ts
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Implement the ingredient routes**

Create `apps/api/src/routes/ingredients.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const translationSchema = z.object({ locale: z.string(), name: z.string() });

const ingredientSchema = z.object({
  id: z.string(),
  isAllergen: z.boolean(),
  dietaryTags: z.array(z.string()),
  restaurantId: z.string(),
  translations: z.array(translationSchema),
});

const translationsInput = z.array(translationSchema).min(1);

export const ingredientRoutes: FastifyPluginAsync = async (app) => {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/ingredients",
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          restaurantId: z.string(),
          isAllergen: z.boolean().default(false),
          dietaryTags: z.array(z.enum(["VEGAN", "VEGETARIAN", "GLUTEN_FREE", "LACTOSE_FREE"])).default([]),
          translations: translationsInput,
        }),
        response: { 201: ingredientSchema },
      },
    },
    async (request, reply) => {
      const { restaurantId, isAllergen, dietaryTags, translations } = request.body;
      const ownerId = request.user.sub;

      const restaurant = await app.prisma.restaurant.findUnique({ where: { id: restaurantId } });
      if (!restaurant || restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const ingredient = await app.prisma.ingredient.create({
        data: {
          isAllergen,
          dietaryTags,
          restaurantId,
          translations: { create: translations },
        },
        include: { translations: true },
      });

      return reply.status(201).send(ingredient);
    },
  );

  server.put(
    "/ingredients/:id",
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({
          isAllergen: z.boolean().optional(),
          dietaryTags: z.array(z.enum(["VEGAN", "VEGETARIAN", "GLUTEN_FREE", "LACTOSE_FREE"])).optional(),
          translations: translationsInput.optional(),
        }),
        response: { 200: ingredientSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { isAllergen, dietaryTags, translations } = request.body;
      const ownerId = request.user.sub;

      const ingredient = await app.prisma.ingredient.findUnique({
        where: { id },
        include: { restaurant: true },
      });
      if (!ingredient || ingredient.restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      if (translations) {
        await app.prisma.ingredientTranslation.deleteMany({ where: { ingredientId: id } });
      }

      const updated = await app.prisma.ingredient.update({
        where: { id },
        data: {
          ...(isAllergen !== undefined && { isAllergen }),
          ...(dietaryTags && { dietaryTags }),
          ...(translations && { translations: { create: translations } }),
        },
        include: { translations: true },
      });

      return updated;
    },
  );

  server.delete(
    "/ingredients/:id",
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const ownerId = request.user.sub;

      const ingredient = await app.prisma.ingredient.findUnique({
        where: { id },
        include: { restaurant: true },
      });
      if (!ingredient || ingredient.restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      await app.prisma.dishIngredient.deleteMany({ where: { ingredientId: id } });
      await app.prisma.ingredientTranslation.deleteMany({ where: { ingredientId: id } });
      await app.prisma.ingredient.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
};
```

- [ ] **Step 4: Register in app.ts**

```typescript
import { ingredientRoutes } from "./routes/ingredients.js";
// ...
void app.register(ingredientRoutes);
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/api && npm run test:ci -- src/routes/ingredients.test.ts
```

Expected: 6 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/ingredients.ts apps/api/src/routes/ingredients.test.ts apps/api/src/app.ts
git commit -m "feat(api): ingredient routes with i18n translations"
```

---

### Task 8: File upload route

**Files:**
- Create: `apps/api/src/routes/uploads.ts`
- Create: `apps/api/src/routes/uploads.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/plugins/prisma.ts` (no change needed — static serving is a separate plugin)

**Interfaces:**
- Consumes: `app.authenticate`, `request.user.sub`; `@fastify/multipart` for file parsing; `@fastify/static` to serve `uploads/` directory
- Produces: `POST /uploads` → 201 `{ url: "/uploads/<filename>" }`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/uploads.test.ts`:

```typescript
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FastifyInstance } from "fastify";
import FormData from "form-data";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDb,
  createTestApp,
  seedUser,
  signOwnerToken,
} from "../test/helpers.js";

describe("POST /uploads", () => {
  let app: FastifyInstance;
  let tmpFile: string;

  beforeAll(async () => {
    app = await createTestApp();
    tmpFile = join(tmpdir(), "test-upload.png");
    await writeFile(tmpFile, Buffer.from("fake-image-data"));
  });

  afterAll(async () => {
    await cleanDb(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(app);
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({ method: "POST", url: "/uploads" });
    expect(res.statusCode).toBe(401);
  });

  it("uploads a file and returns a public URL", async () => {
    const user = await seedUser(app);
    const token = signOwnerToken(app, user.id, user.email);

    const form = new FormData();
    form.append("file", createReadStream(tmpFile), { filename: "dish.png", contentType: "image/png" });

    const res = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { ...form.getHeaders(), authorization: `Bearer ${token}` },
      payload: form,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.url).toMatch(/^\/uploads\/.+\.png$/);
  });
});
```

Install `form-data` as dev dependency for tests:

```bash
cd apps/api && npm install --save-dev form-data @types/form-data
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd apps/api && npm run test:ci -- src/routes/uploads.test.ts
```

Expected: FAIL — route not found.

- [ ] **Step 3: Implement upload route and register static plugin**

Create `apps/api/src/routes/uploads.ts`:

```typescript
import fastifyMultipart from "@fastify/multipart";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const UPLOADS_DIR = join(process.cwd(), "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  await app.register(fastifyMultipart, { limits: { fileSize: 5 * 1024 * 1024 } });

  app.post(
    "/uploads",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: "No file provided" });
      }

      const ext = data.filename.split(".").pop() ?? "bin";
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const filepath = join(UPLOADS_DIR, filename);

      await pipeline(data.file, createWriteStream(filepath));

      return reply.status(201).send({ url: `/uploads/${filename}` });
    },
  );
};
```

- [ ] **Step 4: Register upload route and static plugin in app.ts**

```typescript
import fastifyStatic from "@fastify/static";
import { join } from "node:path";
import { uploadRoutes } from "./routes/uploads.js";

// Inside buildApp(), after other registrations:
void app.register(fastifyStatic, {
  root: join(process.cwd(), "uploads"),
  prefix: "/uploads/",
});
void app.register(uploadRoutes);
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/api && npm run test:ci -- src/routes/uploads.test.ts
```

Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/uploads.ts apps/api/src/routes/uploads.test.ts apps/api/src/app.ts apps/api/package.json apps/api/package-lock.json
git commit -m "feat(api): file upload route with local storage"
```

---

### Task 9: Admin routes

**Files:**
- Create: `apps/api/src/routes/admin.ts`
- Create: `apps/api/src/routes/admin.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `app.authorizeAdmin`, `app.prisma`, `seedUser`, `seedRestaurant`, `cleanDb`, `createTestApp`, `signOwnerToken`, `signAdminToken`
- Produces: `GET /admin/restaurants` → 200 `[{ id, name, slug, status, currency, ownerId, owner: { email } }]`; `PUT /admin/restaurants/:id/status` → 200 `{ id, status }`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/admin.test.ts`:

```typescript
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDb,
  createTestApp,
  seedRestaurant,
  seedUser,
  signAdminToken,
  signOwnerToken,
} from "../test/helpers.js";

describe("Admin routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(app);
  });

  describe("GET /admin/restaurants", () => {
    it("returns 403 for OWNER token", async () => {
      const user = await seedUser(app);
      const token = signOwnerToken(app, user.id, user.email);
      const res = await app.inject({
        method: "GET",
        url: "/admin/restaurants",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns all restaurants with owner email for ADMIN", async () => {
      const admin = await seedUser(app, { email: "admin@test.com", role: "ADMIN" });
      const owner = await seedUser(app, { email: "owner@test.com" });
      const token = signAdminToken(app, admin.id, admin.email);
      await seedRestaurant(app, owner.id, { status: "PENDING" });
      await seedRestaurant(app, owner.id, { slug: `s-${Date.now()}`, status: "APPROVED" });

      const res = await app.inject({
        method: "GET",
        url: "/admin/restaurants",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(2);
      expect(body[0].owner.email).toBe("owner@test.com");
    });

    it("filters by status query param", async () => {
      const admin = await seedUser(app, { email: "admin2@test.com", role: "ADMIN" });
      const owner = await seedUser(app, { email: "owner2@test.com" });
      const token = signAdminToken(app, admin.id, admin.email);
      await seedRestaurant(app, owner.id, { slug: `p-${Date.now()}`, status: "PENDING" });
      await seedRestaurant(app, owner.id, { slug: `a-${Date.now()}`, status: "APPROVED" });

      const res = await app.inject({
        method: "GET",
        url: "/admin/restaurants?status=PENDING",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
      expect(res.json()[0].status).toBe("PENDING");
    });
  });

  describe("PUT /admin/restaurants/:id/status", () => {
    it("approves a restaurant", async () => {
      const admin = await seedUser(app, { email: "admin3@test.com", role: "ADMIN" });
      const owner = await seedUser(app, { email: "owner3@test.com" });
      const token = signAdminToken(app, admin.id, admin.email);
      const restaurant = await seedRestaurant(app, owner.id, {
        slug: `r-${Date.now()}`,
        status: "PENDING",
      });

      const res = await app.inject({
        method: "PUT",
        url: `/admin/restaurants/${restaurant.id}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "APPROVED" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("APPROVED");
    });

    it("returns 403 for OWNER token", async () => {
      const owner = await seedUser(app, { email: "owner4@test.com" });
      const token = signOwnerToken(app, owner.id, owner.email);
      const restaurant = await seedRestaurant(app, owner.id, {
        slug: `r2-${Date.now()}`,
        status: "PENDING",
      });
      const res = await app.inject({
        method: "PUT",
        url: `/admin/restaurants/${restaurant.id}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "APPROVED" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("returns 404 for unknown restaurant", async () => {
      const admin = await seedUser(app, { email: "admin4@test.com", role: "ADMIN" });
      const token = signAdminToken(app, admin.id, admin.email);
      const res = await app.inject({
        method: "PUT",
        url: "/admin/restaurants/nonexistent-id/status",
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "APPROVED" },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

```bash
cd apps/api && npm run test:ci -- src/routes/admin.test.ts
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Implement the admin routes**

Create `apps/api/src/routes/admin.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const restaurantWithOwnerSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  currency: z.string(),
  ownerId: z.string(),
  createdAt: z.coerce.date(),
  owner: z.object({ email: z.string() }),
});

export const adminRoutes: FastifyPluginAsync = async (app) => {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/admin/restaurants",
    {
      preHandler: [app.authorizeAdmin],
      schema: {
        querystring: z.object({
          status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
        }),
        response: { 200: z.array(restaurantWithOwnerSchema) },
      },
    },
    async (request) => {
      const { status } = request.query;
      return app.prisma.restaurant.findMany({
        where: status ? { status } : undefined,
        include: { owner: { select: { email: true } } },
        orderBy: { createdAt: "asc" },
      });
    },
  );

  server.put(
    "/admin/restaurants/:id/status",
    {
      preHandler: [app.authorizeAdmin],
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({
          status: z.enum(["APPROVED", "REJECTED"]),
        }),
        response: {
          200: z.object({ id: z.string(), status: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { status } = request.body;

      const restaurant = await app.prisma.restaurant.findUnique({ where: { id } });
      if (!restaurant) {
        return reply.status(404).send({ error: "Restaurant not found" });
      }

      const updated = await app.prisma.restaurant.update({
        where: { id },
        data: { status },
        select: { id: true, status: true },
      });

      return updated;
    },
  );
};
```

- [ ] **Step 4: Register in app.ts**

```typescript
import { adminRoutes } from "./routes/admin.js";
// ...
void app.register(adminRoutes);
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/api && npm run test:ci -- src/routes/admin.test.ts
```

Expected: 6 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/api/src/routes/admin.test.ts apps/api/src/app.ts
git commit -m "feat(api): admin routes — list restaurants and approve/reject"
```

---

### Task 10: Admin seed

**Files:**
- Create: `apps/api/prisma/seed.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces: running `npm run db:seed` creates an ADMIN user at `ADMIN_EMAIL` if not already present

- [ ] **Step 1: Create the seed file**

Create `apps/api/prisma/seed.ts`:

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) throw new Error("ADMIN_EMAIL env var is required");

  await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN" },
    create: { email, role: "ADMIN" },
  });

  console.log(`Admin user ensured: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add seed script to package.json**

In `apps/api/package.json`, add to `scripts`:

```json
"db:seed": "tsx prisma/seed.ts"
```

Also add `ADMIN_EMAIL` to `.env.example`:

```
ADMIN_EMAIL=admin@yourplatform.com
```

- [ ] **Step 3: Verify seed runs without errors**

```bash
cd apps/api
ADMIN_EMAIL=admin@test.com npm run db:seed
```

Expected: `Admin user ensured: admin@test.com` — no errors.

- [ ] **Step 4: Run the full test suite**

```bash
cd apps/api && npm run test:ci
```

Expected: all tests pass (≥ 37 tests across 7 test files).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/seed.ts apps/api/package.json apps/api/.env.example
git commit -m "chore(api): admin seed script"
```

---

## Self-Review

**Spec coverage:**
- ✅ Multi-tenant data model (User, Restaurant, Category, Dish, Ingredient, DishIngredient, IngredientTranslation)
- ✅ Public menu route — filters APPROVED restaurants, available dishes, locale-aware ingredient names
- ✅ JWT auth — authenticate + authorizeAdmin preHandlers
- ✅ OWNER (own) rule — all OWNER routes verify restaurantId ownership
- ✅ Restaurant create/update
- ✅ Category CRUD
- ✅ Dish CRUD (with cascade delete of DishIngredient)
- ✅ Ingredient CRUD with bilingual translations (pt-BR / en-AU)
- ✅ File upload with local storage
- ✅ Admin list + status change routes
- ✅ Admin seed
- ✅ TDD throughout — every task writes failing test first
- ✅ Supported currencies: BRL, AUD
- ✅ Supported locales: pt-BR, en-AU

**Not covered in this plan (Web Plan 2):**
- NextAuth setup (Google/Facebook)
- Public menu page UI
- Back-office dashboard
- Admin approval UI
- next-intl locale routing
- QR code generation
