import express from "express";
import { healthRouter } from "./routes/health";
import { flagsRouter } from "./routes/flags";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(healthRouter);
  app.use("/api", flagsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
