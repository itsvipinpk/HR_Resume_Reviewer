"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const env_1 = require("./env");
const errorHandler_1 = require("../middleware/errorHandler");
const uploadDir = path_1.default.resolve(process.cwd(), "uploads");
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase() || ".pdf";
        const safeName = `${(0, uuid_1.v4)()}-${Date.now()}${ext}`;
        cb(null, safeName);
    },
});
const fileFilter = (req, file, cb) => {
    const isPdfMime = file.mimetype === "application/pdf";
    const isPdfExt = path_1.default.extname(file.originalname).toLowerCase() === ".pdf";
    if (isPdfMime || isPdfExt) {
        cb(null, true);
    }
    else {
        cb(new errorHandler_1.AppError(415, "INVALID_FILE_TYPE", "Only PDF files are allowed"));
    }
};
exports.upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: env_1.ENV.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    },
    fileFilter,
});
