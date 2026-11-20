import { getResumesCollection } from "../../../config/database";
import { ENV } from "../../../config/env";

export interface RetrievalReadinessResult {
  ready: boolean;
  collection: string;
  resumeCount?: number;
  resumesWithEmbedding?: number;
  embeddingModel?: string;
  embeddingDimension?: number;
  reason?: string;
}

export class RetrievalValidationService {
  async getReadiness(): Promise<RetrievalReadinessResult> {
    try {
      const collection = await getResumesCollection();
      const resumeCount = await collection.countDocuments({});
      const embeddingDocuments = await collection
        .find(
          {
            embedding: { $exists: true, $ne: null },
          },
          {
            projection: {
              _id: 1,
              embedding: 1,
              embeddingModel: 1,
              embeddingDimension: 1,
            },
          }
        )
        .toArray();

      const validEmbeddingDocuments = embeddingDocuments.filter((document) => {
        const embedding = document.embedding;
        return Array.isArray(embedding) && embedding.length > 0;
      });

      const resumesWithEmbedding = validEmbeddingDocuments.length;
      const sampleDocument = validEmbeddingDocuments[0] || null;
      const embeddingModel =
        typeof sampleDocument?.embeddingModel === "string"
          ? sampleDocument.embeddingModel
          : ENV.MISTRAL_EMBED_MODEL;
      const embeddingDimension =
        typeof sampleDocument?.embeddingDimension === "number"
          ? sampleDocument.embeddingDimension
          : ENV.EMBEDDING_DIMENSION;

      if (resumeCount === 0 || resumesWithEmbedding === 0) {
        return {
          ready: false,
          collection: "resumes",
          resumeCount,
          resumesWithEmbedding,
          embeddingModel,
          embeddingDimension,
          reason: "No ingested resume embeddings are available",
        };
      }

      if (
        embeddingDimension !== ENV.EMBEDDING_DIMENSION ||
        embeddingModel !== ENV.MISTRAL_EMBED_MODEL
      ) {
        return {
          ready: false,
          collection: "resumes",
          resumeCount,
          resumesWithEmbedding,
          embeddingModel,
          embeddingDimension,
          reason:
            "Stored resume embeddings are incompatible with the configured embedding model",
        };
      }

      return {
        ready: true,
        collection: "resumes",
        resumeCount,
        resumesWithEmbedding,
        embeddingModel,
        embeddingDimension,
      };
    } catch (error) {
      return {
        ready: false,
        collection: "resumes",
        reason:
          error instanceof Error
            ? error.message
            : "Unable to validate retrieval readiness",
      };
    }
  }
}

export const retrievalValidationService = new RetrievalValidationService();
