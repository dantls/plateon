import { type FastifyInstance } from "fastify";
import { z } from "zod";

const healthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string(),
});

export function healthRoutes(app: FastifyInstance) {
  app.get("/health", {
    schema: {
      response: { 200: healthResponseSchema },
    },
    handler: () => ({
      status: "ok" as const,
      timestamp: new Date().toISOString(),
    }),
  });
}
