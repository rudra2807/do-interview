import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db/prisma";

const app = createApp();
const KEY_PREFIX = "test-evaluate-";

async function cleanup() {
  await prisma.featureFlag.deleteMany({ where: { key: { startsWith: KEY_PREFIX } } });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("GET /api/flags/:key/evaluate", () => {
  it("returns the global default when there is no override", async () => {
    const key = `${KEY_PREFIX}global`;
    await request(app).post("/api/flags").send({ key, name: "Global", defaultEnabled: true });

    const res = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ flag: key, user_id: "u1", enabled: true, reason: "global" });
  });

  it("returns the user override when one exists, even if it contradicts the default", async () => {
    const key = `${KEY_PREFIX}override-wins`;
    await request(app).post("/api/flags").send({ key, name: "Override wins", defaultEnabled: true });
    await request(app).put(`/api/flags/${key}/users/u1`).send({ enabled: false });

    const res = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: false, reason: "user_override" });
  });

  it("falls back to the global default after the override is deleted", async () => {
    const key = `${KEY_PREFIX}fallback`;
    await request(app).post("/api/flags").send({ key, name: "Fallback", defaultEnabled: false });
    await request(app).put(`/api/flags/${key}/users/u1`).send({ enabled: true });

    await request(app).delete(`/api/flags/${key}/users/u1`);

    const res = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: false, reason: "global" });
  });

  it("reflects a PATCH to the flag immediately (invalidation keeps the cache from going stale)", async () => {
    const key = `${KEY_PREFIX}patch-reflect`;
    await request(app).post("/api/flags").send({ key, name: "Patch reflect", defaultEnabled: false });

    const before = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(before.body.enabled).toBe(false);

    await request(app).patch(`/api/flags/${key}`).send({ defaultEnabled: true });

    const after = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(after.body.enabled).toBe(true);
  });

  it("returns 404 after the flag is deleted", async () => {
    const key = `${KEY_PREFIX}deleted`;
    await request(app).post("/api/flags").send({ key, name: "Deleted" });
    await request(app).delete(`/api/flags/${key}`);

    const res = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(res.status).toBe(404);
  });

  it("returns 404 for a flag that never existed", async () => {
    const res = await request(app)
      .get(`/api/flags/${KEY_PREFIX}never-existed/evaluate`)
      .query({ user_id: "u1" });
    expect(res.status).toBe(404);
  });

  it("returns 400 when user_id is missing", async () => {
    const key = `${KEY_PREFIX}missing-user-id`;
    await request(app).post("/api/flags").send({ key, name: "Missing user id" });

    const res = await request(app).get(`/api/flags/${key}/evaluate`);
    expect(res.status).toBe(400);
  });
});
