import { Response } from "express";
import { Prisma } from "@prisma/client";
import { errorHandler, notFoundHandler } from "../../src/middleware/errorHandler";
import { ValidationError, NotFoundError, ConflictError } from "../../src/errors/AppError";

function mockResponse() {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response & { status: jest.Mock; json: jest.Mock };
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("db error", {
    code,
    clientVersion: "test",
  });
}

describe("notFoundHandler", () => {
  it("returns the same error shape (including details: null) as a domain-level 404", () => {
    const res = mockResponse();
    notFoundHandler({ method: "GET", path: "/nope" } as any, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "NOT_FOUND", message: "No route for GET /nope", details: null },
    });
  });
});

describe("errorHandler", () => {
  it("maps ValidationError to 400 with details", () => {
    const res = mockResponse();
    errorHandler(new ValidationError([{ path: ["key"] }]), {} as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "VALIDATION_ERROR", message: "Invalid request", details: [{ path: ["key"] }] },
    });
  });

  it("maps NotFoundError to 404", () => {
    const res = mockResponse();
    errorHandler(new NotFoundError("gone"), {} as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("maps ConflictError to 409", () => {
    const res = mockResponse();
    errorHandler(new ConflictError("dup"), {} as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("maps Prisma P2002 (unique constraint) to 409", () => {
    const res = mockResponse();
    errorHandler(prismaError("P2002"), {} as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("maps Prisma P2025 (record not found) to 404", () => {
    const res = mockResponse();
    errorHandler(prismaError("P2025"), {} as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("maps Prisma P2003 (foreign key violation) to 404", () => {
    const res = mockResponse();
    errorHandler(prismaError("P2003"), {} as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("maps a malformed JSON body error to 400, not 500", () => {
    const res = mockResponse();
    const err = new SyntaxError("Unexpected token") as SyntaxError & { type: string };
    err.type = "entity.parse.failed";
    errorHandler(err, {} as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "MALFORMED_JSON", message: "Request body is not valid JSON", details: null },
    });
  });

  it("maps an unrecognized error to 500 with no internal details leaked", () => {
    const res = mockResponse();
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    errorHandler(new Error("some internal secret"), {} as any, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.error.message).not.toContain("secret");
    consoleSpy.mockRestore();
  });
});
