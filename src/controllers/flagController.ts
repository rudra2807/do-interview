import { NextFunction, Request, Response } from "express";
import * as flagService from "../services/flagService";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const flag = await flagService.createFlag(req.body);
    res.status(201).json(flag);
  } catch (err) {
    next(err);
  }
}

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    const flags = await flagService.listFlags();
    res.status(200).json({ flags });
  } catch (err) {
    next(err);
  }
}
