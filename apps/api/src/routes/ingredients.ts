import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const localeSchema = z.enum(["pt-BR", "en-AU"]);

const translationSchema = z.object({
  locale: localeSchema,
  name: z.string().min(1),
});

const ingredientSchema = z.object({
  id: z.string(),
  isAllergen: z.boolean(),
  dietaryTags: z.array(z.string()),
  restaurantId: z.string(),
  translations: z.array(translationSchema),
});

const translationsInput = z.array(translationSchema).min(1);

const dietaryTagsInput = z.array(
  z.enum(["VEGAN", "VEGETARIAN", "GLUTEN_FREE", "LACTOSE_FREE"]),
);

export function ingredientRoutes(app: FastifyInstance): void {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/ingredients",
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          restaurantId: z.string(),
          isAllergen: z.boolean().default(false),
          dietaryTags: dietaryTagsInput.default([]),
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
          dietaryTags: dietaryTagsInput.optional(),
          translations: z.array(translationSchema).optional(),
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

      return reply.status(200).send(updated);
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
}
