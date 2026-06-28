import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const menuResponseSchema = z.object({
  restaurant: z.object({
    id: z.string(),
    name: z.string(),
    logoUrl: z.string().nullable(),
    currency: z.string(),
  }),
  categories: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      order: z.number(),
      dishes: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().nullable(),
          price: z.string(),
          imageUrl: z.string().nullable(),
          ingredients: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              isAllergen: z.boolean(),
              dietaryTags: z.array(z.string()),
            }),
          ),
        }),
      ),
    }),
  ),
});

export function menuRoutes(app: FastifyInstance): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/restaurants/:slug/menu",
    {
      schema: {
        params: z.object({ slug: z.string() }),
        querystring: z.object({
          locale: z.enum(["pt-BR", "en-AU"]).default("pt-BR"),
        }),
        response: { 200: menuResponseSchema },
      },
    },
    async (request, reply) => {
      const { slug } = request.params;
      const { locale } = request.query;

      const restaurant = await app.prisma.restaurant.findFirst({
        where: { slug, status: "APPROVED" },
        include: {
          categories: {
            orderBy: { order: "asc" },
            include: {
              dishes: {
                where: { available: true },
                include: {
                  ingredients: {
                    include: {
                      ingredient: {
                        include: {
                          translations: { where: { locale } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!restaurant) {
        return reply.status(404).send({ error: "Restaurant not found" });
      }

      return {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          logoUrl: restaurant.logoUrl,
          currency: restaurant.currency,
        },
        categories: restaurant.categories.map((cat) => ({
          id: cat.id,
          name: cat.name,
          order: cat.order,
          dishes: cat.dishes.map((dish) => ({
            id: dish.id,
            name: dish.name,
            description: dish.description,
            price: dish.price.toString(),
            imageUrl: dish.imageUrl,
            ingredients: dish.ingredients.map(({ ingredient }) => ({
              id: ingredient.id,
              name: ingredient.translations[0]?.name ?? "",
              isAllergen: ingredient.isAllergen,
              dietaryTags: ingredient.dietaryTags,
            })),
          })),
        })),
      };
    },
  );
}
