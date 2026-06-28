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

interface AdminRestaurantResponse {
  id: string;
  name: string;
  slug: string;
  status: string;
  currency: string;
  ownerId: string;
  owner: { email: string };
}

interface StatusUpdateResponse {
  id: string;
  status: string;
}

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
      await seedRestaurant(app, owner.id, { slug: `s-${String(Date.now())}`, status: "APPROVED" });

      const res = await app.inject({
        method: "GET",
        url: "/admin/restaurants",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<AdminRestaurantResponse[]>();
      expect(body).toHaveLength(2);
      expect(body[0].owner.email).toBe("owner@test.com");
    });

    it("filters by status query param", async () => {
      const admin = await seedUser(app, { email: "admin2@test.com", role: "ADMIN" });
      const owner = await seedUser(app, { email: "owner2@test.com" });
      const token = signAdminToken(app, admin.id, admin.email);
      await seedRestaurant(app, owner.id, { slug: `p-${String(Date.now())}`, status: "PENDING" });
      await seedRestaurant(app, owner.id, { slug: `a-${String(Date.now())}`, status: "APPROVED" });

      const res = await app.inject({
        method: "GET",
        url: "/admin/restaurants?status=PENDING",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json<AdminRestaurantResponse[]>();
      expect(body).toHaveLength(1);
      expect(body[0].status).toBe("PENDING");
    });
  });

  describe("PUT /admin/restaurants/:id/status", () => {
    it("approves a restaurant", async () => {
      const admin = await seedUser(app, { email: "admin3@test.com", role: "ADMIN" });
      const owner = await seedUser(app, { email: "owner3@test.com" });
      const token = signAdminToken(app, admin.id, admin.email);
      const restaurant = await seedRestaurant(app, owner.id, {
        slug: `r-${String(Date.now())}`,
        status: "PENDING",
      });

      const res = await app.inject({
        method: "PUT",
        url: `/admin/restaurants/${restaurant.id}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: "APPROVED" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<StatusUpdateResponse>().status).toBe("APPROVED");
    });

    it("returns 403 for OWNER token", async () => {
      const owner = await seedUser(app, { email: "owner4@test.com" });
      const token = signOwnerToken(app, owner.id, owner.email);
      const restaurant = await seedRestaurant(app, owner.id, {
        slug: `r2-${String(Date.now())}`,
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
