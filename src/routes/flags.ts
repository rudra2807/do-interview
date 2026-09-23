import { Router } from "express";
import * as flagController from "../controllers/flagController";
import * as overrideController from "../controllers/overrideController";
import { validateBody, validateQuery } from "../middleware/validate";
import {
  createFlagSchema,
  updateFlagSchema,
  setOverrideSchema,
  evaluateQuerySchema,
} from "../validation/flagSchemas";

export const flagsRouter = Router();

flagsRouter.post("/flags", validateBody(createFlagSchema), flagController.create);
flagsRouter.get("/flags", flagController.list);
flagsRouter.patch("/flags/:key", validateBody(updateFlagSchema), flagController.update);
flagsRouter.delete("/flags/:key", flagController.remove);

flagsRouter.put(
  "/flags/:key/users/:userId",
  validateBody(setOverrideSchema),
  overrideController.setOverride
);
flagsRouter.delete("/flags/:key/users/:userId", overrideController.removeOverride);

flagsRouter.get(
  "/flags/:key/evaluate",
  validateQuery(evaluateQuerySchema),
  flagController.evaluate
);
