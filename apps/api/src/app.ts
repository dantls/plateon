import { join } from "node:path";

import fastifyStatic from "@fastify/static";
import fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

import { corsPlugin } from "./plugins/cors.js";
import { jwtPlugin } from "./plugins/jwt.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { sensiblePlugin } from "./plugins/sensible.js";
import { adminRoutes } from "./routes/admin.js";
import { categoryRoutes } from "./routes/categories.js";
import { dishRoutes } from "./routes/dishes.js";
import { healthRoutes } from "./routes/health.js";
import { ingredientRoutes } from "./routes/ingredients.js";
import { menuRoutes } from "./routes/menu.js";
import { restaurantRoutes } from "./routes/restaurants.js";
import { uploadRoutes } from "./routes/uploads.js";

export function buildApp() {
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  void app.register(corsPlugin);
  void app.register(sensiblePlugin);
  void app.register(prismaPlugin);
  void app.register(jwtPlugin);
  void app.register(healthRoutes);
  void app.register(menuRoutes);
  void app.register(restaurantRoutes);
  void app.register(adminRoutes);
  void app.register(categoryRoutes);
  void app.register(dishRoutes);
  void app.register(ingredientRoutes);
  void app.register(uploadRoutes);
  void app.register(fastifyStatic, {
    root: join(process.cwd(), "uploads"),
    prefix: "/uploads/",
  });

  return app;
}
