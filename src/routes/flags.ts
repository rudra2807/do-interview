import { Router } from "express";
import * as flagController from "../controllers/flagController";
import { validateBody } from "../middleware/validate";
import { createFlagSchema } from "../validation/flagSchemas";

export const flagsRouter = Router();

flagsRouter.post("/flags", validateBody(createFlagSchema), flagController.create);
flagsRouter.get("/flags", flagController.list);
