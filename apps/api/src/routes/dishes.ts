import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const dishSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.string(),
  imageUrl: z.string().nullable(),
  available: z.boolean(),
  categoryId: z.string(),
  restaurantId: z.string(),
});

export function dishRoutes(app: FastifyInstance): void {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/dishes",
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          price: z.string().regex(/^\d+(\.\d{1,2})?$/),
          imageUrl: z.url().optional(),
          categoryId: z.string(),
          restaurantId: z.string(),
          available: z.boolean().default(true),
        }),
        response: { 201: dishSchema },
      },
    },
    async (request, reply) => {
      const { restaurantId } = request.body;
      const ownerId = request.user.sub;

      const restaurant = await app.prisma.restaurant.findUnique({ where: { id: restaurantId } });
      if (!restaurant || restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const dish = await app.prisma.dish.create({
        data: {
          name: request.body.name,
          description: request.body.description,
          price: request.body.price,
          imageUrl: request.body.imageUrl,
          available: request.body.available,
          categoryId: request.body.categoryId,
          restaurantId: request.body.restaurantId,
        },
      });

      return reply.status(201).send({ ...dish, price: dish.price.toString() });
    },
  );

  server.put(
    "/dishes/:id",
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({
          name: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
          imageUrl: z.url().nullable().optional(),
          available: z.boolean().optional(),
          categoryId: z.string().optional(),
        }),
        response: { 200: dishSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const ownerId = request.user.sub;

      const dish = await app.prisma.dish.findUnique({
        where: { id },
        include: { restaurant: true },
      });
      if (!dish || dish.restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const updated = await app.prisma.dish.update({ where: { id }, data: request.body });
      return reply.status(200).send({ ...updated, price: updated.price.toString() });
    },
  );

  server.delete(
    "/dishes/:id",
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

      const dish = await app.prisma.dish.findUnique({
        where: { id },
        include: { restaurant: true },
      });
      if (!dish || dish.restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      await app.prisma.dishIngredient.deleteMany({ where: { dishId: id } });
      await app.prisma.dish.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
