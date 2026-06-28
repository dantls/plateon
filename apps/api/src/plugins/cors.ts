import fastifyCors from "@fastify/cors";
import { type FastifyInstance } from "fastify";

export async function corsPlugin(app: FastifyInstance) {
  await app.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN ?? "*",
  });
}
