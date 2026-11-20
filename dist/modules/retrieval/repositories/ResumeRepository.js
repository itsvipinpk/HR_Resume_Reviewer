"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resumeRepository = exports.ResumeRepository = void 0;
const mongodb_1 = require("mongodb");
const database_1 = require("../../../config/database");
const env_1 = require("../../../config/env");
class ResumeRepository {
    getCandidateText(document) {
        return [
            document.rawText ?? "",
            Array.isArray(document.skills) ? document.skills.join(" ") : "",
            document.role ?? "",
            document.company ?? "",
            document.experienceSummary ?? "",
            Array.isArray(document.jobTitles) ? document.jobTitles.join(" ") : "",
        ]
            .join(" ")
            .toLowerCase();
    }
    getBM25Score(document, query) {
        const terms = query
            .toLowerCase()
            .split(/\s+/)
            .filter((term) => term.length > 0);
        if (terms.length === 0) {
            return 0;
        }
        const haystack = this.getCandidateText(document);
        let score = 0;
        for (const term of terms) {
            const occurrences = haystack.split(term).length - 1;
            score += occurrences * (term.length + 1);
        }
        return score;
    }
    async findById(id) {
        if (!mongodb_1.ObjectId.isValid(id)) {
            return null;
        }
        const collection = await (0, database_1.getResumesCollection)();
        return collection.findOne({ _id: new mongodb_1.ObjectId(id) });
    }
    async findCandidateDocuments(limit = 20) {
        const collection = await (0, database_1.getResumesCollection)();
        return collection.find({}).limit(limit).toArray();
    }
    async findByTextQuery(query, limit = 20) {
        const collection = await (0, database_1.getResumesCollection)();
        return collection
            .find({
            $or: [
                { rawText: { $regex: query, $options: "i" } },
                { skills: { $regex: query, $options: "i" } },
                { role: { $regex: query, $options: "i" } },
            ],
        })
            .limit(limit)
            .toArray();
    }
    async searchByBM25(query, limit = 10, filters = {}) {
        const collection = await (0, database_1.getResumesCollection)();
        const filter = {};
        if (typeof filters.minYearsExperience === "number") {
            filter.totalExperience = { $gte: filters.minYearsExperience };
        }
        const candidates = await collection.find(filter).limit(Math.max(limit * 10, 50)).toArray();
        return candidates
            .map((document) => ({
            ...document,
            score: this.getBM25Score(document, query),
        }))
            .filter((document) => document.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
    async searchByVector(embedding, limit = 10) {
        const collection = await (0, database_1.getResumesCollection)();
        const docs = await collection
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
                    _id: 1,
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
        return docs;
    }
}
exports.ResumeRepository = ResumeRepository;
exports.resumeRepository = new ResumeRepository();
