"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loggerMiddleware = void 0;
const loggerMiddleware = (req, res, next) => {
    const startTime = Date.now();
    const reqWithId = req;
    res.on("finish", () => {
        const durationMs = Date.now() - startTime;
        const logData = {
            requestId: reqWithId.requestId || "unknown",
            method: req.method,
            endpoint: req.originalUrl || req.url,
            statusCode: res.statusCode,
            durationMs,
        };
        console.log(JSON.stringify(logData));
    });
    next();
};
exports.loggerMiddleware = loggerMiddleware;
