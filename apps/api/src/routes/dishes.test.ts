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

interface DishResponse {
  id: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  available: boolean;
  categoryId: string;
  restaurantId: string;
}

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
      expect(res.json<DishResponse>().name).toBe("Pasta");
      expect(res.json<DishResponse>().available).toBe(true);
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
      expect(res.json<DishResponse>().available).toBe(false);
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
