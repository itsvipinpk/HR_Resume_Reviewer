import fs from "fs";
import { ENV } from "../../../config/env";
import { AppError } from "../../../middleware/errorHandler";
import { resumeParserService } from "./ResumeParserService";
import { cleanText } from "../utils/textCleaner";
import { algorithmResumeParser } from "./AlgorithmResumeParser";
import { llmResumeParser } from "./LLMResumeParser";
import { embeddingService } from "./EmbeddingService";
import { resumeIngestionRepository } from "../repositories/ResumeIngestionRepository";
import { IngestionResult, ParsedResume, StoredResumeDocument } from "../types/ingestion.types";

export class ResumeIngestionService {
  async injectResume(
    file: Express.Multer.File,
    requestId?: string
  ): Promise<IngestionResult> {
    if (!file) {
      throw new AppError(400, "FILE_REQUIRED", "Resume PDF is required");
    }

    const filePath = file.path;

    try {
      // 1. Extract Text
      const tExtractStart = Date.now();
      const rawText = await resumeParserService.extractTextFromPdf(filePath);
      const extractMs = Date.now() - tExtractStart;

      // 2. Clean Text
      const tCleanStart = Date.now();
      const cleanedText = cleanText(rawText);
      const cleanMs = Date.now() - tCleanStart;

      // 3. Parse Resume
      const tParseStart = Date.now();
      let parsed: ParsedResume;
      if (ENV.USE_LLM_PARSER) {
        parsed = await llmResumeParser.parseResume(cleanedText);
      } else {
        parsed = algorithmResumeParser.parseResume(cleanedText);
      }
      const parseMs = Date.now() - tParseStart;

      // 4. Generate Embedding
      const tEmbedStart = Date.now();
      const embeddingText = embeddingService.buildEmbeddingText({
        name: parsed.name,
        role: parsed.role,
        skills: parsed.skills,
        company: parsed.company,
        experienceSummary: parsed.experienceSummary,
        rawText: cleanedText,
      });

      const { embedding, model, dimension } =
        await embeddingService.generateEmbedding(embeddingText);
      const embeddingMs = Date.now() - tEmbedStart;

      // 5. Store in MongoDB
      const tInsertStart = Date.now();
      const documentToStore: Omit<StoredResumeDocument, "_id"> = {
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

      const resumeId = await resumeIngestionRepository.insertResume(
        documentToStore
      );
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
      console.log(
        JSON.stringify({
          requestId: requestId || "unknown",
          endpoint: "/v1/resume/inject",
          fileName: file.originalname,
          statusCode: 200,
          ...timings,
        })
      );

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
    } finally {
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error("Failed to clean up temporary file:", err);
        }
      }
    }
  }
}

export const resumeIngestionService = new ResumeIngestionService();
