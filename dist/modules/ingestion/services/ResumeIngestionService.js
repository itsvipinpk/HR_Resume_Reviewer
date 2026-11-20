"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resumeIngestionService = exports.ResumeIngestionService = void 0;
const fs_1 = __importDefault(require("fs"));
const env_1 = require("../../../config/env");
const errorHandler_1 = require("../../../middleware/errorHandler");
const ResumeParserService_1 = require("./ResumeParserService");
const textCleaner_1 = require("../utils/textCleaner");
const AlgorithmResumeParser_1 = require("./AlgorithmResumeParser");
const LLMResumeParser_1 = require("./LLMResumeParser");
const EmbeddingService_1 = require("./EmbeddingService");
const ResumeIngestionRepository_1 = require("../repositories/ResumeIngestionRepository");
class ResumeIngestionService {
    async injectResume(file, requestId) {
        if (!file) {
            throw new errorHandler_1.AppError(400, "FILE_REQUIRED", "Resume PDF is required");
        }
        const filePath = file.path;
        try {
            // 1. Extract Text
            const tExtractStart = Date.now();
            const rawText = await ResumeParserService_1.resumeParserService.extractTextFromPdf(filePath);
            const extractMs = Date.now() - tExtractStart;
            // 2. Clean Text
            const tCleanStart = Date.now();
            const cleanedText = (0, textCleaner_1.cleanText)(rawText);
            const cleanMs = Date.now() - tCleanStart;
            // 3. Parse Resume
            const tParseStart = Date.now();
            let parsed;
            if (env_1.ENV.USE_LLM_PARSER) {
                parsed = await LLMResumeParser_1.llmResumeParser.parseResume(cleanedText);
            }
            else {
                parsed = AlgorithmResumeParser_1.algorithmResumeParser.parseResume(cleanedText);
            }
            const parseMs = Date.now() - tParseStart;
            // 4. Generate Embedding
            const tEmbedStart = Date.now();
            const embeddingText = EmbeddingService_1.embeddingService.buildEmbeddingText({
                name: parsed.name,
                role: parsed.role,
                skills: parsed.skills,
                company: parsed.company,
                experienceSummary: parsed.experienceSummary,
                rawText: cleanedText,
            });
            const { embedding, model, dimension } = await EmbeddingService_1.embeddingService.generateEmbedding(embeddingText);
            const embeddingMs = Date.now() - tEmbedStart;
            // 5. Store in MongoDB
            const tInsertStart = Date.now();
            const documentToStore = {
                fileName: file.originalname,
                rawText: cleanedText,
                name: parsed.name ?? null,
                email: parsed.email ?? null,
                phone: parsed.phone ?? null,
                location: parsed.location ?? null,
                company: parsed.company ?? null,
                role: parsed.role ?? null,
                education: parsed.education ?? null,
                totalExperience: parsed.totalExperience ?? null,
                relevantExperience: parsed.relevantExperience ?? null,
                skills: parsed.skills || [],
                jobTitles: parsed.jobTitles || (parsed.role ? [parsed.role] : []),
                experienceSummary: parsed.experienceSummary ?? null,
                embedding,
                embeddingModel: model,
                embeddingDimension: dimension,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const resumeId = await ResumeIngestionRepository_1.resumeIngestionRepository.insertResume(documentToStore);
            const mongoInsertMs = Date.now() - tInsertStart;
            const totalMs = extractMs + cleanMs + parseMs + embeddingMs + mongoInsertMs;
            const timings = {
                extractMs,
                cleanMs,
                parseMs,
                embeddingMs,
                mongoInsertMs,
                totalMs,
            };
            // Structured log as required in Phase 15
            console.log(JSON.stringify({
                requestId: requestId || "unknown",
                endpoint: "/v1/resume/inject",
                fileName: file.originalname,
                statusCode: 200,
                ...timings,
            }));
            return {
                resumeId,
                data: {
                    name: parsed.name,
                    role: parsed.role,
                    company: parsed.company,
                    totalExperience: parsed.totalExperience,
                    skillsCount: (parsed.skills || []).length,
                    embeddingModel: model,
                    embeddingDimension: dimension,
                },
                timings,
            };
        }
        finally {
            if (filePath && fs_1.default.existsSync(filePath)) {
                try {
                    fs_1.default.unlinkSync(filePath);
                }
                catch (err) {
                    console.error("Failed to clean up temporary file:", err);
                }
            }
        }
    }
}
exports.ResumeIngestionService = ResumeIngestionService;
exports.resumeIngestionService = new ResumeIngestionService();
