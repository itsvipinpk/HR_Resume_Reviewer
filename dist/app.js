"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const requestId_1 = require("./middleware/requestId");
const logger_1 = require("./middleware/logger");
const errorHandler_1 = require("./middleware/errorHandler");
const database_1 = require("./config/database");
const ingestionRoutes_1 = __importDefault(require("./modules/ingestion/routes/ingestionRoutes"));
const retrievalRoutes_1 = __importDefault(require("./modules/retrieval/routes/retrievalRoutes"));
const app = (0, express_1.default)();
// Base middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
// Request tracing and logging
app.use(requestId_1.requestIdMiddleware);
app.use(logger_1.loggerMiddleware);
// Phase 1 Health Endpoint
app.get("/v1/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        app: "resume-rag-backend",
        version: "1.0.0",
        uptime: Number(process.uptime().toFixed(1)),
    });
});
// Phase 2 Database Health Endpoint
app.get("/v1/health/db", async (req, res) => {
    const health = await (0, database_1.checkDatabaseHealth)();
    if (health.connected) {
        res.status(200).json({
            status: "ok",
            database: "mongodb",
            connected: true,
            latencyMs: health.latencyMs,
        });
    }
    else {
        res.status(503).json({
            status: "error",
            database: "mongodb",
            connected: false,
            errorCode: "DB_CONNECTION_FAILED",
        });
    }
});
// Phase 1 Retrieval readiness route
app.use("/v1", retrievalRoutes_1.default);
// Phase 3 Ingestion Module Routes
app.use("/v1", ingestionRoutes_1.default);
// Global Error Handler
app.use(errorHandler_1.errorHandler);
exports.default = app;
