import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db/prisma";
import * as flagRepository from "../../src/repositories/flagRepository";

const app = createApp();
const KEY_PREFIX = "test-cache-";

async function cleanup() {
  await prisma.featureFlag.deleteMany({ where: { key: { startsWith: KEY_PREFIX } } });
}

beforeAll(cleanup);
afterEach(() => {
  jest.restoreAllMocks();
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("evaluate caching, end to end", () => {
  it("a repeated evaluate for the same flag/user hits the cache and does not call the repository again", async () => {
    const key = `${KEY_PREFIX}hit`;
    await request(app).post("/api/flags").send({ key, name: "Cache hit", defaultEnabled: true });

    const first = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(first.status).toBe(200);

    const spy = jest.spyOn(flagRepository, "findForEvaluation");
    const second = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(second.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
  });

  it("PATCH is reflected on the next evaluate immediately, even though a cache exists", async () => {
    const key = `${KEY_PREFIX}patch-reflect`;
    await request(app).post("/api/flags").send({ key, name: "Patch reflect", defaultEnabled: false });

    const before = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(before.body.enabled).toBe(false); // now cached

    await request(app).patch(`/api/flags/${key}`).send({ defaultEnabled: true });

    const after = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(after.body.enabled).toBe(true);
  });

  it("setting an override is reflected on the next evaluate immediately", async () => {
    const key = `${KEY_PREFIX}override-put-reflect`;
    await request(app).post("/api/flags").send({ key, name: "Override put reflect", defaultEnabled: false });

    const before = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(before.body.reason).toBe("global"); // now cached

    await request(app).put(`/api/flags/${key}/users/u1`).send({ enabled: true });

    const after = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(after.body).toMatchObject({ enabled: true, reason: "user_override" });
  });

  it("removing an override is reflected on the next evaluate immediately", async () => {
    const key = `${KEY_PREFIX}override-delete-reflect`;
    await request(app).post("/api/flags").send({ key, name: "Override delete reflect", defaultEnabled: false });
    await request(app).put(`/api/flags/${key}/users/u1`).send({ enabled: true });

    const before = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(before.body.reason).toBe("user_override"); // now cached

    await request(app).delete(`/api/flags/${key}/users/u1`);

    const after = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(after.body).toMatchObject({ enabled: false, reason: "global" });
  });

  it("deleting a flag is reflected on the next evaluate immediately (404, not a stale cached hit)", async () => {
    const key = `${KEY_PREFIX}flag-delete-reflect`;
    await request(app).post("/api/flags").send({ key, name: "Flag delete reflect" });

    const before = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(before.status).toBe(200); // now cached

    await request(app).delete(`/api/flags/${key}`);

    const after = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(after.status).toBe(404);
  });

  it("a 404 is not cached: creating the flag right after a 404 makes the next evaluate succeed immediately", async () => {
    const key = `${KEY_PREFIX}404-not-cached`;

    const miss = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(miss.status).toBe(404);

    await request(app).post("/api/flags").send({ key, name: "404 then created", defaultEnabled: true });

    const hit = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "u1" });
    expect(hit.status).toBe(200);
    expect(hit.body.enabled).toBe(true);
  });

  it("invalidating one flag does not evict a different flag's cached evaluation", async () => {
    const keyA = `${KEY_PREFIX}scope-a`;
    const keyB = `${KEY_PREFIX}scope-b`;
    await request(app).post("/api/flags").send({ key: keyA, name: "Scope A", defaultEnabled: true });
    await request(app).post("/api/flags").send({ key: keyB, name: "Scope B", defaultEnabled: true });

    await request(app).get(`/api/flags/${keyA}/evaluate`).query({ user_id: "u1" });
    await request(app).get(`/api/flags/${keyB}/evaluate`).query({ user_id: "u1" }); // both now cached

    await request(app).patch(`/api/flags/${keyA}`).send({ defaultEnabled: false });

    const spy = jest.spyOn(flagRepository, "findForEvaluation");
    const resB = await request(app).get(`/api/flags/${keyB}/evaluate`).query({ user_id: "u1" });
    expect(resB.body.enabled).toBe(true); // flag B's cache entry survived flag A's invalidation
    expect(spy).not.toHaveBeenCalled(); // proves it was actually served from cache, not recomputed
  });
});
