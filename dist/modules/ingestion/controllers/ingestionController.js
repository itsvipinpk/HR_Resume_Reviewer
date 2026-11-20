"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestionController = exports.IngestionController = void 0;
const fs_1 = __importDefault(require("fs"));
const errorHandler_1 = require("../../../middleware/errorHandler");
const ResumeParserService_1 = require("../services/ResumeParserService");
const textCleaner_1 = require("../utils/textCleaner");
const skills_1 = require("../../../config/skills");
const AlgorithmResumeParser_1 = require("../services/AlgorithmResumeParser");
const LLMResumeParser_1 = require("../services/LLMResumeParser");
const EmbeddingService_1 = require("../services/EmbeddingService");
const ResumeIngestionRepository_1 = require("../repositories/ResumeIngestionRepository");
const ResumeIngestionService_1 = require("../services/ResumeIngestionService");
const env_1 = require("../../../config/env");
class IngestionController {
    getModuleHealth = (req, res, next) => {
        try {
            res.status(200).json({
                status: "ok",
                module: "resume-ingestion",
            });
        }
        catch (error) {
            next(error);
        }
    };
    uploadResume = (req, res, next) => {
        try {
            if (!req.file) {
                throw new errorHandler_1.AppError(400, "FILE_REQUIRED", "Resume PDF is required");
            }
            const fileInfo = {
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                size: req.file.size,
            };
            if (req.file.path && fs_1.default.existsSync(req.file.path)) {
                fs_1.default.unlinkSync(req.file.path);
            }
            res.status(200).json({
                success: true,
                message: "Resume uploaded successfully",
                file: fileInfo,
            });
        }
        catch (error) {
            if (req.file && req.file.path && fs_1.default.existsSync(req.file.path)) {
                fs_1.default.unlinkSync(req.file.path);
            }
            next(error);
        }
    };
    extractResumeText = async (req, res, next) => {
        try {
            if (!req.file) {
                throw new errorHandler_1.AppError(400, "FILE_REQUIRED", "Resume PDF is required");
            }
            const filePath = req.file.path;
            let rawText = "";
            try {
                rawText = await ResumeParserService_1.resumeParserService.extractTextFromPdf(filePath);
            }
            finally {
                if (fs_1.default.existsSync(filePath)) {
                    fs_1.default.unlinkSync(filePath);
                }
            }
            res.status(200).json({
                success: true,
                rawText,
                characters: rawText.length,
            });
        }
        catch (error) {
            if (req.file && req.file.path && fs_1.default.existsSync(req.file.path)) {
                fs_1.default.unlinkSync(req.file.path);
            }
            next(error);
        }
    };
    cleanResumeText = (req, res, next) => {
        try {
            const { rawText } = req.body;
            if (rawText === undefined || typeof rawText !== "string") {
                throw new errorHandler_1.AppError(400, "RAW_TEXT_REQUIRED", "rawText field is required");
            }
            const cleaned = (0, textCleaner_1.cleanText)(rawText);
            res.status(200).json({
                success: true,
                cleanText: cleaned,
            });
        }
        catch (error) {
            next(error);
        }
    };
    detectResumeSkills = (req, res, next) => {
        try {
            const { rawText } = req.body;
            if (rawText === undefined || typeof rawText !== "string") {
                throw new errorHandler_1.AppError(400, "RAW_TEXT_REQUIRED", "rawText field is required");
            }
            const skills = (0, skills_1.detectSkills)(rawText);
            res.status(200).json({
                success: true,
                skills,
            });
        }
        catch (error) {
            next(error);
        }
    };
    parseResume = (req, res, next) => {
        try {
            const { rawText } = req.body;
            if (rawText === undefined || typeof rawText !== "string") {
                throw new errorHandler_1.AppError(400, "RAW_TEXT_REQUIRED", "rawText field is required");
            }
            const parsed = AlgorithmResumeParser_1.algorithmResumeParser.parseResume(rawText);
            res.status(200).json({
                success: true,
                resume: parsed,
            });
        }
        catch (error) {
            next(error);
        }
    };
    llmParseResume = async (req, res, next) => {
        try {
            const { rawText } = req.body;
            if (rawText === undefined || typeof rawText !== "string") {
                throw new errorHandler_1.AppError(400, "RAW_TEXT_REQUIRED", "rawText field is required");
            }
            const parsed = await LLMResumeParser_1.llmResumeParser.parseResume(rawText);
            res.status(200).json({
                success: true,
                resume: parsed,
            });
        }
        catch (error) {
            next(error);
        }
    };
    embedResume = async (req, res, next) => {
        try {
            const { name, role, skills, company, experienceSummary, rawText } = req.body;
            if (!rawText && !name && !role) {
                throw new errorHandler_1.AppError(400, "EMBEDDING_PAYLOAD_REQUIRED", "At least one resume field (rawText, name, role) is required");
            }
            const embeddingText = EmbeddingService_1.embeddingService.buildEmbeddingText({
                name,
                role,
                skills,
                company,
                experienceSummary,
                rawText: rawText || "",
            });
            const result = await EmbeddingService_1.embeddingService.generateEmbedding(embeddingText);
            res.status(200).json({
                success: true,
                model: result.model,
                dimension: result.dimension,
                embedding: result.embedding,
            });
        }
        catch (error) {
            next(error);
        }
    };
    storeResume = async (req, res, next) => {
        try {
            const { fileName, resume, rawText, embedding } = req.body;
            if (!fileName || typeof fileName !== "string") {
                throw new errorHandler_1.AppError(400, "FIELD_REQUIRED", "fileName is required");
            }
            if (!rawText || typeof rawText !== "string") {
                throw new errorHandler_1.AppError(400, "FIELD_REQUIRED", "rawText is required");
            }
            if (!Array.isArray(embedding)) {
                throw new errorHandler_1.AppError(400, "FIELD_REQUIRED", "embedding array is required");
            }
            if (embedding.length !== env_1.ENV.EMBEDDING_DIMENSION ||
                !embedding.every((component) => typeof component === "number" && Number.isFinite(component))) {
                throw new errorHandler_1.AppError(400, "INVALID_EMBEDDING", `embedding must contain exactly ${env_1.ENV.EMBEDDING_DIMENSION} finite numbers`);
            }
            const docToStore = {
                fileName,
                rawText,
                name: resume?.name ?? null,
                email: resume?.email ?? null,
                phone: resume?.phone ?? null,
                location: resume?.location ?? null,
                company: resume?.company ?? null,
                role: resume?.role ?? null,
                education: resume?.education ?? null,
                totalExperience: resume?.totalExperience ?? null,
                relevantExperience: resume?.relevantExperience ?? null,
                skills: resume?.skills || [],
                jobTitles: resume?.jobTitles || (resume?.role ? [resume.role] : []),
                experienceSummary: resume?.experienceSummary ?? null,
                embedding,
                embeddingModel: env_1.ENV.MISTRAL_EMBED_MODEL,
                embeddingDimension: embedding.length,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const resumeId = await ResumeIngestionRepository_1.resumeIngestionRepository.insertResume(docToStore);
            res.status(200).json({
                success: true,
                message: "Resume stored successfully",
                resumeId,
            });
        }
        catch (error) {
            next(error);
        }
    };
    getResumeById = async (req, res, next) => {
        try {
            const id = req.params.id;
            const doc = await ResumeIngestionRepository_1.resumeIngestionRepository.findResumeById(id);
            if (!doc) {
                throw new errorHandler_1.AppError(404, "RESUME_NOT_FOUND", `Resume with id ${id} not found`);
            }
            res.status(200).json({
                success: true,
                resume: doc,
            });
        }
        catch (error) {
            next(error);
        }
    };
    searchResumes = async (req, res, next) => {
        try {
            const { query, limit = 10 } = req.body;
            if (typeof query !== "string" || query.trim().length === 0) {
                throw new errorHandler_1.AppError(400, "QUERY_REQUIRED", "query must be a non-empty string");
            }
            if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
                throw new errorHandler_1.AppError(400, "INVALID_LIMIT", "limit must be an integer between 1 and 50");
            }
            const queryEmbeddingText = EmbeddingService_1.embeddingService.buildEmbeddingText({
                rawText: query.trim(),
            });
            const { embedding } = await EmbeddingService_1.embeddingService.generateEmbedding(queryEmbeddingText);
            const results = await ResumeIngestionRepository_1.resumeIngestionRepository.searchSimilarResumes(embedding, limit);
            res.status(200).json({
                success: true,
                query: query.trim(),
                results: results.map((resume) => ({
                    ...resume,
                    _id: resume._id.toString(),
                })),
            });
        }
        catch (error) {
            next(error);
        }
    };
    injectResume = async (req, res, next) => {
        try {
            if (!req.file) {
                throw new errorHandler_1.AppError(400, "FILE_REQUIRED", "Resume PDF is required");
            }
            const requestId = req.requestId;
            const result = await ResumeIngestionService_1.resumeIngestionService.injectResume(req.file, requestId);
            res.status(200).json({
                success: true,
                message: "Resume ingestion completed",
                resumeId: result.resumeId,
                data: result.data,
                timings: result.timings,
            });
        }
        catch (error) {
            next(error);
        }
    };
    injectResumeBatch = async (req, res, next) => {
        const files = Array.isArray(req.files) ? req.files : [];
        try {
            const batchSize = Number(req.body.batchSize);
            if (batchSize !== 5 && batchSize !== 10) {
                throw new errorHandler_1.AppError(400, "INVALID_BATCH_SIZE", "batchSize must be either 5 or 10");
            }
            if (files.length === 0) {
                throw new errorHandler_1.AppError(400, "FILES_REQUIRED", "Upload at least one PDF in the files field");
            }
            if (files.length > batchSize) {
                throw new errorHandler_1.AppError(400, "BATCH_SIZE_EXCEEDED", `This batch allows at most ${batchSize} files, but ${files.length} were uploaded`);
            }
            const requestId = req.requestId;
            const results = [];
            for (const file of files) {
                try {
                    const result = await ResumeIngestionService_1.resumeIngestionService.injectResume(file, requestId);
                    results.push({
                        fileName: file.originalname,
                        success: true,
                        resumeId: result.resumeId,
                        data: result.data,
                        timings: result.timings,
                    });
                }
                catch (error) {
                    results.push({
                        fileName: file.originalname,
                        success: false,
                        errorCode: error instanceof errorHandler_1.AppError
                            ? error.errorCode
                            : "RESUME_INGESTION_FAILED",
                        message: error instanceof Error
                            ? error.message
                            : "An unexpected error occurred while ingesting this resume",
                    });
                }
            }
            const succeeded = results.filter((result) => result.success).length;
            const failed = results.length - succeeded;
            res.status(failed > 0 ? 207 : 200).json({
                success: failed === 0,
                batchSize,
                totalFiles: results.length,
                succeeded,
                failed,
                results,
            });
        }
        catch (error) {
            next(error);
        }
        finally {
            for (const file of files) {
                if (file.path && fs_1.default.existsSync(file.path)) {
                    try {
                        fs_1.default.unlinkSync(file.path);
                    }
                    catch (error) {
                        console.error("Failed to clean up temporary file:", error);
                    }
                }
            }
        }
    };
}
exports.IngestionController = IngestionController;
exports.ingestionController = new IngestionController();
