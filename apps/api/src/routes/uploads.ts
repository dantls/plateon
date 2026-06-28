import { randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

import fastifyMultipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";

const UPLOADS_DIR = join(process.cwd(), "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function uploadRoutes(app: FastifyInstance): void {
  void app.register(fastifyMultipart, {
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  app.post(
    "/uploads",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: "No file provided" });
      }

      const rawExt = (data.filename.split(".").pop() ?? "").toLowerCase();
      const expectedMime = ALLOWED_MIME_BY_EXT[rawExt];
      if (!expectedMime || data.mimetype !== expectedMime) {
        return reply.status(400).send({ error: "Invalid file type" });
      }

      const filename = `${randomUUID()}.${rawExt}`;
      const filepath = join(UPLOADS_DIR, filename);

      await pipeline(data.file, createWriteStream(filepath));

      return reply.status(201).send({ url: `/uploads/${filename}` });
    },
  );
}
