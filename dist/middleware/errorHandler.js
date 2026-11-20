"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.AppError = void 0;
const multer_1 = __importDefault(require("multer"));
class AppError extends Error {
    statusCode;
    errorCode;
    constructor(statusCode, errorCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.AppError = AppError;
const errorHandler = (err, req, res, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
next) => {
    const reqWithId = req;
    const requestId = reqWithId.requestId || "unknown";
    let statusCode = err.statusCode || (err.status ? Number(err.status) : 500);
    let errorCode = err.errorCode || "INTERNAL_SERVER_ERROR";
    let message = err.message || "An unexpected error occurred";
    if (err instanceof multer_1.default.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            statusCode = 413;
            errorCode = "FILE_TOO_LARGE";
            message = "Resume exceeds maximum upload size";
        }
        else {
            statusCode = 400;
            errorCode = "FILE_UPLOAD_ERROR";
            message = err.message;
        }
    }
    console.error(JSON.stringify({
        requestId,
        errorCode,
        statusCode,
        message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    }));
    res.status(statusCode).json({
        success: false,
        requestId,
        errorCode,
        message,
    });
};
exports.errorHandler = errorHandler;
