import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { Prisma } from "../generated/prisma/client.js";

const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number(),
  restaurantId: z.string(),
});

export function categoryRoutes(app: FastifyInstance): void {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/categories",
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: z.object({ restaurantId: z.string().min(1) }),
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              order: z.number(),
              restaurantId: z.string(),
            }),
          ),
        },
      },
    },
    async (request, reply) => {
      const { restaurantId } = request.query;
      const restaurant = await app.prisma.restaurant.findUnique({
        where: { id: restaurantId },
      });
      if (!restaurant || restaurant.ownerId !== request.user.sub) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      const categories = await app.prisma.category.findMany({
        where: { restaurantId },
        orderBy: { order: "asc" },
      });
      return reply.status(200).send(categories);
    },
  );

  server.post(
    "/categories",
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          name: z.string().min(1),
          restaurantId: z.string(),
          order: z.number().int().min(0).default(0),
        }),
        response: { 201: categorySchema },
      },
    },
    async (request, reply) => {
      const { name, restaurantId, order } = request.body;
      const ownerId = request.user.sub;

      const restaurant = await app.prisma.restaurant.findUnique({ where: { id: restaurantId } });
      if (!restaurant || restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const category = await app.prisma.category.create({
        data: { name, order, restaurantId },
      });

      return reply.status(201).send(category);
    },
  );

  server.put(
    "/categories/:id",
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({
          name: z.string().min(1).optional(),
          order: z.number().int().min(0).optional(),
        }),
        response: { 200: categorySchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const ownerId = request.user.sub;

      const category = await app.prisma.category.findUnique({
        where: { id },
        include: { restaurant: true },
      });
      if (!category || category.restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      return app.prisma.category.update({ where: { id }, data: request.body });
    },
  );

  server.delete(
    "/categories/:id",
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

      const category = await app.prisma.category.findUnique({
        where: { id },
        include: { restaurant: true },
      });
      if (!category || category.restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      try {
        await app.prisma.category.delete({ where: { id } });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2003"
        ) {
          return reply.status(409).send({ error: "Category has dishes; remove them first" });
        }
        throw error;
      }
      return reply.status(204).send();
    },
  );
}
