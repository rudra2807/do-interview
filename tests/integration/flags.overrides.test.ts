import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db/prisma";

const app = createApp();
const KEY_PREFIX = "test-override-";

async function cleanup() {
  await prisma.featureFlag.deleteMany({ where: { key: { startsWith: KEY_PREFIX } } });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("PUT /api/flags/:key/users/:userId", () => {
  it("returns 201 when the override does not exist yet", async () => {
    const key = `${KEY_PREFIX}create`;
    await request(app).post("/api/flags").send({ key, name: "Override create" });

    const res = await request(app).put(`/api/flags/${key}/users/u1`).send({ enabled: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ flag: key, user_id: "u1", enabled: true });
    expect(res.body.updated_at).toBeDefined();
  });

  it("returns 200 when updating an existing override", async () => {
    const key = `${KEY_PREFIX}update`;
    await request(app).post("/api/flags").send({ key, name: "Override update" });
    await request(app).put(`/api/flags/${key}/users/u1`).send({ enabled: true });

    const res = await request(app).put(`/api/flags/${key}/users/u1`).send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  it("returns 404 when the flag does not exist", async () => {
    const res = await request(app)
      .put(`/api/flags/${KEY_PREFIX}missing/users/u1`)
      .send({ enabled: true });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/flags/:key/users/:userId", () => {
  it("returns 204 when the override exists", async () => {
    const key = `${KEY_PREFIX}delete`;
    await request(app).post("/api/flags").send({ key, name: "Override delete" });
    await request(app).put(`/api/flags/${key}/users/u1`).send({ enabled: true });

    const res = await request(app).delete(`/api/flags/${key}/users/u1`);
    expect(res.status).toBe(204);
  });

  it("returns 404 when no override exists for that user", async () => {
    const key = `${KEY_PREFIX}no-override`;
    await request(app).post("/api/flags").send({ key, name: "No override" });

    const res = await request(app).delete(`/api/flags/${key}/users/u1`);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the flag does not exist", async () => {
    const res = await request(app).delete(`/api/flags/${KEY_PREFIX}missing/users/u1`);
    expect(res.status).toBe(404);
  });
});
