import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db/prisma";

const app = createApp();
const KEY_PREFIX = "test-malformed-";

async function cleanup() {
  await prisma.featureFlag.deleteMany({ where: { key: { startsWith: KEY_PREFIX } } });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("malformed request bodies", () => {
  it("returns 400, not 500, for a body that is not valid JSON", async () => {
    const res = await request(app)
      .post("/api/flags")
      .set("Content-Type", "application/json")
      .send('{"key": "bad", invalid json here');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("MALFORMED_JSON");
  });

  it("returns 400 for wrong field types on create", async () => {
    const res = await request(app)
      .post("/api/flags")
      .send({ key: `${KEY_PREFIX}wrong-type`, name: "x", defaultEnabled: "true" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a key that is not a lowercase slug", async () => {
    const res = await request(app)
      .post("/api/flags")
      .send({ key: "Not A Valid Key!", name: "x" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a name over the max length", async () => {
    const res = await request(app)
      .post("/api/flags")
      .send({ key: `${KEY_PREFIX}long-name`, name: "a".repeat(201) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a description over the max length", async () => {
    const res = await request(app)
      .post("/api/flags")
      .send({ key: `${KEY_PREFIX}long-desc`, name: "x", description: "a".repeat(1001) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown field instead of silently ignoring it", async () => {
    const key = `${KEY_PREFIX}unknown-field`;
    const res = await request(app)
      .post("/api/flags")
      .send({ key, name: "x", defaultEnable: true });
    expect(res.status).toBe(400);

    const stored = await prisma.featureFlag.findUnique({ where: { key } });
    expect(stored).toBeNull();
  });

  it("returns 400 for an unknown field on the override body", async () => {
    const key = `${KEY_PREFIX}unknown-override-field`;
    await request(app).post("/api/flags").send({ key, name: "x" });
    const res = await request(app)
      .put(`/api/flags/${key}/users/u1`)
      .send({ enabled: true, notes: "extra" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown query param on evaluate", async () => {
    const key = `${KEY_PREFIX}unknown-query-param`;
    await request(app).post("/api/flags").send({ key, name: "x" });
    const res = await request(app)
      .get(`/api/flags/${key}/evaluate`)
      .query({ user_id: "u1", extra: "param" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an empty body on PATCH", async () => {
    const key = `${KEY_PREFIX}empty-patch`;
    await request(app).post("/api/flags").send({ key, name: "x" });
    const res = await request(app).patch(`/api/flags/${key}`).send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 for wrong field type on PATCH", async () => {
    const key = `${KEY_PREFIX}bad-patch-type`;
    await request(app).post("/api/flags").send({ key, name: "x" });
    const res = await request(app).patch(`/api/flags/${key}`).send({ defaultEnabled: "yes" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the override body is missing 'enabled'", async () => {
    const key = `${KEY_PREFIX}override-missing-enabled`;
    await request(app).post("/api/flags").send({ key, name: "x" });
    const res = await request(app).put(`/api/flags/${key}/users/u1`).send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when the override body has a non-boolean 'enabled'", async () => {
    const key = `${KEY_PREFIX}override-bad-enabled`;
    await request(app).post("/api/flags").send({ key, name: "x" });
    const res = await request(app)
      .put(`/api/flags/${key}/users/u1`)
      .send({ enabled: "false" });
    // A string "false" must not be coerced to boolean true or accepted at all.
    expect(res.status).toBe(400);
  });
});

describe("evaluate query param handling", () => {
  it("does not coerce a string user_id of 'false' into anything special (it is just an id)", async () => {
    const key = `${KEY_PREFIX}eval-string-id`;
    await request(app).post("/api/flags").send({ key, name: "x", defaultEnabled: true });
    const res = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "false" });
    expect(res.status).toBe(200);
    expect(res.body.user_id).toBe("false");
  });

  it("returns 400 when user_id is an empty string", async () => {
    const key = `${KEY_PREFIX}eval-empty-id`;
    await request(app).post("/api/flags").send({ key, name: "x" });
    const res = await request(app).get(`/api/flags/${key}/evaluate`).query({ user_id: "" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when user_id is supplied twice (arrives as an array)", async () => {
    const key = `${KEY_PREFIX}eval-array-id`;
    await request(app).post("/api/flags").send({ key, name: "x" });
    const res = await request(app).get(`/api/flags/${key}/evaluate?user_id=a&user_id=b`);
    expect(res.status).toBe(400);
  });
});

describe("path param edge cases", () => {
  it("returns 404, not 500, for a nonsense key on evaluate", async () => {
    const res = await request(app)
      .get("/api/flags/../../weird%20key!!/evaluate")
      .query({ user_id: "u1" });
    expect([404, 400]).toContain(res.status);
  });

  it("returns 404, not 500, for a nonsense key on PATCH", async () => {
    const res = await request(app).patch("/api/flags/weird!!key with spaces").send({ defaultEnabled: true });
    expect(res.status).toBe(404);
  });

  it("returns 404, not 500, for a very long garbage key", async () => {
    const res = await request(app).delete(`/api/flags/${"x".repeat(500)}`);
    expect(res.status).toBe(404);
  });
});
