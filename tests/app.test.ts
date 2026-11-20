import fs from "fs";
import request from "supertest";
import { ObjectId } from "mongodb";
import app from "../src/app";
import { checkDatabaseHealth, getResumesCollection } from "../src/config/database";
import { resumeIngestionRepository } from "../src/modules/ingestion/repositories/ResumeIngestionRepository";
import { embeddingService } from "../src/modules/ingestion/services/EmbeddingService";
import { llmResumeParser } from "../src/modules/ingestion/services/LLMResumeParser";
import { resumeParserService } from "../src/modules/ingestion/services/ResumeParserService";
import { resumeRepository } from "../src/modules/retrieval/repositories/ResumeRepository";
import { llmService } from "../src/modules/retrieval/services/LLMService";
import { ENV } from "../src/config/env";

jest.mock("dotenv", () => ({
  config: jest.fn(),
}));

jest.mock("uuid", () => ({
  v4: (() => {
    let id = 0;
    return () => `test-request-id-${id++}`;
  })(),
}));

jest.mock("../src/modules/ingestion/services/ResumeParserService", () => ({
  resumeParserService: {
    extractTextFromPdf: jest.fn(),
  },
}));

jest.mock("../src/modules/ingestion/services/LLMResumeParser", () => ({
  llmResumeParser: {
    parseResume: jest.fn(),
  },
}));

jest.mock("../src/modules/ingestion/services/EmbeddingService", () => ({
  embeddingService: {
    buildEmbeddingText: jest.fn(),
    generateEmbedding: jest.fn(),
  },
}));

jest.mock("../src/modules/ingestion/repositories/ResumeIngestionRepository", () => ({
  resumeIngestionRepository: {
    insertResume: jest.fn(),
    findResumeById: jest.fn(),
    searchSimilarResumes: jest.fn(),
  },
}));

jest.mock("../src/modules/retrieval/repositories/ResumeRepository", () => ({
  resumeRepository: {
    searchByBM25: jest.fn(),
    searchByVector: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock("../src/config/database", () => ({
  checkDatabaseHealth: jest.fn(),
  getResumesCollection: jest.fn(),
}));

const mockedCheckDatabaseHealth = jest.mocked(checkDatabaseHealth);
const mockedGetResumesCollection = jest.mocked(getResumesCollection);
const mockedResumeParserService = jest.mocked(resumeParserService);
const mockedLlmResumeParser = jest.mocked(llmResumeParser);
const mockedEmbeddingService = jest.mocked(embeddingService);
const mockedResumeRepository = jest.mocked(resumeIngestionRepository);
const mockedRetrievalRepository = jest.mocked(resumeRepository);

describe("HTTP API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(llmService, "detectDuplicateGroups").mockResolvedValue({
      groups: [],
      uncertainGroupCount: 0,
      model: "test-model",
      provider: "groq",
    });
    jest.spyOn(llmService, "rerankCandidates").mockImplementation(async (request) => ({
      results: request.candidates.map((candidate, index) => ({
        ...candidate,
        rank: index + 1,
        rerankReason: "Evidence matches the recruiter query.",
      })),
      model: "test-model",
      provider: "groq",
    }));
    jest.spyOn(llmService, "summarizeCandidateFitWithMetadata").mockResolvedValue({
      summary: "Strong fit based on the supplied resume evidence.",
      provider: "groq",
      model: "test-model",
    });
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the retrieval readiness status for ingested resume embeddings", async () => {
    mockedGetResumesCollection.mockResolvedValueOnce({
      countDocuments: jest.fn().mockResolvedValueOnce(1),
      find: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValueOnce([
          {
            embedding: Array.from({ length: 1024 }, () => 0.1),
            embeddingModel: "mistral-embed",
            embeddingDimension: 1024,
          },
        ]),
      }),
    } as any);

    const response = await request(app).get("/v1/search/readiness");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ready: true,
      collection: "resumes",
      resumeCount: 1,
      resumesWithEmbedding: 1,
      embeddingModel: "mistral-embed",
      embeddingDimension: 1024,
    });
  });

  it("generates a query embedding for retrieval requests", async () => {
    mockedEmbeddingService.buildEmbeddingText.mockReturnValueOnce(
      "Senior QA Architect RAG DeepEval MCP"
    );
    mockedEmbeddingService.generateEmbedding.mockResolvedValueOnce({
      model: "mistral-embed",
      dimension: 1024,
      embedding: Array.from({ length: 1024 }, () => 0.05),
    });

    const response = await request(app)
      .post("/v1/embeddings")
      .send({
        model: "mistral-embed",
        input: "Senior QA Architect RAG DeepEval MCP",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      embedding: Array.from({ length: 1024 }, () => 0.05),
      model: "mistral-embed",
      dimension: 1024,
    });
  });

  it("runs a BM25 lexical retrieval search", async () => {
    mockedRetrievalRepository.searchByBM25.mockResolvedValueOnce([
      {
        _id: new ObjectId(),
        fileName: "resume.pdf",
        name: "Sam Taylor",
        role: "Senior QA Architect",
        company: "Acme",
        skills: ["Playwright", "RAG"],
        score: 8.2,
      },
    ] as any);

    const response = await request(app)
      .post("/v1/search/bm25")
      .send({ query: "qa architect Playwright", topK: 5 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      mode: "bm25",
      query: "qa architect Playwright",
      count: 1,
    });
    expect(response.body.results[0]).toMatchObject({
      resumeId: expect.any(String),
      name: "Sam Taylor",
      role: "Senior QA Architect",
      source: "bm25",
      score: 8.2,
    });
  });

  it("runs a vector retrieval search", async () => {
    mockedEmbeddingService.buildEmbeddingText.mockReturnValueOnce(
      "Senior QA Architect Playwright"
    );
    mockedEmbeddingService.generateEmbedding.mockResolvedValueOnce({
      model: "mistral-embed",
      dimension: 1024,
      embedding: Array.from({ length: 1024 }, () => 0.2),
    });
    mockedRetrievalRepository.searchByVector.mockResolvedValueOnce([
      {
        _id: new ObjectId(),
        fileName: "resume.pdf",
        name: "Sam Taylor",
        role: "Senior QA Architect",
        company: "Acme",
        skills: ["Playwright"],
        score: 0.92,
      },
    ] as any);

    const response = await request(app)
      .post("/v1/search/vector")
      .send({ query: "Senior QA Architect Playwright" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      mode: "vector",
      query: "Senior QA Architect Playwright",
      count: 1,
    });
    expect(response.body.results[0]).toMatchObject({
      resumeId: expect.any(String),
      name: "Sam Taylor",
      source: "vector",
      score: 0.92,
    });
  });

  it("runs the hybrid search debug endpoint", async () => {
    mockedEmbeddingService.buildEmbeddingText.mockReturnValueOnce(
      "Senior Agentic QA Architect with RAG"
    );
    mockedEmbeddingService.generateEmbedding.mockResolvedValueOnce({
      model: "mistral-embed",
      dimension: 1024,
      embedding: Array.from({ length: 1024 }, () => 0.15),
    });
    mockedRetrievalRepository.searchByBM25.mockResolvedValueOnce([
      {
        _id: new ObjectId(),
        fileName: "resume.pdf",
        name: "Sam Taylor",
        role: "Senior QA Architect",
        company: "Acme",
        skills: ["RAG", "Playwright"],
        score: 7.5,
      },
    ] as any);
    mockedRetrievalRepository.searchByVector.mockResolvedValueOnce([
      {
        _id: new ObjectId(),
        fileName: "resume.pdf",
        name: "Sam Taylor",
        role: "Senior QA Architect",
        company: "Acme",
        skills: ["RAG", "Playwright"],
        score: 0.85,
      },
    ] as any);

    const response = await request(app)
      .post("/v1/search/hybrid")
      .send({ query: "Senior Agentic QA Architect with RAG" });

    expect(response.status).toBe(200);
    expect(response.body.mode).toBe("hybrid-debug");
    expect(response.body.bm25).toHaveLength(1);
    expect(response.body.vector).toHaveLength(1);
    expect(response.body.timings).toMatchObject({
      bm25Ms: expect.any(Number),
      vectorMs: expect.any(Number),
    });
  });

  it("reranks candidate results for a search query", async () => {
    const response = await request(app)
      .post("/v1/search/rerank")
      .send({
        query: "Senior QA architect with RAG and MCP",
        candidates: [
          { resumeId: "resume-1", score: 0.95, role: "QA Architect" },
          { resumeId: "resume-2", score: 0.72, role: "Product Manager" },
        ],
        topK: 2,
      });

    expect(response.status).toBe(200);
    expect(response.body.model).toBeTruthy();
    expect(response.body.results).toHaveLength(2);
    expect(response.body.results[0]).toMatchObject({ resumeId: "resume-1", rank: 1 });
  });

  it("summarizes a candidate fit without failing the search flow", async () => {
    const response = await request(app)
      .post("/v1/search/summarize")
      .send({
        query: "Senior QA architect with RAG and MCP",
        candidate: {
          resumeId: "resume-1",
          role: "QA Architect",
          snippet: "Built RAG and MCP automation systems with deep AI quality leadership.",
        },
        style: "short",
        maxTokens: 80,
      });

    expect(response.status).toBe(200);
    expect(response.body.resumeId).toBe("resume-1");
    expect(response.body.summary).toContain("Strong fit");
  });

  it("runs the final end-to-end search pipeline", async () => {
    const sharedObjectId = new ObjectId();
    mockedEmbeddingService.buildEmbeddingText.mockReturnValueOnce(
      "Senior QA architect with RAG and MCP"
    );
    mockedEmbeddingService.generateEmbedding.mockResolvedValueOnce({
      model: "mistral-embed",
      dimension: 1024,
      embedding: Array.from({ length: 1024 }, () => 0.11),
    });
    mockedRetrievalRepository.searchByBM25.mockResolvedValueOnce([
      {
        _id: sharedObjectId,
        fileName: "resume.pdf",
        name: "Sam Taylor",
        role: "Senior QA Architect",
        company: "Acme",
        skills: ["RAG", "MCP"],
        score: 6.5,
      },
    ] as any);
    mockedRetrievalRepository.searchByVector.mockResolvedValueOnce([
      {
        _id: sharedObjectId,
        fileName: "resume.pdf",
        name: "Sam Taylor",
        role: "Senior QA Architect",
        company: "Acme",
        skills: ["RAG", "MCP"],
        score: 0.87,
      },
    ] as any);

    const response = await request(app)
      .post("/v1/search")
      .send({
        query: "Senior QA architect with RAG and MCP",
        filters: { minYearsExperience: 8 },
        options: {
          bm25TopK: 5,
          vectorTopK: 5,
          rerankTopN: 5,
          finalTopK: 3,
          summarize: true,
          summaryStyle: "short",
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.query).toBe("Senior QA architect with RAG and MCP");
    expect(response.body.results).toHaveLength(1);
    expect(response.body.results[0]).toMatchObject({
      resumeId: expect.any(String),
      rank: 1,
      source: "bm25",
      sources: ["bm25", "vector"],
      scoresBySource: { bm25: 6.5, vector: 0.87 },
      summary: "Strong fit based on the supplied resume evidence.",
    });
    expect(response.body.pipeline).toMatchObject({
      retrieval: "completed",
      deduplication: "completed",
      exactDuplicatesRemoved: 1,
      reranking: "completed",
      summarization: "completed",
      llmProviders: ["groq"],
    });
    expect(response.body.timings).toMatchObject({
      totalMs: expect.any(Number),
      rerankMs: expect.any(Number),
      summarizeMs: expect.any(Number),
    });
  });

  it("preserves retrieved results and reports degraded LLM stages", async () => {
    mockedRetrievalRepository.searchByBM25.mockResolvedValueOnce([
      {
        _id: new ObjectId(),
        name: "Sam Taylor",
        role: "QA Architect",
        skills: ["RAG"],
        score: 6,
      },
      {
        _id: new ObjectId(),
        name: "Alex Morgan",
        role: "Test Engineer",
        skills: ["Playwright"],
        score: 5,
      },
    ] as any);
    jest.spyOn(llmService, "detectDuplicateGroups").mockRejectedValueOnce(
      new Error("provider unavailable"),
    );
    jest.spyOn(llmService, "rerankCandidates").mockRejectedValueOnce(
      new Error("provider unavailable"),
    );
    jest.spyOn(llmService, "summarizeCandidateFitWithMetadata").mockRejectedValueOnce(
      new Error("provider unavailable"),
    );

    const response = await request(app).post("/v1/search").send({
      query: "QA architect",
      mode: "bm25",
      options: { summarize: true },
    });

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(2);
    expect(response.body.results[0]).toMatchObject({
      summaryStatus: "failed",
      rerankReason: expect.stringContaining("retrieval order"),
    });
    expect(response.body).toMatchObject({
      degraded: true,
      pipeline: {
        retrieval: "completed",
        deduplication: "degraded",
        reranking: "degraded",
        summarization: "degraded",
      },
    });
    expect(response.body.warnings).toHaveLength(3);
  });

  it("retains separate candidates when retrieval records have no stable IDs", async () => {
    mockedRetrievalRepository.searchByBM25.mockResolvedValueOnce([
      { name: "Candidate One", role: "Engineer", score: 2 },
      { name: "Candidate Two", role: "Designer", score: 1 },
    ] as any);

    const response = await request(app)
      .post("/v1/search/bm25")
      .send({ query: "professional" });

    expect(response.status).toBe(200);
    expect(response.body.results).toHaveLength(2);
    expect(response.body.results[0].resumeId).not.toBe(
      response.body.results[1].resumeId,
    );
    expect(response.body.results[0].profileAvailable).toBe(false);
  });

  it("returns service health and echoes the request ID", async () => {
    const response = await request(app)
      .get("/v1/health")
      .set("X-Request-Id", "test-request-123");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("test-request-123");
    expect(response.body).toMatchObject({
      status: "ok",
      app: "resume-rag-backend",
      version: "1.0.0",
    });
    expect(response.body.uptime).toEqual(expect.any(Number));
  });

  it("reports database connectivity when the health check succeeds", async () => {
    mockedCheckDatabaseHealth.mockResolvedValueOnce({
      connected: true,
      latencyMs: 4,
    });

    const response = await request(app).get("/v1/health/db");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      database: "mongodb",
      connected: true,
      latencyMs: 4,
    });
  });

  it("returns service unavailable when the database health check fails", async () => {
    mockedCheckDatabaseHealth.mockResolvedValueOnce({
      connected: false,
      error: "connection refused",
    });

    const response = await request(app).get("/v1/health/db");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "error",
      database: "mongodb",
      connected: false,
      errorCode: "DB_CONNECTION_FAILED",
    });
  });

  it("serves ingestion-module health", async () => {
    const response = await request(app).get("/v1/resume/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      module: "resume-ingestion",
    });
  });

  it("cleans resume text and rejects a missing rawText value", async () => {
    const success = await request(app)
      .post("/v1/resume/clean")
      .send({ rawText: "  Playwright \r\n\r\n C#  " });

    expect(success.status).toBe(200);
    expect(success.body).toEqual({
      success: true,
      cleanText: "Playwright\nC#",
    });

    const invalid = await request(app).post("/v1/resume/clean").send({});

    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({
      success: false,
      errorCode: "RAW_TEXT_REQUIRED",
      message: "rawText field is required",
    });
  });

  it("detects skills and rejects a non-string rawText value", async () => {
    const success = await request(app)
      .post("/v1/resume/skills")
      .send({ rawText: "JavaScript, Java, Selenium, C++" });

    expect(success.status).toBe(200);
    expect(success.body).toEqual({
      success: true,
      skills: ["Java", "Selenium"],
    });

    const invalid = await request(app)
      .post("/v1/resume/skills")
      .send({ rawText: 123 });

    expect(invalid.status).toBe(400);
    expect(invalid.body.errorCode).toBe("RAW_TEXT_REQUIRED");
  });

  it("parses a resume using the deterministic parser", async () => {
    const response = await request(app)
      .post("/v1/resume/parse")
      .send({ rawText: "Name: Sam Taylor\nRole: Test Architect\nSkills: Playwright" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      resume: {
        name: "Sam Taylor",
        role: "Test Architect",
        skills: ["Playwright"],
      },
    });
  });

  it("extracts text from an uploaded PDF", async () => {
    mockedResumeParserService.extractTextFromPdf.mockResolvedValueOnce(
      "Extracted resume text"
    );

    const response = await request(app)
      .post("/v1/resume/extract")
      .attach("file", Buffer.from("%PDF-1.4"), {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      rawText: "Extracted resume text",
      characters: 21,
    });
    expect(mockedResumeParserService.extractTextFromPdf).toHaveBeenCalledTimes(1);
  });

  it("runs the optional LLM parser", async () => {
    mockedLlmResumeParser.parseResume.mockResolvedValueOnce({
      name: "Sam Taylor",
      skills: ["Playwright"],
    });

    const response = await request(app)
      .post("/v1/resume/llm-parse")
      .send({ rawText: "Sam Taylor, Playwright" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      resume: {
        name: "Sam Taylor",
        skills: ["Playwright"],
      },
    });
  });

  it("builds and returns an embedding", async () => {
    mockedEmbeddingService.buildEmbeddingText.mockReturnValueOnce(
      "Sam Taylor Test Architect"
    );
    mockedEmbeddingService.generateEmbedding.mockResolvedValueOnce({
      model: "test-embedding-model",
      dimension: 3,
      embedding: [0.1, 0.2, 0.3],
    });

    const response = await request(app)
      .post("/v1/resume/embed")
      .send({ name: "Sam Taylor", role: "Test Architect" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      model: "test-embedding-model",
      dimension: 3,
      embedding: [0.1, 0.2, 0.3],
    });
    expect(mockedEmbeddingService.buildEmbeddingText).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Sam Taylor", role: "Test Architect" })
    );
  });

  it("stores a resume and returns its database ID", async () => {
    mockedResumeRepository.insertResume.mockResolvedValueOnce("resume-id-1");
    const embedding = Array.from({ length: 1024 }, () => 0.1);

    const response = await request(app)
      .post("/v1/resume/store")
      .send({
        fileName: "resume.pdf",
        rawText: "Sam Taylor resume",
        embedding,
        resume: {
          name: "Sam Taylor",
          skills: ["Playwright"],
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: "Resume stored successfully",
      resumeId: "resume-id-1",
    });
    expect(mockedResumeRepository.insertResume).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "resume.pdf",
        rawText: "Sam Taylor resume",
        name: "Sam Taylor",
        skills: ["Playwright"],
        embedding,
        embeddingDimension: 1024,
      })
    );
  });

  it("rejects stored embeddings that do not match the configured dimension", async () => {
    const response = await request(app)
      .post("/v1/resume/store")
      .send({
        fileName: "resume.pdf",
        rawText: "Sam Taylor resume",
        embedding: [0.1, 0.2],
      });

    expect(response.status).toBe(400);
    expect(response.body.errorCode).toBe("INVALID_EMBEDDING");
    expect(mockedResumeRepository.insertResume).not.toHaveBeenCalled();
  });

  it("returns not found when a resume ID is absent", async () => {
    mockedResumeRepository.findResumeById.mockResolvedValueOnce(null);

    const response = await request(app).get("/v1/resume/missing-id");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      errorCode: "RESUME_NOT_FOUND",
    });
  });

  it("creates a query embedding and returns Atlas vector-search results", async () => {
    const resumeId = new ObjectId();
    mockedEmbeddingService.buildEmbeddingText.mockReturnValueOnce(
      "Senior QA Engineer Playwright"
    );
    mockedEmbeddingService.generateEmbedding.mockResolvedValueOnce({
      model: "mistral-embed",
      dimension: 1024,
      embedding: Array.from({ length: 1024 }, () => 0.1),
    });
    mockedResumeRepository.searchSimilarResumes.mockResolvedValueOnce([
      {
        _id: resumeId,
        fileName: "resume.pdf",
        name: "Sam Taylor",
        skills: ["Playwright"],
        score: 0.92,
      },
    ]);

    const response = await request(app)
      .post("/v1/resume/search")
      .send({ query: "Senior QA Engineer with Playwright" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      query: "Senior QA Engineer with Playwright",
      results: [
        {
          _id: resumeId.toString(),
          fileName: "resume.pdf",
          name: "Sam Taylor",
          skills: ["Playwright"],
          score: 0.92,
        },
      ],
    });
    expect(mockedEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
      "Senior QA Engineer Playwright"
    );
    expect(mockedResumeRepository.searchSimilarResumes).toHaveBeenCalledWith(
      Array.from({ length: 1024 }, () => 0.1),
      10
    );
  });

  it("validates semantic search query and limit inputs", async () => {
    const missingQuery = await request(app)
      .post("/v1/resume/search")
      .send({ query: "  " });
    const invalidLimit = await request(app)
      .post("/v1/resume/search")
      .send({ query: "Playwright", limit: 51 });

    expect(missingQuery.status).toBe(400);
    expect(missingQuery.body.errorCode).toBe("QUERY_REQUIRED");
    expect(invalidLimit.status).toBe(400);
    expect(invalidLimit.body.errorCode).toBe("INVALID_LIMIT");
    expect(mockedEmbeddingService.generateEmbedding).not.toHaveBeenCalled();
  });

  it("accepts a PDF on the upload-only endpoint", async () => {
    const response = await request(app)
      .post("/v1/resume/upload")
      .attach("file", Buffer.from("%PDF-1.4"), {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: "Resume uploaded successfully",
      file: {
        originalName: "resume.pdf",
        mimeType: "application/pdf",
      },
    });
    expect(response.body.file.size).toBeGreaterThan(0);
  });

  it("passes an uploaded PDF and request ID to the ingestion pipeline", async () => {
    const previousUseLlmParser = ENV.USE_LLM_PARSER;
    ENV.USE_LLM_PARSER = false;
    const embedding = Array.from({ length: 1024 }, (_, index) => index / 1024);
    const timings = {
      extractMs: expect.any(Number),
      cleanMs: expect.any(Number),
      parseMs: expect.any(Number),
      embeddingMs: expect.any(Number),
      mongoInsertMs: expect.any(Number),
      totalMs: expect.any(Number),
    };
    mockedResumeParserService.extractTextFromPdf.mockResolvedValueOnce(
      [
        "Name: Sam Taylor",
        "Role: Test Architect",
        "Company: Acme Technologies",
        "Experience: 12 years",
        "Skills: Playwright, Java",
      ].join("\n")
    );
    mockedEmbeddingService.buildEmbeddingText.mockReturnValueOnce(
      "Sam Taylor Test Architect Playwright Java"
    );
    mockedEmbeddingService.generateEmbedding.mockResolvedValueOnce({
      model: "test-embedding-model",
      dimension: embedding.length,
      embedding,
    });
    mockedResumeRepository.insertResume.mockResolvedValueOnce("resume-id-2");

    try {
      const response = await request(app)
        .post("/v1/resume/inject")
        .set("X-Request-Id", "ingestion-request-1")
        .attach("file", Buffer.from("%PDF-1.4"), {
          filename: "resume.pdf",
          contentType: "application/pdf",
        });

      expect(response.status).toBe(200);
      expect(response.headers["x-request-id"]).toBe("ingestion-request-1");
      expect(response.body).toEqual({
        success: true,
        message: "Resume ingestion completed",
        resumeId: "resume-id-2",
        data: {
          name: "Sam Taylor",
          role: "Test Architect",
          company: "Acme Technologies",
          totalExperience: 12,
          skillsCount: 2,
          embeddingModel: "test-embedding-model",
          embeddingDimension: 1024,
        },
        timings,
      });
      expect(mockedResumeParserService.extractTextFromPdf).toHaveBeenCalledTimes(1);
      expect(mockedEmbeddingService.generateEmbedding).toHaveBeenCalledWith(
        expect.stringContaining("Sam Taylor")
      );
      expect(mockedResumeRepository.insertResume).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: "resume.pdf",
          name: "Sam Taylor",
          role: "Test Architect",
          company: "Acme Technologies",
          totalExperience: 12,
          education: null,
          skills: ["Java", "Playwright"],
          embedding,
          embeddingModel: "test-embedding-model",
          embeddingDimension: 1024,
          rawText: expect.stringContaining("Name: Sam Taylor"),
        })
      );
    } finally {
      ENV.USE_LLM_PARSER = previousUseLlmParser;
    }
  });

  it.each([5, 10])(
    "ingests a batch of %i resumes with one stored document and valid embedding per file",
    async (batchSize) => {
      const embedding = Array.from({ length: 1024 }, () => 0.25);
      mockedResumeParserService.extractTextFromPdf.mockImplementation(
        async (filePath) => `Name: ${filePath}`
      );
      mockedEmbeddingService.buildEmbeddingText.mockReturnValue(
        "Resume embedding text"
      );
      mockedEmbeddingService.generateEmbedding.mockResolvedValue({
        model: "mistral-embed",
        dimension: 1024,
        embedding,
      });
      mockedResumeRepository.insertResume.mockResolvedValue("stored-resume-id");

      let uploadRequest = request(app)
        .post("/v1/resume/inject/batch")
        .field("batchSize", String(batchSize));
      for (let index = 0; index < batchSize; index++) {
        uploadRequest = uploadRequest.attach(
          "files",
          Buffer.from("%PDF-1.4"),
          {
            filename: `resume-${index}.pdf`,
            contentType: "application/pdf",
          }
        );
      }

      const response = await uploadRequest;

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        batchSize,
        totalFiles: batchSize,
        succeeded: batchSize,
        failed: 0,
      });
      expect(response.body.results).toHaveLength(batchSize);
      expect(response.body.results.every((result: { success: boolean }) => result.success)).toBe(true);
      expect(mockedResumeParserService.extractTextFromPdf).toHaveBeenCalledTimes(
        batchSize
      );
      expect(mockedEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(
        batchSize
      );
      expect(mockedResumeRepository.insertResume).toHaveBeenCalledTimes(
        batchSize
      );
      for (const [document] of mockedResumeRepository.insertResume.mock.calls) {
        expect(document.embedding).toHaveLength(1024);
        expect(document.embedding.every(Number.isFinite)).toBe(true);
        expect(document.embeddingDimension).toBe(1024);
        expect(document.embeddingModel).toBe("mistral-embed");
      }
      for (const [filePath] of mockedResumeParserService.extractTextFromPdf.mock.calls) {
        expect(fs.existsSync(filePath)).toBe(false);
      }
    }
  );

  it("rejects unsupported batch sizes and cleans up uploaded files", async () => {
    const response = await request(app)
      .post("/v1/resume/inject/batch")
      .field("batchSize", "7")
      .attach("files", Buffer.from("%PDF-1.4"), {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
    expect(response.body.errorCode).toBe("INVALID_BATCH_SIZE");
    expect(mockedResumeParserService.extractTextFromPdf).not.toHaveBeenCalled();
  });

  it("rejects a batch with no uploaded files", async () => {
    const response = await request(app)
      .post("/v1/resume/inject/batch")
      .field("batchSize", "5");

    expect(response.status).toBe(400);
    expect(response.body.errorCode).toBe("FILES_REQUIRED");
  });

  it("rejects non-PDF files in a batch", async () => {
    const response = await request(app)
      .post("/v1/resume/inject/batch")
      .field("batchSize", "5")
      .attach("files", Buffer.from("%PDF-1.4"), {
        filename: "resume.pdf",
        contentType: "application/pdf",
      })
      .attach("files", Buffer.from("not a PDF"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(415);
    expect(response.body.errorCode).toBe("INVALID_FILE_TYPE");
    expect(mockedResumeParserService.extractTextFromPdf).not.toHaveBeenCalled();
  });

  it("rejects batches that exceed the selected size without processing files", async () => {
    let uploadRequest = request(app)
      .post("/v1/resume/inject/batch")
      .field("batchSize", "5");
    for (let index = 0; index < 6; index++) {
      uploadRequest = uploadRequest.attach("files", Buffer.from("%PDF-1.4"), {
        filename: `resume-${index}.pdf`,
        contentType: "application/pdf",
      });
    }

    const response = await uploadRequest;

    expect(response.status).toBe(400);
    expect(response.body.errorCode).toBe("BATCH_SIZE_EXCEEDED");
    expect(mockedResumeParserService.extractTextFromPdf).not.toHaveBeenCalled();
  });

  it("returns a clear error when more than 10 files are uploaded", async () => {
    let uploadRequest = request(app)
      .post("/v1/resume/inject/batch")
      .field("batchSize", "10");
    for (let index = 0; index < 11; index++) {
      uploadRequest = uploadRequest.attach("files", Buffer.from("%PDF-1.4"), {
        filename: `resume-${index}.pdf`,
        contentType: "application/pdf",
      });
    }

    const response = await uploadRequest;

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      errorCode: "BATCH_SIZE_EXCEEDED",
      message: "A batch cannot contain more than 10 resume PDFs",
    });
    expect(mockedResumeParserService.extractTextFromPdf).not.toHaveBeenCalled();
  });

  it("continues after an individual resume failure and reports a partial result", async () => {
    const embedding = Array.from({ length: 1024 }, () => 0.5);
    mockedResumeParserService.extractTextFromPdf
      .mockResolvedValueOnce("Name: First Candidate")
      .mockRejectedValueOnce(new Error("PDF text extraction failed"))
      .mockResolvedValueOnce("Name: Third Candidate");
    mockedEmbeddingService.buildEmbeddingText.mockReturnValue(
      "Resume embedding text"
    );
    mockedEmbeddingService.generateEmbedding.mockResolvedValue({
      model: "mistral-embed",
      dimension: 1024,
      embedding,
    });
    mockedResumeRepository.insertResume
      .mockResolvedValueOnce("resume-1")
      .mockResolvedValueOnce("resume-3");

    const response = await request(app)
      .post("/v1/resume/inject/batch")
      .field("batchSize", "5")
      .attach("files", Buffer.from("%PDF-1.4"), {
        filename: "first.pdf",
        contentType: "application/pdf",
      })
      .attach("files", Buffer.from("%PDF-1.4"), {
        filename: "failed.pdf",
        contentType: "application/pdf",
      })
      .attach("files", Buffer.from("%PDF-1.4"), {
        filename: "third.pdf",
        contentType: "application/pdf",
      });

    expect(response.status).toBe(207);
    expect(response.body).toMatchObject({
      success: false,
      batchSize: 5,
      totalFiles: 3,
      succeeded: 2,
      failed: 1,
      results: [
        { fileName: "first.pdf", success: true, resumeId: "resume-1" },
        {
          fileName: "failed.pdf",
          success: false,
          errorCode: "RESUME_INGESTION_FAILED",
          message: "PDF text extraction failed",
        },
        { fileName: "third.pdf", success: true, resumeId: "resume-3" },
      ],
    });
    expect(mockedResumeParserService.extractTextFromPdf).toHaveBeenCalledTimes(3);
    expect(mockedEmbeddingService.generateEmbedding).toHaveBeenCalledTimes(2);
    expect(mockedResumeRepository.insertResume).toHaveBeenCalledTimes(2);
    for (const [document] of mockedResumeRepository.insertResume.mock.calls) {
      expect(document.embedding).toHaveLength(1024);
      expect(document.embedding.every(Number.isFinite)).toBe(true);
    }
    for (const [filePath] of mockedResumeParserService.extractTextFromPdf.mock.calls) {
      expect(fs.existsSync(filePath)).toBe(false);
    }
  });

  it("rejects an invalid file type on the upload endpoint", async () => {
    const response = await request(app)
      .post("/v1/resume/upload")
      .attach("file", Buffer.from("not a PDF"), {
        filename: "resume.txt",
        contentType: "text/plain",
      });

    expect(response.status).toBe(415);
    expect(response.body).toMatchObject({
      success: false,
      errorCode: "INVALID_FILE_TYPE",
      message: "Only PDF files are allowed",
    });
  });
});
