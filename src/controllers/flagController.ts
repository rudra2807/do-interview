import { NextFunction, Request, Response } from "express";
import { flagService, evaluationService } from "../container";
import { EvaluateQuery } from "../validation/flagSchemas";

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

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const flag = await flagService.updateFlag(req.params.key, req.body);
    res.status(200).json(flag);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await flagService.deleteFlag(req.params.key);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function evaluate(req: Request, res: Response, next: NextFunction) {
  try {
    const { user_id } = req.query as unknown as EvaluateQuery;
    const result = await evaluationService.evaluate(req.params.key, user_id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
