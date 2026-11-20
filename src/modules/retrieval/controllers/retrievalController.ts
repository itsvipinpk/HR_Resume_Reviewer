import { NextFunction, Request, Response } from "express";
import { AppError } from "../../../middleware/errorHandler";
import { embeddingService } from "../../ingestion/services/EmbeddingService";
import { retrievalValidationService } from "../services/RetrievalValidationService";
import { llmService } from "../services/LLMService";
import { searchService } from "../services/SearchService";

export class RetrievalController {
  getReadiness = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const readiness = await retrievalValidationService.getReadiness();
      res.status(200).json(readiness);
    } catch (error) {
      next(error);
    }
  };

  generateEmbedding = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { model, input } = req.body ?? {};

      if (typeof input !== "string" || input.trim().length === 0) {
        throw new AppError(400, "EMBEDDING_INPUT_REQUIRED", "input is required");
      }

      const text = input.trim();
      const targetModel =
        typeof model === "string" && model.trim().length > 0
          ? model.trim()
          : "mistral-embed";

      if (targetModel !== "mistral-embed") {
        throw new AppError(
          400,
          "UNSUPPORTED_EMBEDDING_MODEL",
          "Only mistral-embed is supported for query embeddings"
        );
      }

      const embeddingText = embeddingService.buildEmbeddingText({ rawText: text });
      const result = await embeddingService.generateEmbedding(embeddingText);

      res.status(200).json({
        embedding: result.embedding,
        model: result.model,
        dimension: result.dimension,
      });
    } catch (error) {
      next(error);
    }
  };

  searchBM25 = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { query, topK, filters } = req.body ?? {};
      const results = await searchService.bm25Search({
        query,
        topK,
        filters,
      });

      res.status(200).json({
        mode: "bm25",
        query: typeof query === "string" ? query : "",
        count: results.length,
        results,
      });
    } catch (error) {
      next(error);
    }
  };

  searchVector = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { query, topK, filters } = req.body ?? {};
      if (typeof query !== "string" || query.trim().length === 0) {
        throw new AppError(400, "QUERY_REQUIRED", "query must be a non-empty string");
      }

      const embeddingText = embeddingService.buildEmbeddingText({ rawText: query.trim() });
      const { embedding } = await embeddingService.generateEmbedding(embeddingText);
      const results = await searchService.vectorSearch(
        { query: query.trim(), topK, filters },
        embedding
      );

      res.status(200).json({
        mode: "vector",
        query: query.trim(),
        count: results.length,
        results,
      });
    } catch (error) {
      next(error);
    }
  };

  searchHybrid = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { query, topK, filters } = req.body ?? {};
      if (typeof query !== "string" || query.trim().length === 0) {
        throw new AppError(400, "QUERY_REQUIRED", "query must be a non-empty string");
      }

      const embeddingText = embeddingService.buildEmbeddingText({ rawText: query.trim() });
      const { embedding } = await embeddingService.generateEmbedding(embeddingText);
      const result = await searchService.hybridSearch(
        { query: query.trim(), topK, filters },
        embedding
      );

      res.status(200).json({
        mode: "hybrid-debug",
        query: query.trim(),
        bm25: result.bm25,
        vector: result.vector,
        timings: result.timings,
      });
    } catch (error) {
      next(error);
    }
  };

  searchRerank = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { query, candidates, topK } = req.body ?? {};
      if (typeof query !== "string" || query.trim().length === 0) {
        throw new AppError(400, "INVALID_SEARCH_QUERY", "Search query is required");
      }
      if (query.length > 2000) {
        throw new AppError(400, "INVALID_SEARCH_QUERY", "Search query is too long");
      }
      if (!Array.isArray(candidates)) {
        throw new AppError(400, "INVALID_CANDIDATES", "candidates must be an array");
      }
      if (candidates.length > 50 || candidates.some((candidate) =>
        !candidate || typeof candidate !== "object" || Array.isArray(candidate)
      )) {
        throw new AppError(
          400,
          "INVALID_CANDIDATES",
          "candidates must be an array of at most 50 candidate objects",
        );
      }
      if (topK !== undefined && (!Number.isInteger(topK) || topK < 1 || topK > 50)) {
        throw new AppError(400, "INVALID_TOP_K", "topK must be between 1 and 50");
      }

      const result = await llmService.rerankCandidates({
        query: query.trim(),
        candidates,
        topN: topK,
      });

      res.status(200).json({
        results: result.results.map(toPublicCandidate),
        model: result.model,
        provider: result.provider,
      });
    } catch (error) {
      next(error);
    }
  };

  searchSummarize = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { query, candidate, style, maxTokens } = req.body ?? {};
      if (typeof query !== "string" || query.trim().length === 0) {
        throw new AppError(400, "INVALID_SEARCH_QUERY", "Search query is required");
      }
      if (query.length > 2000) {
        throw new AppError(400, "INVALID_SEARCH_QUERY", "Search query is too long");
      }
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        throw new AppError(400, "INVALID_CANDIDATE", "candidate is required");
      }
      if (
        style !== undefined &&
        style !== "short" &&
        style !== "detailed"
      ) {
        throw new AppError(400, "INVALID_SUMMARY_STYLE", "style must be short or detailed");
      }
      if (
        maxTokens !== undefined &&
        (!Number.isInteger(maxTokens) || maxTokens < 50 || maxTokens > 300)
      ) {
        throw new AppError(400, "INVALID_MAX_TOKENS", "maxTokens must be between 50 and 300");
      }

      const summary = await llmService.summarizeCandidateFitWithMetadata(
        query.trim(),
        candidate as Record<string, unknown>,
        {
          style: style ?? "short",
          maxTokens: maxTokens ?? 400,
        }
      );

      res.status(200).json({
        resumeId: String((candidate as Record<string, unknown>).resumeId ?? "unknown"),
        summary: summary.summary,
        model: summary.model,
        provider: summary.provider,
      });
    } catch (error) {
      next(error);
    }
  };

  search = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { query, mode, filters = {}, options = {} } = req.body ?? {};
      if (mode !== undefined && !["bm25", "vector", "hybrid"].includes(mode)) {
        throw new AppError(
          400,
          "INVALID_SEARCH_MODE",
          "mode must be bm25, vector, or hybrid",
        );
      }
      if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
        throw new AppError(400, "INVALID_FILTERS", "filters must be an object");
      }
      if (!options || typeof options !== "object" || Array.isArray(options)) {
        throw new AppError(400, "INVALID_SEARCH_OPTIONS", "options must be an object");
      }
      if (
        options.summarize !== undefined &&
        typeof options.summarize !== "boolean"
      ) {
        throw new AppError(
          400,
          "INVALID_SEARCH_OPTIONS",
          "options.summarize must be a boolean",
        );
      }
      for (const field of ["bm25TopK", "vectorTopK", "rerankTopN", "finalTopK"]) {
        const value = options[field];
        if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 50)) {
          throw new AppError(
            400,
            "INVALID_SEARCH_OPTIONS",
            `options.${field} must be an integer between 1 and 50`,
          );
        }
      }
      if (
        options.summaryStyle !== undefined &&
        options.summaryStyle !== "short" &&
        options.summaryStyle !== "detailed"
      ) {
        throw new AppError(
          400,
          "INVALID_SEARCH_OPTIONS",
          "options.summaryStyle must be short or detailed",
        );
      }
      if (
        options.maxTokens !== undefined &&
        (!Number.isInteger(options.maxTokens) ||
          options.maxTokens < 50 ||
          options.maxTokens > 300)
      ) {
        throw new AppError(
          400,
          "INVALID_SEARCH_OPTIONS",
          "options.maxTokens must be an integer between 50 and 300",
        );
      }
      const result = await searchService.endToEndSearch(query, filters, {
        ...options,
        mode: mode ?? "hybrid",
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const retrievalController = new RetrievalController();

function toPublicCandidate(candidate: Record<string, unknown>) {
  const { rawText: _rawText, embedding: _embedding, ...publicCandidate } = candidate;
  return publicCandidate;
}
