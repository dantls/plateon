import fastifySensible from "@fastify/sensible";
import { type FastifyInstance } from "fastify";

export async function sensiblePlugin(app: FastifyInstance) {
  await app.register(fastifySensible);
}
