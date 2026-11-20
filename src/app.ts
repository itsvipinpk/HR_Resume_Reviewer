import express, { Application, Request, Response } from "express";
import cors from "cors";
import { requestIdMiddleware } from "./middleware/requestId";
import { loggerMiddleware } from "./middleware/logger";
import { errorHandler } from "./middleware/errorHandler";
import { checkDatabaseHealth } from "./config/database";
import ingestionRoutes from "./modules/ingestion/routes/ingestionRoutes";
import retrievalRoutes from "./modules/retrieval/routes/retrievalRoutes";

const app: Application = express();

// Base middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request tracing and logging
app.use(requestIdMiddleware);
app.use(loggerMiddleware);

// Phase 1 Health Endpoint
app.get("/v1/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    app: "resume-rag-backend",
    version: "1.0.0",
    uptime: Number(process.uptime().toFixed(1)),
  });
});

// Phase 2 Database Health Endpoint
app.get("/v1/health/db", async (req: Request, res: Response) => {
  const health = await checkDatabaseHealth();
  if (health.connected) {
    res.status(200).json({
      status: "ok",
      database: "mongodb",
      connected: true,
      latencyMs: health.latencyMs,
    });
  } else {
    res.status(503).json({
      status: "error",
      database: "mongodb",
      connected: false,
      errorCode: "DB_CONNECTION_FAILED",
    });
  }
});

// Phase 1 Retrieval readiness route
app.use("/v1", retrievalRoutes);

// Phase 3 Ingestion Module Routes
app.use("/v1", ingestionRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;
