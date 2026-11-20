"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resumeParserService = exports.ResumeParserService = void 0;
const fs_1 = __importDefault(require("fs"));
const errorHandler_1 = require("../../../middleware/errorHandler");
// Use require to load CommonJS export; pass options to avoid pdf-parse test-file loading
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");
const PDF_PARSE_OPTIONS = { version: "v1.10.100" };
class ResumeParserService {
    async extractTextFromPdf(filePath) {
        if (!fs_1.default.existsSync(filePath)) {
            throw new errorHandler_1.AppError(400, "FILE_NOT_FOUND", "File to extract does not exist");
        }
        try {
            const dataBuffer = fs_1.default.readFileSync(filePath);
            const data = await pdfParse(dataBuffer, PDF_PARSE_OPTIONS);
            const rawText = data.text ? data.text.trim() : "";
            if (!rawText) {
                throw new errorHandler_1.AppError(422, "RESUME_EXTRACTION_FAILED", "Resume text extraction returned empty content");
            }
            return rawText;
        }
        catch (error) {
            if (error instanceof errorHandler_1.AppError) {
                throw error;
            }
            throw new errorHandler_1.AppError(422, "RESUME_EXTRACTION_FAILED", error.message || "Resume extraction failed");
        }
    }
}
exports.ResumeParserService = ResumeParserService;
exports.resumeParserService = new ResumeParserService();
