import "@fastify/jwt";

import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";

import { buildApp } from "../app.js";
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
      email: overrides.email ?? `user-${randomUUID()}@test.com`,
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
      slug: overrides.slug ?? `test-${randomUUID()}`,
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
