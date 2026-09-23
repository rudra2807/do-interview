import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route for ${req.method} ${req.path}`,
      details: null,
    },
  });
}

interface BodyParserSyntaxError extends SyntaxError {
  type?: string;
  status?: number;
}

function isMalformedJsonError(err: unknown): err is BodyParserSyntaxError {
  return err instanceof SyntaxError && (err as BodyParserSyntaxError).type === "entity.parse.failed";
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (isMalformedJsonError(err)) {
    res.status(400).json({
      error: { code: "MALFORMED_JSON", message: "Request body is not valid JSON", details: null },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details ?? null },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({
        error: { code: "CONFLICT", message: "Resource already exists", details: null },
      });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Resource not found", details: null },
      });
      return;
    }
    // Foreign key violation: the flag was deleted between our existence
    // check and the write (for example, an override upsert racing a flag
    // delete). The related resource is gone, so this is a 404, not a 500.
    if (err.code === "P2003") {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Related resource not found", details: null },
      });
      return;
    }
  }

  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong", details: null },
  });
}
