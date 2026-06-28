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

interface IngredientItem {
  id: string;
  name: string;
  isAllergen: boolean;
  dietaryTags: string[];
}

interface DishItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  ingredients: IngredientItem[];
}

interface CategoryItem {
  id: string;
  name: string;
  order: number;
  dishes: DishItem[];
}

interface MenuResponse {
  restaurant: {
    id: string;
    name: string;
    logoUrl: string | null;
    currency: string;
  };
  categories: CategoryItem[];
}

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
    const body = res.json<MenuResponse>();
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
    expect(resPt.json<MenuResponse>().categories[0].dishes[0].ingredients[0].name).toBe("Ingrediente");

    const resEn = await app.inject({
      method: "GET",
      url: "/restaurants/locale-rest/menu?locale=en-AU",
    });
    expect(resEn.json<MenuResponse>().categories[0].dishes[0].ingredients[0].name).toBe("Ingredient");
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
    expect(res.json<MenuResponse>().categories[0].dishes[0].ingredients[0].name).toBe("Ingrediente");
  });
});
