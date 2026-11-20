"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrievalValidationService = exports.RetrievalValidationService = void 0;
const database_1 = require("../../../config/database");
const env_1 = require("../../../config/env");
class RetrievalValidationService {
    async getReadiness() {
        try {
            const collection = await (0, database_1.getResumesCollection)();
            const resumeCount = await collection.countDocuments({});
            const embeddingDocuments = await collection
                .find({
                embedding: { $exists: true, $ne: null },
            }, {
                projection: {
                    _id: 1,
                    embedding: 1,
                    embeddingModel: 1,
                    embeddingDimension: 1,
                },
            })
                .toArray();
            const validEmbeddingDocuments = embeddingDocuments.filter((document) => {
                const embedding = document.embedding;
                return Array.isArray(embedding) && embedding.length > 0;
            });
            const resumesWithEmbedding = validEmbeddingDocuments.length;
            const sampleDocument = validEmbeddingDocuments[0] || null;
            const embeddingModel = typeof sampleDocument?.embeddingModel === "string"
                ? sampleDocument.embeddingModel
                : env_1.ENV.MISTRAL_EMBED_MODEL;
            const embeddingDimension = typeof sampleDocument?.embeddingDimension === "number"
                ? sampleDocument.embeddingDimension
                : env_1.ENV.EMBEDDING_DIMENSION;
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
            if (embeddingDimension !== env_1.ENV.EMBEDDING_DIMENSION ||
                embeddingModel !== env_1.ENV.MISTRAL_EMBED_MODEL) {
                return {
                    ready: false,
                    collection: "resumes",
                    resumeCount,
                    resumesWithEmbedding,
                    embeddingModel,
                    embeddingDimension,
                    reason: "Stored resume embeddings are incompatible with the configured embedding model",
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
        }
        catch (error) {
            return {
                ready: false,
                collection: "resumes",
                reason: error instanceof Error
                    ? error.message
                    : "Unable to validate retrieval readiness",
            };
        }
    }
}
exports.RetrievalValidationService = RetrievalValidationService;
exports.retrievalValidationService = new RetrievalValidationService();
