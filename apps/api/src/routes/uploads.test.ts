import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FastifyInstance } from "fastify";
import FormData from "form-data";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDb,
  createTestApp,
  seedUser,
  signOwnerToken,
} from "../test/helpers.js";

interface UploadResponse {
  url: string;
}

describe("POST /uploads", () => {
  let app: FastifyInstance;
  let tmpFile: string;

  beforeAll(async () => {
    app = await createTestApp();
    tmpFile = join(tmpdir(), "test-upload.png");
    await writeFile(tmpFile, Buffer.from("fake-image-data"));
  });

  afterAll(async () => {
    await cleanDb(app);
    await app.close();
  });

  beforeEach(async () => {
    await cleanDb(app);
  });

  it("returns 401 without token", async () => {
    const res = await app.inject({ method: "POST", url: "/uploads" });
    expect(res.statusCode).toBe(401);
  });

  it("uploads a file and returns a public URL", async () => {
    const user = await seedUser(app);
    const token = signOwnerToken(app, user.id, user.email);

    const form = new FormData();
    form.append("file", createReadStream(tmpFile), {
      filename: "dish.png",
      contentType: "image/png",
    });

    const res = await app.inject({
      method: "POST",
      url: "/uploads",
      headers: { ...form.getHeaders(), authorization: `Bearer ${token}` },
      payload: form,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<UploadResponse>();
    expect(body.url).toMatch(/^\/uploads\/.+\.png$/);
  });
});
