"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resumeIngestionRepository = exports.ResumeIngestionRepository = void 0;
const mongodb_1 = require("mongodb");
const database_1 = require("../../../config/database");
const errorHandler_1 = require("../../../middleware/errorHandler");
const env_1 = require("../../../config/env");
class ResumeIngestionRepository {
    async insertResume(resume) {
        try {
            const collection = await (0, database_1.getResumesCollection)();
            const docToInsert = {
                ...resume,
                createdAt: resume.createdAt || new Date(),
                updatedAt: resume.updatedAt || new Date(),
            };
            const result = await collection.insertOne(docToInsert);
            return result.insertedId.toString();
        }
        catch (error) {
            throw new errorHandler_1.AppError(500, "INGESTION_FAILED", `Failed to store resume in database: ${error instanceof Error ? error.message : "Unknown database error"}`);
        }
    }
    async findResumeById(id) {
        try {
            const collection = await (0, database_1.getResumesCollection)();
            const objectId = mongodb_1.ObjectId.isValid(id) ? new mongodb_1.ObjectId(id) : null;
            if (!objectId)
                return null;
            return await collection.findOne({ _id: objectId });
        }
        catch (error) {
            throw new errorHandler_1.AppError(500, "DB_QUERY_FAILED", `Failed to retrieve resume: ${error instanceof Error ? error.message : "Unknown database error"}`);
        }
    }
    async searchSimilarResumes(embedding, limit) {
        try {
            const collection = await (0, database_1.getResumesCollection)();
            return await collection
                .aggregate([
                {
                    $vectorSearch: {
                        index: env_1.ENV.MONGODB_VECTOR_INDEX,
                        path: "embedding",
                        queryVector: embedding,
                        numCandidates: Math.max(limit * 10, 100),
                        limit,
                    },
                },
                {
                    $project: {
                        fileName: 1,
                        name: 1,
                        email: 1,
                        phone: 1,
                        location: 1,
                        company: 1,
                        role: 1,
                        education: 1,
                        totalExperience: 1,
                        relevantExperience: 1,
                        skills: 1,
                        jobTitles: 1,
                        experienceSummary: 1,
                        score: { $meta: "vectorSearchScore" },
                    },
                },
            ])
                .toArray();
        }
        catch (error) {
            throw new errorHandler_1.AppError(500, "VECTOR_SEARCH_FAILED", `Failed to search resumes: ${error instanceof Error ? error.message : "Unknown database error"}`);
        }
    }
}
exports.ResumeIngestionRepository = ResumeIngestionRepository;
exports.resumeIngestionRepository = new ResumeIngestionRepository();
