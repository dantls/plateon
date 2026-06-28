# Restaurant Menu Platform — Design Spec

**Date:** 2026-06-28
**Status:** Approved

## Overview

A platform where restaurant owners register their menu and customers scan a QR code to view it on their phones. Phase 1 is read-only menu viewing. Ordering will be added in a future phase.

---

## Architecture

Two apps in the monorepo:

- **`apps/web`** — Next.js 16 (App Router, RSC): public menu pages + back-office dashboard + admin panel
- **`apps/api`** — Fastify 5: REST API, business logic, file uploads, database access via Prisma

Authentication lives in Next.js via **NextAuth/Auth.js** (Google and Facebook providers). NextAuth issues a JWT signed with `NEXTAUTH_SECRET`. Every request from the web app to the Fastify API includes `Authorization: Bearer <token>`. Fastify has a `jwt` plugin that verifies the token using the shared secret and extracts `userId` and `role`.

```
apps/web (Next.js)                apps/api (Fastify)
─────────────────────────────     ──────────────────────────────
/menu/[slug]          ──────────▶ GET  /restaurants/:slug/menu
/dashboard            ──────────▶ POST /restaurants
/dashboard/categories ──────────▶ POST /categories
/dashboard/dishes     ──────────▶ POST /dishes
/admin                ──────────▶ PUT  /restaurants/:id/status
                           │
                      Prisma + PostgreSQL
```

---

## Data Model

```prisma
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
  currency    String           @default("BRL") // "BRL" | "AUD"
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
  locale       String     // "pt-BR", "en-AU"
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

enum DietaryTag {
  VEGAN
  VEGETARIAN
  GLUTEN_FREE
  LACTOSE_FREE
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
```

**Key decisions:**
- **Multi-tenancy:** each `Dish` and `Ingredient` carries a direct `restaurantId`. Enables tenant isolation checks without extra joins, and makes it trivial to move a dish between categories of the same restaurant.
- **Markets:** Brazil (`pt-BR`, currency `BRL`) and Australia (`en-AU`, currency `AUD`). `Restaurant.currency` determines price formatting on the public menu. `next-intl` handles locale routing and message files.
- **Ingredients:** name stored via `IngredientTranslation` table (`locale: "pt-BR" | "en-AU"`, `name: String`) — normalized i18n. Allergen flag (`isAllergen`) and dietary tags (`VEGAN`, `VEGETARIAN`, `GLUTEN_FREE`, `LACTOSE_FREE`) sit on the parent `Ingredient`. Scoped per restaurant — owners manage their own ingredient list and reuse across dishes via `DishIngredient` join table.
- Restaurant identified by `slug` in QR URL (`/menu/meu-restaurante`) — human-readable and stable
- Only `available: true` dishes are returned to the public menu endpoint
- Only `APPROVED` restaurants are served publicly
- `Category.order` allows manual reordering without drag-and-drop complexity

---

## Public Menu (QR Code Flow)

**Route:** `/menu/[slug]` — fully public, no auth required

1. QR code points to `https://plateon.app/menu/<slug>`
2. Next.js SSR fetches `GET /restaurants/:slug/menu` from Fastify
3. Fastify returns restaurant + categories + dishes where `available = true`
4. If restaurant not found or status is not `APPROVED` → 404 page

**UI layout (mobile-first, shadcn):**
- Header: restaurant logo + name
- Sticky tabs at top: one tab per category (`shadcn/Tabs`)
- Cards per dish: photo, name, short description, price, ingredient list with allergen and dietary icons
- No login required

**QR code generation:** `qrcode` npm library. Generated in the back-office and displayed for the owner to download/print.

---

## Authentication

**Provider:** NextAuth/Auth.js with Google and Facebook OAuth providers.

**First login:**
1. User visits `/auth/signin`, chooses Google or Facebook
2. NextAuth uses `@auth/prisma-adapter` with its own Prisma connection to create/find the `User` record. `role` defaults to `OWNER` via a `signIn` callback that sets the field on first creation.
3. Redirects to `/dashboard`

**Note on DB connections:** Next.js (`apps/web`) has its own Prisma client used exclusively by NextAuth for session/user management. Fastify (`apps/api`) has its own Prisma client for all business logic. Both point to the same `DATABASE_URL`.

**Subsequent logins:** NextAuth recognizes user by email, issues JWT, redirects to `/dashboard`.

**JWT structure:** `{ userId, email, role }` signed with `NEXTAUTH_SECRET`.

**Fastify integration:** Plugin `src/plugins/jwt.ts` verifies the JWT on every protected route. Exposes `app.authenticate` preHandler hook.

**Required environment variables:**
```
# apps/web
NEXTAUTH_SECRET
NEXTAUTH_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
FACEBOOK_CLIENT_ID
FACEBOOK_CLIENT_SECRET
NEXT_PUBLIC_API_URL

# apps/api
NEXTAUTH_SECRET   # shared with web for JWT verification
DATABASE_URL
```

---

## Restaurant Back-Office

**Access:** authenticated, `role: OWNER` only.

**Onboarding flow:** If the logged-in user has no restaurant, redirect to `/dashboard/restaurant/new`.

**Pages:**

| Route | Purpose |
|---|---|
| `/dashboard` | Overview: restaurant status, menu link, QR code download |
| `/dashboard/restaurant` | Edit restaurant name, slug, logo |
| `/dashboard/categories` | Create, rename, reorder categories (manual order field) |
| `/dashboard/dishes` | List dishes with inline availability toggle |
| `/dashboard/dishes/new` | Create dish |
| `/dashboard/dishes/[id]/edit` | Edit dish |
| `/dashboard/ingredients` | Manage ingredient list (create, edit, delete) |

**Dish form fields:** name, description, price, photo (upload), category (select), available (switch), ingredients (multi-select from restaurant's ingredient list).

**Ingredient form fields:** name in PT (`pt-BR`), name in EN (`en-AU`), is allergen (toggle), dietary tags (multi-select: vegan, vegetarian, gluten-free, lactose-free). UI uses `next-intl` to detect the active locale and serve the correct translation on the public menu.

**Price formatting:** `Intl.NumberFormat` with the restaurant's `currency` field — `R$` for BRL, `A$` for AUD.

**Photo upload:** `multipart/form-data` to Fastify using `@fastify/multipart`. Files stored in `uploads/` directory locally in phase 1 — designed to migrate to S3 without API contract changes. Returns a public URL.

**shadcn components:** `Form`, `Input`, `Textarea`, `Select`, `Switch`, `Button`, `Card`, `Badge` (restaurant status), `Dialog` (delete confirmation).

**Dashboard banner:** While restaurant is `PENDING`, a banner informs the owner that approval is in progress and all dish management is disabled.

---

## Admin Approval Flow

**Admin user:** Created via `prisma/seed.ts` — no UI for promoting users to admin in phase 1.

**Pages:**

| Route | Purpose |
|---|---|
| `/admin` | List of `PENDING` restaurants with Approve / Reject buttons |
| `/admin/restaurants` | Full list filterable by status |

**Approval flow:**
1. Owner creates restaurant → status `PENDING`
2. Admin visits `/admin` → sees pending list (name, owner email, created date)
3. Clicks Approve → calls `PUT /restaurants/:id/status` with `{ status: "APPROVED" }`
4. Owner sees updated status on next dashboard load

**Protection:** Next.js `middleware.ts` blocks `/admin/*` for any session where `role !== ADMIN`. Fastify also checks `role === ADMIN` on the status endpoint (defense in depth).

**Notifications:** Not in scope for phase 1. Owner checks dashboard manually. Easily extensible with Resend/SendGrid later.

---

## Fastify API Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/restaurants/:slug/menu` | None | Public menu for QR code |
| POST | `/restaurants` | OWNER | Create restaurant |
| PUT | `/restaurants/:id` | OWNER (own) | Update restaurant |
| POST | `/categories` | OWNER (own) | Create category |
| PUT | `/categories/:id` | OWNER (own) | Update / reorder category |
| DELETE | `/categories/:id` | OWNER (own) | Delete category |
| POST | `/dishes` | OWNER (own) | Create dish |
| PUT | `/dishes/:id` | OWNER (own) | Update dish |
| DELETE | `/dishes/:id` | OWNER (own) | Delete dish |

**"OWNER (own)" rule:** Fastify verifies that the restaurant referenced in the request belongs to the authenticated user. Requests targeting another owner's restaurant return `403 Forbidden`.
| POST | `/ingredients` | OWNER (own) | Create ingredient |
| PUT | `/ingredients/:id` | OWNER (own) | Update ingredient |
| DELETE | `/ingredients/:id` | OWNER (own) | Delete ingredient |
| POST | `/uploads` | OWNER | Upload dish photo |
| PUT | `/restaurants/:id/status` | ADMIN | Approve / reject restaurant |
| GET | `/restaurants` | ADMIN | List all restaurants |

---

## Testing

**Approach: Test-Driven Development.** Tests are written before implementation code. Each feature is implemented only after its tests exist and fail for the right reason (red → green → refactor).

### API (Fastify) — Vitest + `app.inject()`

Fastify's `inject()` runs routes in-process against a real test database (no mocks). Each test suite calls `buildApp()`, runs migrations against a dedicated test DB, and cleans up after.

| Area | What to test |
|---|---|
| `GET /restaurants/:slug/menu` | Returns only `APPROVED` restaurants; excludes `available: false` dishes; correct ingredient locale |
| Auth middleware | Protected routes return `401` with no token; `403` with wrong role |
| OWNER (own) rule | Owner cannot read/write another restaurant's categories, dishes, or ingredients — returns `403` |
| Admin approval | `PUT /restaurants/:id/status` succeeds for ADMIN, fails for OWNER |
| Ingredient translations | Correct `locale` translation returned; missing locale falls back gracefully |
| Upload | `POST /uploads` stores file and returns a valid URL |

### Web (Next.js) — Vitest + RTL + Playwright

| Layer | Tool | What to test |
|---|---|---|
| Components | Vitest + RTL | Dish card renders name, price formatted by currency; allergen/dietary icons shown; unavailable dishes hidden |
| Back-office forms | Vitest + RTL | Ingredient form submits correct `pt-BR`/`en-AU` translations; dish form links to correct category |
| Auth redirect | Vitest + RTL | Dashboard redirects to `/auth/signin` when unauthenticated |
| Public menu (E2E) | Playwright | QR URL loads menu; tabs switch categories; 404 for unknown slug |
| Back-office flow (E2E) | Playwright | Owner logs in → creates restaurant → adds category → adds dish with ingredients → QR code visible |
| Admin flow (E2E) | Playwright | Admin logs in → approves restaurant → restaurant becomes publicly accessible |

### Test database

Both apps share `DATABASE_URL_TEST` in `.env.test`. CI runs `prisma migrate deploy` against the test DB before the suite. Each test file wraps mutations in a transaction and rolls back — no persistent state between tests.

---

## Out of Scope (Phase 1)

- Customer ordering
- Email notifications on approval
- Per-table QR codes
- Multiple restaurants per owner
- Drag-and-drop category reordering
- S3 / cloud storage for images
- Mobile app
