import { ENV } from "../../../config/env";
import { AppError } from "../../../middleware/errorHandler";

export interface EmbeddingResponse {
  model: string;
  dimension: number;
  embedding: number[];
}

interface MistralEmbeddingPayload {
  data?: Array<{ embedding?: unknown }>;
}

const isEmbeddingVector = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.every(
    (component): component is number =>
      typeof component === "number" && Number.isFinite(component)
  );

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Mistral embedding failed";

export class EmbeddingService {
  /**
   * Generates a 1024-dimension vector embedding using Mistral API.
   */
  async generateEmbedding(text: string): Promise<EmbeddingResponse> {
    if (!text || text.trim().length === 0) {
      throw new AppError(
        400,
        "EMBEDDING_INPUT_REQUIRED",
        "Input text for embedding cannot be empty"
      );
    }

    if (!ENV.MISTRAL_API_KEY) {
      throw new AppError(
        500,
        "EMBEDDING_CONFIG_ERROR",
        "MISTRAL_API_KEY is not configured in environment"
      );
    }

    try {
      const response = await fetch("https://api.mistral.ai/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: ENV.MISTRAL_EMBED_MODEL,
          input: [text],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Mistral API error (${response.status}): ${errorText}`
        );
      }

      const data = (await response.json()) as MistralEmbeddingPayload;
      const embedding = data.data?.[0]?.embedding;

      if (!isEmbeddingVector(embedding) || embedding.length === 0) {
        throw new Error("Mistral API returned an empty or invalid embedding vector");
      }

      if (embedding.length !== ENV.EMBEDDING_DIMENSION) {
        throw new Error(
          `Expected embedding dimension ${ENV.EMBEDDING_DIMENSION}, but got ${embedding.length}`
        );
      }

      return {
        model: ENV.MISTRAL_EMBED_MODEL,
        dimension: embedding.length,
        embedding,
      };
    } catch (error: unknown) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        502,
        "EMBEDDING_FAILED",
        getErrorMessage(error)
      );
    }
  }

  /**
   * Builds the standard resume text used for embedding.
   */
  buildEmbeddingText(params: {
    name?: string | null;
    role?: string | null;
    skills?: string[];
    company?: string | null;
    experienceSummary?: string | null;
    rawText: string;
  }): string {
    const { name, role, skills, company, experienceSummary, rawText } = params;
    return `
${name || ""}
${role || ""}
${skills && skills.length > 0 ? skills.join(", ") : ""}
${company || ""}
${experienceSummary || ""}
${rawText || ""}
`.trim();
  }
}

export const embeddingService = new EmbeddingService();
