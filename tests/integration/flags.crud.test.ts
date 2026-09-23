import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db/prisma";

const app = createApp();
const KEY_PREFIX = "test-crud-";

async function cleanup() {
  await prisma.featureFlag.deleteMany({ where: { key: { startsWith: KEY_PREFIX } } });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("POST /api/flags", () => {
  it("returns 409 when the key already exists", async () => {
    const key = `${KEY_PREFIX}dup`;
    const first = await request(app)
      .post("/api/flags")
      .send({ key, name: "First" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/flags")
      .send({ key, name: "Second" });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONFLICT");
  });
});

describe("PATCH /api/flags/:key", () => {
  it("updates description and defaultEnabled and returns 200", async () => {
    const key = `${KEY_PREFIX}patch`;
    await request(app).post("/api/flags").send({ key, name: "Patch me" });

    const res = await request(app)
      .patch(`/api/flags/${key}`)
      .send({ description: "updated", defaultEnabled: true });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe("updated");
    expect(res.body.defaultEnabled).toBe(true);
  });

  it("returns 404 for an unknown key", async () => {
    const res = await request(app)
      .patch(`/api/flags/${KEY_PREFIX}missing`)
      .send({ defaultEnabled: true });
    expect(res.status).toBe(404);
  });

  it("returns 400 when the body has no updatable fields", async () => {
    const key = `${KEY_PREFIX}empty-patch`;
    await request(app).post("/api/flags").send({ key, name: "Empty patch" });

    const res = await request(app).patch(`/api/flags/${key}`).send({});
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/flags/:key", () => {
  it("deletes the flag, cascading to its overrides, and returns 204", async () => {
    const key = `${KEY_PREFIX}delete`;
    const created = await request(app).post("/api/flags").send({ key, name: "Delete me" });
    await request(app).put(`/api/flags/${key}/users/u1`).send({ enabled: true });

    const res = await request(app).delete(`/api/flags/${key}`);
    expect(res.status).toBe(204);

    const overrides = await prisma.featureFlagOverride.findMany({
      where: { flagId: created.body.id },
    });
    expect(overrides).toHaveLength(0);
  });

  it("returns 404 for an unknown key", async () => {
    const res = await request(app).delete(`/api/flags/${KEY_PREFIX}missing`);
    expect(res.status).toBe(404);
  });
});
