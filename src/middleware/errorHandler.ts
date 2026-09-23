import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/AppError";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` },
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
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
  }

  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong", details: null },
  });
}
