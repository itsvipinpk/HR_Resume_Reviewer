import { Request, Response, NextFunction } from "express";
import fs from "fs";
import { AppError } from "../../../middleware/errorHandler";
import { RequestWithId } from "../../../middleware/requestId";
import { resumeParserService } from "../services/ResumeParserService";
import { cleanText } from "../utils/textCleaner";
import { detectSkills } from "../../../config/skills";
import { algorithmResumeParser } from "../services/AlgorithmResumeParser";
import { llmResumeParser } from "../services/LLMResumeParser";
import { embeddingService } from "../services/EmbeddingService";
import { resumeIngestionRepository } from "../repositories/ResumeIngestionRepository";
import { resumeIngestionService } from "../services/ResumeIngestionService";
import { StoredResumeDocument } from "../types/ingestion.types";
import { ENV } from "../../../config/env";

export class IngestionController {
  getModuleHealth = (req: Request, res: Response, next: NextFunction): void => {
    try {
      res.status(200).json({
        status: "ok",
        module: "resume-ingestion",
      });
    } catch (error) {
      next(error);
    }
  };

  uploadResume = (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.file) {
        throw new AppError(400, "FILE_REQUIRED", "Resume PDF is required");
      }

      const fileInfo = {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      };

      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      res.status(200).json({
        success: true,
        message: "Resume uploaded successfully",
        file: fileInfo,
      });
    } catch (error) {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      next(error);
    }
  };

  extractResumeText = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new AppError(400, "FILE_REQUIRED", "Resume PDF is required");
      }

      const filePath = req.file.path;
      let rawText = "";

      try {
        rawText = await resumeParserService.extractTextFromPdf(filePath);
      } finally {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      res.status(200).json({
        success: true,
        rawText,
        characters: rawText.length,
      });
    } catch (error) {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      next(error);
    }
  };

  cleanResumeText = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { rawText } = req.body;
      if (rawText === undefined || typeof rawText !== "string") {
        throw new AppError(400, "RAW_TEXT_REQUIRED", "rawText field is required");
      }

      const cleaned = cleanText(rawText);

      res.status(200).json({
        success: true,
        cleanText: cleaned,
      });
    } catch (error) {
      next(error);
    }
  };

  detectResumeSkills = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { rawText } = req.body;
      if (rawText === undefined || typeof rawText !== "string") {
        throw new AppError(400, "RAW_TEXT_REQUIRED", "rawText field is required");
      }

      const skills = detectSkills(rawText);

      res.status(200).json({
        success: true,
        skills,
      });
    } catch (error) {
      next(error);
    }
  };

  parseResume = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { rawText } = req.body;
      if (rawText === undefined || typeof rawText !== "string") {
        throw new AppError(400, "RAW_TEXT_REQUIRED", "rawText field is required");
      }

      const parsed = algorithmResumeParser.parseResume(rawText);

      res.status(200).json({
        success: true,
        resume: parsed,
      });
    } catch (error) {
      next(error);
    }
  };

  llmParseResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rawText } = req.body;
      if (rawText === undefined || typeof rawText !== "string") {
        throw new AppError(400, "RAW_TEXT_REQUIRED", "rawText field is required");
      }

      const parsed = await llmResumeParser.parseResume(rawText);

      res.status(200).json({
        success: true,
        resume: parsed,
      });
    } catch (error) {
      next(error);
    }
  };

  embedResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, role, skills, company, experienceSummary, rawText } = req.body;
      if (!rawText && !name && !role) {
        throw new AppError(
          400,
          "EMBEDDING_PAYLOAD_REQUIRED",
          "At least one resume field (rawText, name, role) is required"
        );
      }

      const embeddingText = embeddingService.buildEmbeddingText({
        name,
        role,
        skills,
        company,
        experienceSummary,
        rawText: rawText || "",
      });

      const result = await embeddingService.generateEmbedding(embeddingText);

      res.status(200).json({
        success: true,
        model: result.model,
        dimension: result.dimension,
        embedding: result.embedding,
      });
    } catch (error) {
      next(error);
    }
  };

  storeResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fileName, resume, rawText, embedding } = req.body;

      if (!fileName || typeof fileName !== "string") {
        throw new AppError(400, "FIELD_REQUIRED", "fileName is required");
      }
      if (!rawText || typeof rawText !== "string") {
        throw new AppError(400, "FIELD_REQUIRED", "rawText is required");
      }
      if (!Array.isArray(embedding)) {
        throw new AppError(400, "FIELD_REQUIRED", "embedding array is required");
      }
      if (
        embedding.length !== ENV.EMBEDDING_DIMENSION ||
        !embedding.every(
          (component: unknown) =>
            typeof component === "number" && Number.isFinite(component)
        )
      ) {
        throw new AppError(
          400,
          "INVALID_EMBEDDING",
          `embedding must contain exactly ${ENV.EMBEDDING_DIMENSION} finite numbers`
        );
      }

      const docToStore: Omit<StoredResumeDocument, "_id"> = {
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
        embeddingModel: ENV.MISTRAL_EMBED_MODEL,
        embeddingDimension: embedding.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resumeId = await resumeIngestionRepository.insertResume(docToStore);

      res.status(200).json({
        success: true,
        message: "Resume stored successfully",
        resumeId,
      });
    } catch (error) {
      next(error);
    }
  };

  getResumeById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const doc = await resumeIngestionRepository.findResumeById(id);
      if (!doc) {
        throw new AppError(404, "RESUME_NOT_FOUND", `Resume with id ${id} not found`);
      }

      res.status(200).json({
        success: true,
        resume: doc,
      });
    } catch (error) {
      next(error);
    }
  };

  searchResumes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query, limit = 10 } = req.body;
      if (typeof query !== "string" || query.trim().length === 0) {
        throw new AppError(400, "QUERY_REQUIRED", "query must be a non-empty string");
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new AppError(400, "INVALID_LIMIT", "limit must be an integer between 1 and 50");
      }

      const queryEmbeddingText = embeddingService.buildEmbeddingText({
        rawText: query.trim(),
      });
      const { embedding } = await embeddingService.generateEmbedding(queryEmbeddingText);
      const results = await resumeIngestionRepository.searchSimilarResumes(
        embedding,
        limit
      );

      res.status(200).json({
        success: true,
        query: query.trim(),
        results: results.map((resume) => ({
          ...resume,
          _id: resume._id.toString(),
        })),
      });
    } catch (error) {
      next(error);
    }
  };

  injectResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new AppError(400, "FILE_REQUIRED", "Resume PDF is required");
      }

      const requestId = (req as RequestWithId).requestId;
      const result = await resumeIngestionService.injectResume(req.file, requestId);

      res.status(200).json({
        success: true,
        message: "Resume ingestion completed",
        resumeId: result.resumeId,
        data: result.data,
        timings: result.timings,
      });
    } catch (error) {
      next(error);
    }
  };

  injectResumeBatch = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const files = Array.isArray(req.files) ? req.files : [];

    try {
      const batchSize = Number(req.body.batchSize);
      if (batchSize !== 5 && batchSize !== 10) {
        throw new AppError(
          400,
          "INVALID_BATCH_SIZE",
          "batchSize must be either 5 or 10"
        );
      }
      if (files.length === 0) {
        throw new AppError(
          400,
          "FILES_REQUIRED",
          "Upload at least one PDF in the files field"
        );
      }
      if (files.length > batchSize) {
        throw new AppError(
          400,
          "BATCH_SIZE_EXCEEDED",
          `This batch allows at most ${batchSize} files, but ${files.length} were uploaded`
        );
      }

      const requestId = (req as RequestWithId).requestId;
      const results = [];
      for (const file of files) {
        try {
          const result = await resumeIngestionService.injectResume(
            file,
            requestId
          );
          results.push({
            fileName: file.originalname,
            success: true,
            resumeId: result.resumeId,
            data: result.data,
            timings: result.timings,
          });
        } catch (error: unknown) {
          results.push({
            fileName: file.originalname,
            success: false,
            errorCode:
              error instanceof AppError
                ? error.errorCode
                : "RESUME_INGESTION_FAILED",
            message:
              error instanceof Error
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
    } catch (error) {
      next(error);
    } finally {
      for (const file of files) {
        if (file.path && fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch (error) {
            console.error("Failed to clean up temporary file:", error);
          }
        }
      }
    }
  };
}

export const ingestionController = new IngestionController();
