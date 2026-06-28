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

interface IngredientTranslationResponse {
  locale: string;
  name: string;
}

interface IngredientResponse {
  id: string;
  isAllergen: boolean;
  dietaryTags: string[];
  restaurantId: string;
  translations: IngredientTranslationResponse[];
}

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
      const body = res.json<IngredientResponse>();
      expect(body.isAllergen).toBe(true);
      expect(body.dietaryTags).toContain("VEGAN");
      expect(body.translations).toHaveLength(2);
      expect(body.translations.find((t) => t.locale === "pt-BR")?.name).toBe("Glúten");
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
          translations: [
            { locale: "pt-BR", name: "X" },
            { locale: "en-AU", name: "X" },
          ],
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
      expect(res.json<IngredientResponse>().isAllergen).toBe(true);
      expect(
        res.json<IngredientResponse>().translations.find((t) => t.locale === "en-AU")?.name,
      ).toBe("Milk");
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
