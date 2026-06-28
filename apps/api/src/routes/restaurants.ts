import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const restaurantSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
  currency: z.string(),
  status: z.string(),
  ownerId: z.string(),
});

const createBody = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9-]+$/,
      "slug must be lowercase letters, numbers, or hyphens",
    ),
  logoUrl: z.url().optional(),
  currency: z.enum(["BRL", "AUD"]).default("BRL"),
});

const updateBody = z.object({
  name: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  logoUrl: z.url().nullable().optional(),
  currency: z.enum(["BRL", "AUD"]).optional(),
});

export function restaurantRoutes(app: FastifyInstance): void {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/restaurants",
    {
      preValidation: [app.authenticate],
      schema: {
        body: createBody,
        response: { 201: restaurantSchema },
      },
    },
    async (request, reply) => {
      const { name, slug, logoUrl, currency } = request.body;
      const ownerId = request.user.sub;

      const existing = await app.prisma.restaurant.findUnique({
        where: { slug },
      });
      if (existing) {
        return reply.status(409).send({ error: "Slug already taken" });
      }

      const restaurant = await app.prisma.restaurant.create({
        data: { name, slug, logoUrl, currency, ownerId },
      });

      return reply.status(201).send(restaurant);
    },
  );

  server.put(
    "/restaurants/:id",
    {
      preValidation: [app.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        body: updateBody,
        response: { 200: restaurantSchema },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const ownerId = request.user.sub;

      const restaurant = await app.prisma.restaurant.findUnique({
        where: { id },
      });
      if (!restaurant || restaurant.ownerId !== ownerId) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const updated = await app.prisma.restaurant.update({
        where: { id },
        data: request.body,
      });

      return updated;
    },
  );
}
