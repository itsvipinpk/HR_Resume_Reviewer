"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const database_1 = require("./config/database");
const startServer = async () => {
    try {
        await (0, database_1.connectToDatabase)();
    }
    catch (err) {
        console.warn("MongoDB connection deferred or failed on startup:", err);
    }
    const server = app_1.default.listen(env_1.ENV.PORT, () => {
        console.log(`Server running in ${env_1.ENV.NODE_ENV} mode on port ${env_1.ENV.PORT}`);
    });
    const handleShutdown = async (signal) => {
        console.log(`\nReceived ${signal}. Shutting down gracefully...`);
        server.close(async () => {
            try {
                await (0, database_1.closeDatabase)();
                console.log("Server closed successfully.");
                process.exit(0);
            }
            catch (err) {
                console.error("Error during graceful shutdown:", err);
                process.exit(1);
            }
        });
    };
    process.on("SIGINT", () => handleShutdown("SIGINT"));
    process.on("SIGTERM", () => handleShutdown("SIGTERM"));
    return server;
};
const serverPromise = startServer();
exports.default = serverPromise;
