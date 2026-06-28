import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDb,
  createTestApp,
  seedRestaurant,
  seedUser,
  signOwnerToken,
} from "../test/helpers.js";

interface RestaurantResponse {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  currency: string;
  status: string;
  ownerId: string;
}

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
      const body = res.json<RestaurantResponse>();
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
      expect(res.json<RestaurantResponse>().name).toBe("Updated Name");
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
