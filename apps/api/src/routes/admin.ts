import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const restaurantWithOwnerSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  currency: z.string(),
  ownerId: z.string(),
  createdAt: z.coerce.date(),
  owner: z.object({ email: z.string() }),
});

export function adminRoutes(app: FastifyInstance): void {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/admin/restaurants",
    {
      preHandler: [app.authorizeAdmin],
      schema: {
        querystring: z.object({
          status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
        }),
        response: { 200: z.array(restaurantWithOwnerSchema) },
      },
    },
    async (request) => {
      const { status } = request.query;
      return app.prisma.restaurant.findMany({
        where: status ? { status } : undefined,
        include: { owner: { select: { email: true } } },
        orderBy: { createdAt: "asc" },
      });
    },
  );

  server.put(
    "/admin/restaurants/:id/status",
    {
      preHandler: [app.authorizeAdmin],
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({
          status: z.enum(["APPROVED", "REJECTED"]),
        }),
        response: {
          200: z.object({ id: z.string(), status: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { status } = request.body;

      const restaurant = await app.prisma.restaurant.findUnique({ where: { id } });
      if (!restaurant) {
        return reply.status(404).send({ error: "Restaurant not found" });
      }

      const updated = await app.prisma.restaurant.update({
        where: { id },
        data: { status },
        select: { id: true, status: true },
      });

      return updated;
    },
  );
}
