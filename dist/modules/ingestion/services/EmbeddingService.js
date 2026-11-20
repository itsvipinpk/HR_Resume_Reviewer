"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.embeddingService = exports.EmbeddingService = void 0;
const env_1 = require("../../../config/env");
const errorHandler_1 = require("../../../middleware/errorHandler");
const isEmbeddingVector = (value) => Array.isArray(value) &&
    value.every((component) => typeof component === "number" && Number.isFinite(component));
const getErrorMessage = (error) => error instanceof Error ? error.message : "Mistral embedding failed";
class EmbeddingService {
    /**
     * Generates a 1024-dimension vector embedding using Mistral API.
     */
    async generateEmbedding(text) {
        if (!text || text.trim().length === 0) {
            throw new errorHandler_1.AppError(400, "EMBEDDING_INPUT_REQUIRED", "Input text for embedding cannot be empty");
        }
        if (!env_1.ENV.MISTRAL_API_KEY) {
            throw new errorHandler_1.AppError(500, "EMBEDDING_CONFIG_ERROR", "MISTRAL_API_KEY is not configured in environment");
        }
        try {
            const response = await fetch("https://api.mistral.ai/v1/embeddings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env_1.ENV.MISTRAL_API_KEY}`,
                },
                body: JSON.stringify({
                    model: env_1.ENV.MISTRAL_EMBED_MODEL,
                    input: [text],
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Mistral API error (${response.status}): ${errorText}`);
            }
            const data = (await response.json());
            const embedding = data.data?.[0]?.embedding;
            if (!isEmbeddingVector(embedding) || embedding.length === 0) {
                throw new Error("Mistral API returned an empty or invalid embedding vector");
            }
            if (embedding.length !== env_1.ENV.EMBEDDING_DIMENSION) {
                throw new Error(`Expected embedding dimension ${env_1.ENV.EMBEDDING_DIMENSION}, but got ${embedding.length}`);
            }
            return {
                model: env_1.ENV.MISTRAL_EMBED_MODEL,
                dimension: embedding.length,
                embedding,
            };
        }
        catch (error) {
            if (error instanceof errorHandler_1.AppError) {
                throw error;
            }
            throw new errorHandler_1.AppError(502, "EMBEDDING_FAILED", getErrorMessage(error));
        }
    }
    /**
     * Builds the standard resume text used for embedding.
     */
    buildEmbeddingText(params) {
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
exports.EmbeddingService = EmbeddingService;
exports.embeddingService = new EmbeddingService();
