import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import {
  cleanDb,
  seedUser,
  signAdminToken,
  signOwnerToken,
} from "../test/helpers.js";

describe("JWT auth plugin", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    // Register test-only routes before ready()
    void app.register((testApp) => {
      testApp.get(
        "/test-protected",
        { preHandler: [testApp.authenticate] },
        (req) => ({ userId: req.user.sub }),
      );
      testApp.get(
        "/test-admin",
        { preHandler: [testApp.authorizeAdmin] },
        () => ({ ok: true }),
      );
      return Promise.resolve();
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
