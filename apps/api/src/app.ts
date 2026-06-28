import fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

import { corsPlugin } from "./plugins/cors.js";
import { jwtPlugin } from "./plugins/jwt.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { sensiblePlugin } from "./plugins/sensible.js";
import { healthRoutes } from "./routes/health.js";

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

  return app;
}
