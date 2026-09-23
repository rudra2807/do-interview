import { NextFunction, Request, Response } from "express";
import * as overrideService from "../services/overrideService";

export async function setOverride(req: Request, res: Response, next: NextFunction) {
  try {
    const { key, userId } = req.params;
    const { enabled } = req.body;
    const result = await overrideService.setOverride(key, userId, enabled);
    res.status(result.status).json({
      flag: key,
      user_id: result.userId,
      enabled: result.enabled,
      updated_at: result.updatedAt,
    });
  } catch (err) {
    next(err);
  }
}

export async function removeOverride(req: Request, res: Response, next: NextFunction) {
  try {
    const { key, userId } = req.params;
    await overrideService.removeOverride(key, userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
