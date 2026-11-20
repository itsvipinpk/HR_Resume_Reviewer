import { ObjectId } from "mongodb";
import { getResumesCollection } from "../../../config/database";
import {
  ResumeSearchResult,
  StoredResumeDocument,
} from "../types/ingestion.types";
import { AppError } from "../../../middleware/errorHandler";
import { ENV } from "../../../config/env";

export class ResumeIngestionRepository {
  async insertResume(
    resume: Omit<StoredResumeDocument, "_id">
  ): Promise<string> {
    try {
      const collection = await getResumesCollection<StoredResumeDocument>();
      const docToInsert = {
        ...resume,
        createdAt: resume.createdAt || new Date(),
        updatedAt: resume.updatedAt || new Date(),
      };
      const result = await collection.insertOne(docToInsert);
      return result.insertedId.toString();
    } catch (error: unknown) {
      throw new AppError(
        500,
        "INGESTION_FAILED",
        `Failed to store resume in database: ${
          error instanceof Error ? error.message : "Unknown database error"
        }`
      );
    }
  }

  async findResumeById(id: string): Promise<StoredResumeDocument | null> {
    try {
      const collection = await getResumesCollection<StoredResumeDocument>();
      const objectId = ObjectId.isValid(id) ? new ObjectId(id) : null;
      if (!objectId) return null;
      return await collection.findOne({ _id: objectId });
    } catch (error: unknown) {
      throw new AppError(
        500,
        "DB_QUERY_FAILED",
        `Failed to retrieve resume: ${
          error instanceof Error ? error.message : "Unknown database error"
        }`
      );
    }
  }

  async searchSimilarResumes(
    embedding: number[],
    limit: number
  ): Promise<ResumeSearchResult[]> {
    try {
      const collection = await getResumesCollection<StoredResumeDocument>();
      return await collection
        .aggregate<ResumeSearchResult>([
          {
            $vectorSearch: {
              index: ENV.MONGODB_VECTOR_INDEX,
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
    } catch (error: unknown) {
      throw new AppError(
        500,
        "VECTOR_SEARCH_FAILED",
        `Failed to search resumes: ${
          error instanceof Error ? error.message : "Unknown database error"
        }`
      );
    }
  }
}

export const resumeIngestionRepository = new ResumeIngestionRepository();
