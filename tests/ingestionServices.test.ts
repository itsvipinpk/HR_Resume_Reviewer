import { ObjectId } from "mongodb";
import { ENV } from "../src/config/env";
import { getResumesCollection } from "../src/config/database";
import { AppError } from "../src/middleware/errorHandler";
import { ResumeIngestionRepository } from "../src/modules/ingestion/repositories/ResumeIngestionRepository";
import { EmbeddingService } from "../src/modules/ingestion/services/EmbeddingService";
import { StoredResumeDocument } from "../src/modules/ingestion/types/ingestion.types";

jest.mock("../src/config/database", () => ({
  getResumesCollection: jest.fn(),
}));

const mockedGetResumesCollection = jest.mocked(getResumesCollection);

describe("EmbeddingService", () => {
  const service = new EmbeddingService();
  const originalApiKey = ENV.MISTRAL_API_KEY;
  const originalDimension = ENV.EMBEDDING_DIMENSION;

  beforeEach(() => {
    ENV.MISTRAL_API_KEY = "test-api-key";
    ENV.EMBEDDING_DIMENSION = 1024;
  });

  afterEach(() => {
    ENV.MISTRAL_API_KEY = originalApiKey;
    ENV.EMBEDDING_DIMENSION = originalDimension;
    jest.restoreAllMocks();
  });

  it("accepts a valid embedding response with the configured dimension", async () => {
    const embedding = Array.from({ length: 1024 }, (_, index) => index / 1024);
    jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding }] }),
    } as Response);

    await expect(service.generateEmbedding("resume text")).resolves.toEqual({
      model: ENV.MISTRAL_EMBED_MODEL,
      dimension: 1024,
      embedding,
    });
  });

  it("rejects a response with an empty embedding vector", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: [] }] }),
    } as Response);

    await expect(service.generateEmbedding("resume text")).rejects.toMatchObject({
      statusCode: 502,
      errorCode: "EMBEDDING_FAILED",
    });
  });

  it("rejects an embedding response with the wrong configured dimension", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
    } as Response);

    await expect(service.generateEmbedding("resume text")).rejects.toMatchObject({
      statusCode: 502,
      errorCode: "EMBEDDING_FAILED",
      message: "Expected embedding dimension 1024, but got 2",
    });
  });

  it("returns a configuration error when the API key is missing", async () => {
    ENV.MISTRAL_API_KEY = "";

    await expect(service.generateEmbedding("resume text")).rejects.toMatchObject({
      statusCode: 500,
      errorCode: "EMBEDDING_CONFIG_ERROR",
    });
  });
});

describe("ResumeIngestionRepository", () => {
  const repository = new ResumeIngestionRepository();
  const resume: Omit<StoredResumeDocument, "_id"> = {
    fileName: "resume.pdf",
    rawText: "Sam Taylor resume",
    skills: ["Playwright"],
    embedding: [0.1, 0.2],
    embeddingModel: "test-embedding-model",
    embeddingDimension: 2,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("inserts a resume and returns its generated ID", async () => {
    const insertedId = new ObjectId();
    const insertOne = jest.fn().mockResolvedValue({ insertedId });
    mockedGetResumesCollection.mockResolvedValueOnce({
      insertOne,
    } as never);

    await expect(repository.insertResume(resume)).resolves.toBe(
      insertedId.toString()
    );
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: resume.fileName,
        rawText: resume.rawText,
        skills: resume.skills,
        embedding: resume.embedding,
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt,
      })
    );
  });

  it("wraps database insert failures in a controlled application error", async () => {
    const insertOne = jest.fn().mockRejectedValue(new Error("database unavailable"));
    mockedGetResumesCollection.mockResolvedValueOnce({
      insertOne,
    } as never);

    const error = await repository.insertResume(resume).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 500,
      errorCode: "INGESTION_FAILED",
      message: "Failed to store resume in database: database unavailable",
    });
  });

  it("runs Atlas vector search against the configured index", async () => {
    const toArray = jest.fn().mockResolvedValue([]);
    const aggregate = jest.fn().mockReturnValue({ toArray });
    mockedGetResumesCollection.mockResolvedValueOnce({ aggregate } as never);

    await expect(repository.searchSimilarResumes([0.1], 5)).resolves.toEqual([]);
    expect(aggregate).toHaveBeenCalledWith([
      {
        $vectorSearch: {
          index: "resume_vector_index",
          path: "embedding",
          queryVector: [0.1],
          numCandidates: 100,
          limit: 5,
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
    ]);
  });
});
