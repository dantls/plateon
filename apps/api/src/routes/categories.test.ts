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

interface CategoryResponse {
  id: string;
  name: string;
  order: number;
  restaurantId: string;
}

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
      expect(res.json<CategoryResponse>().name).toBe("Drinks");
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
      expect(res.json<CategoryResponse>().name).toBe("Updated");
      expect(res.json<CategoryResponse>().order).toBe(5);
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

  describe("GET /categories", () => {
    it("GET /categories?restaurantId= returns categories for owner", async () => {
      const user = await seedUser(app);
      const restaurant = await seedRestaurant(app, user.id);
      await seedCategory(app, restaurant.id, { name: "Drinks", order: 0 });
      await seedCategory(app, restaurant.id, { name: "Mains", order: 1 });
      const token = signOwnerToken(app, user.id, user.email);
      const res = await app.inject({
        method: "GET",
        url: `/categories?restaurantId=${restaurant.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<CategoryResponse[]>();
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe("Drinks");
    });

    it("GET /categories?restaurantId= returns 403 for another owner", async () => {
      const owner = await seedUser(app);
      const other = await seedUser(app, { email: "other@test.com" });
      const restaurant = await seedRestaurant(app, owner.id);
      const token = signOwnerToken(app, other.id, other.email);
      const res = await app.inject({
        method: "GET",
        url: `/categories?restaurantId=${restaurant.id}`,
        headers: { authorization: `Bearer ${token}` },
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

    it("returns 409 when deleting a category that has dishes", async () => {
      const user = await seedUser(app);
      const token = signOwnerToken(app, user.id, user.email);
      const restaurant = await seedRestaurant(app, user.id);
      const category = await seedCategory(app, restaurant.id);
      await seedDish(app, category.id, restaurant.id);
      const res = await app.inject({
        method: "DELETE",
        url: `/categories/${category.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(409);
    });
  });
});
