import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";
import { ValidationError } from "../errors/AppError";

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new ValidationError(result.error.issues));
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(new ValidationError(result.error.issues));
      return;
    }
    req.query = result.data as typeof req.query;
    next();
  };
}
