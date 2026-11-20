import { ObjectId } from "mongodb";
import { getResumesCollection } from "../../../config/database";
import { ENV } from "../../../config/env";
import { StoredResumeDocument } from "../../ingestion/types/ingestion.types";

export class ResumeRepository {
  private getCandidateText(document: StoredResumeDocument): string {
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

  private getBM25Score(document: StoredResumeDocument, query: string): number {
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

  async findById(id: string): Promise<StoredResumeDocument | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }

    const collection = await getResumesCollection<StoredResumeDocument>();
    return collection.findOne({ _id: new ObjectId(id) });
  }

  async findCandidateDocuments(limit = 20): Promise<StoredResumeDocument[]> {
    const collection = await getResumesCollection<StoredResumeDocument>();
    return collection.find({}).limit(limit).toArray();
  }

  async findByTextQuery(query: string, limit = 20): Promise<StoredResumeDocument[]> {
    const collection = await getResumesCollection<StoredResumeDocument>();
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

  async searchByBM25(
    query: string,
    limit = 10,
    filters: Record<string, unknown> = {}
  ): Promise<Array<StoredResumeDocument & { score: number }>> {
    const collection = await getResumesCollection<StoredResumeDocument>();
    const filter: Record<string, unknown> = {};

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

  async searchByVector(
    embedding: number[],
    limit = 10
  ): Promise<Array<StoredResumeDocument & { score: number }>> {
    const collection = await getResumesCollection<StoredResumeDocument>();
    const docs = await collection
      .aggregate([
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

    return docs as Array<StoredResumeDocument & { score: number }>;
  }
}

export const resumeRepository = new ResumeRepository();
