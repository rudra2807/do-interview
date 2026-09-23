import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db/prisma";
import * as flagRepository from "../../src/repositories/flagRepository";

const app = createApp();
const KEY_PREFIX = "test-concurrency-";

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

describe("concurrent writes", () => {
  it("two simultaneous creates with the same key: exactly one 201 and one 409, never two 201s", async () => {
    const key = `${KEY_PREFIX}dup-race`;

    const [a, b] = await Promise.all([
      request(app).post("/api/flags").send({ key, name: "A" }),
      request(app).post("/api/flags").send({ key, name: "B" }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const rows = await prisma.featureFlag.findMany({ where: { key } });
    expect(rows).toHaveLength(1);
  });

  it("two simultaneous overrides for the same never-before-seen user: both succeed, exactly one row exists", async () => {
    const key = `${KEY_PREFIX}override-race`;
    await request(app).post("/api/flags").send({ key, name: "Override race" });
    const flag = await flagRepository.findByKey(key);

    const [a, b] = await Promise.all([
      request(app).put(`/api/flags/${key}/users/u1`).send({ enabled: true }),
      request(app).put(`/api/flags/${key}/users/u1`).send({ enabled: false }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);

    const rows = await prisma.featureFlagOverride.findMany({
      where: { flagId: flag!.id, userId: "u1" },
    });
    expect(rows).toHaveLength(1);
  });

  it("an override write racing a flag delete surfaces as 404, not 500 (Prisma P2003)", async () => {
    const key = `${KEY_PREFIX}delete-race`;
    const created = await request(app).post("/api/flags").send({ key, name: "Delete race" });

    // Simulate the flag being deleted in the window between the service's
    // existence check and the override write: findByKey still reports the
    // flag as present (as it would if the delete lands microseconds later),
    // but the row is actually gone by the time the upsert executes.
    await prisma.featureFlag.delete({ where: { key } });
    jest.spyOn(flagRepository, "findByKey").mockResolvedValueOnce({
      id: created.body.id,
      key,
      name: "Delete race",
      description: null,
      defaultEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app).put(`/api/flags/${key}/users/u1`).send({ enabled: true });
    expect(res.status).toBe(404);
  });

  it("reports the flag as missing, not the override, when the flag is deleted mid-request on override delete", async () => {
    const key = `${KEY_PREFIX}del-race`;
    await request(app).post("/api/flags").send({ key, name: "Delete race for override" });
    await request(app).put(`/api/flags/${key}/users/u1`).send({ enabled: true });

    const realFlag = await flagRepository.findByKey(key);
    jest.spyOn(flagRepository, "findByKey").mockResolvedValueOnce(realFlag);
    // Deletes the flag (and cascades away its override) after the service's
    // first existence check has already run, simulating the race window.
    await prisma.featureFlag.delete({ where: { key } });

    const res = await request(app).delete(`/api/flags/${key}/users/u1`);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe(`Flag '${key}' not found`);
  });
});
