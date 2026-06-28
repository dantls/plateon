import { PrismaPg } from "@prisma/adapter-pg";
import { type FastifyInstance } from "fastify";
import fp from "fastify-plugin";

import { PrismaClient } from "../generated/prisma/client.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export const prismaPlugin = fp(async (app: FastifyInstance) => {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is required");
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  await prisma.$connect();

  app.decorate("prisma", prisma);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
});
