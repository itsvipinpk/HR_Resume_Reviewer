jest.mock("../src/config/env", () => ({
  ENV: {
    LLM_PROVIDER: "groq",
    GROQ_API_KEY: "test-key",
    GROQ_MODEL: "test-model",
    OPENROUTER_API_KEY: "openrouter-test-key",
    OPENROUTER_MODEL: "openai/test-model",
    EMBEDDING_DIMENSION: 1024,
  },
}));

import { ENV } from "../src/config/env";
import {
  GroqClient,
  groqClient,
} from "../src/modules/retrieval/services/GroqClient";
import { OpenRouterClient, openRouterClient } from "../src/modules/retrieval/services/OpenRouterClient";
import { LLMService } from "../src/modules/retrieval/services/LLMService";

describe("GroqClient", () => {
  it("parses a successful completion without exposing provider data", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"summary":"grounded"}' } }],
      }),
    });
    const client = new GroqClient(request as typeof fetch);

    await expect(
      client.complete([{ role: "user", content: "test" }], 100),
    ).resolves.toBe('{"summary":"grounded"}');
  });

  it("classifies provider failures", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    const client = new GroqClient(request as typeof fetch);

    await expect(
      client.complete([{ role: "user", content: "test" }], 100),
    ).rejects.toMatchObject({ statusCode: 502, errorCode: "GROQ_UPSTREAM_ERROR" });
  });

  it("classifies retired or unavailable model responses", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: { code: "model_not_found", message: "requested model unavailable" },
      }),
    });
    const client = new GroqClient(request as typeof fetch);

    await expect(
      client.complete([{ role: "user", content: "test" }], 100),
    ).rejects.toMatchObject({
      statusCode: 502,
      errorCode: "GROQ_MODEL_UNAVAILABLE",
    });
  });

  it("classifies authentication failures without exposing provider response details", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "invalid secret token value" } }),
    });
    const client = new GroqClient(request as typeof fetch);

    await expect(
      client.complete([{ role: "user", content: "test" }], 100),
    ).rejects.toMatchObject({
      statusCode: 503,
      errorCode: "GROQ_AUTH_FAILED",
      message: "Groq rejected authentication. Verify the backend GROQ_API_KEY.",
    });
  });

  it("reports missing configuration without making a request", async () => {
    const originalKey = ENV.GROQ_API_KEY;
    Object.defineProperty(ENV, "GROQ_API_KEY", { value: "", configurable: true });
    const request = jest.fn();
    const client = new GroqClient(request as typeof fetch);

    await expect(
      client.complete([{ role: "user", content: "test" }], 100),
    ).rejects.toMatchObject({ statusCode: 503, errorCode: "GROQ_NOT_CONFIGURED" });
    expect(request).not.toHaveBeenCalled();
    Object.defineProperty(ENV, "GROQ_API_KEY", {
      value: originalKey,
      configurable: true,
    });
  });

  it("classifies timed out requests", async () => {
    const request = jest.fn(
      (_url: string | URL | Request, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const client = new GroqClient(request as typeof fetch, 1);

    await expect(
      client.complete([{ role: "user", content: "test" }], 100),
    ).rejects.toMatchObject({ statusCode: 504, errorCode: "GROQ_TIMEOUT" });
  });
});

describe("OpenRouterClient", () => {
  it("uses OpenRouter chat completions with the configured model and JSON mode", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"summary":"grounded"}' } }],
      }),
    });
    const client = new OpenRouterClient(request as typeof fetch);

    await expect(
      client.complete([{ role: "user", content: "test" }], 100),
    ).resolves.toBe('{"summary":"grounded"}');
    expect(request).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer openrouter-test-key",
          "Content-Type": "application/json",
        },
      }),
    );
    expect(request.mock.calls[0][1].body).toContain('"model":"openai/test-model"');
    expect(request.mock.calls[0][1].body).toContain('"max_tokens":100');
    expect(request.mock.calls[0][1].body).toContain('"response_format":{"type":"json_object"}');
  });

  it("requests strict JSON schema output from a supporting OpenRouter endpoint", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: [{ type: "text", text: '{"summary":"grounded"}' }] } },
          { message: { content: "ignored extra choice" } },
        ],
      }),
    });
    const client = new OpenRouterClient(request as typeof fetch);

    await expect(
      client.complete([{ role: "user", content: "test" }], 400, {
        name: "candidate_fit_summary",
        schema: {
          type: "object",
          properties: { summary: { type: "string" } },
          required: ["summary"],
          additionalProperties: false,
        },
      }),
    ).resolves.toBe('{"summary":"grounded"}');
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "candidate_fit_summary",
        strict: true,
      },
    });
    expect(body.provider).toEqual({ require_parameters: true });
  });

  it("reports output token truncation separately from malformed model output", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: '{"summary":' },
            finish_reason: "length",
          },
        ],
      }),
    });
    const client = new OpenRouterClient(request as typeof fetch);

    await expect(
      client.complete([{ role: "user", content: "test" }], 50),
    ).rejects.toMatchObject({
      statusCode: 502,
      errorCode: "OPENROUTER_OUTPUT_TRUNCATED",
    });
  });

  it("reports invalid OpenRouter authentication without exposing provider details", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "private token details" } }),
    });
    const client = new OpenRouterClient(request as typeof fetch);

    await expect(
      client.complete([{ role: "user", content: "test" }], 100),
    ).rejects.toMatchObject({
      statusCode: 503,
      errorCode: "OPENROUTER_AUTH_FAILED",
      message: "OpenRouter rejected authentication. Verify OPENROUTER_API_KEY.",
    });
  });
});

describe("Configured LLM provider", () => {
  it("uses OpenRouter exclusively when LLM_PROVIDER is set to openrouter", async () => {
    const previousProvider = ENV.LLM_PROVIDER;
    Object.defineProperty(ENV, "LLM_PROVIDER", {
      value: "openrouter",
      configurable: true,
    });
    const openRouterRequest = jest
      .spyOn(openRouterClient, "complete")
      .mockResolvedValue(
        JSON.stringify({
          ranked: [{ id: "candidate-1", reason: "Role matches." }],
        }),
      );
    const groqRequest = jest.spyOn(groqClient, "complete");

    try {
      const service = new LLMService();
      await expect(
        service.rerankCandidates({
          query: "QA architect",
          candidates: [{ resumeId: "resume-1", role: "QA Architect" }],
        }),
      ).resolves.toMatchObject({
        provider: "openrouter",
        model: ENV.OPENROUTER_MODEL,
      });
      expect(openRouterRequest).toHaveBeenCalledTimes(1);
      expect(openRouterRequest.mock.calls[0][2]).toMatchObject({
        name: "ranked_candidates",
        schema: { required: ["ranked"] },
      });
      expect(groqRequest).not.toHaveBeenCalled();
    } finally {
      openRouterRequest.mockRestore();
      groqRequest.mockRestore();
      Object.defineProperty(ENV, "LLM_PROVIDER", {
        value: previousProvider,
        configurable: true,
      });
    }
  });
});

describe("LLMService", () => {
  it("redacts direct identifiers and validates supplied IDs for reranking", async () => {
    const complete = jest.fn().mockResolvedValue(
      JSON.stringify({
        ranked: [
          { id: "candidate-2", reason: "Relevant architecture experience." },
          { id: "candidate-1", reason: "Some relevant testing experience." },
        ],
      }),
    );
    const service = new LLMService(complete);
    const candidates = [
      {
        resumeId: "resume-1",
        name: "Sam Taylor",
        rawText: "Sam Taylor email sam@example.com, phone 555-123-4567",
      },
      { resumeId: "resume-2", role: "QA Architect" },
    ];

    const result = await service.rerankCandidates({
      query: "QA architect",
      candidates,
      topN: 2,
    });

    const submitted = complete.mock.calls[0][0][1].content;
    expect(submitted).not.toContain("sam@example.com");
    expect(submitted).not.toContain("Sam Taylor");
    expect(submitted).not.toContain("555-123-4567");
    expect(result.results[0]).toMatchObject({
      resumeId: "resume-2",
      rank: 1,
      rerankReason: "Relevant architecture experience.",
    });
  });

  it("reports Groq as the provider with reranking results", async () => {
    const service = new LLMService(
      jest.fn().mockResolvedValue(
        JSON.stringify({
          ranked: [{ id: "candidate-1", reason: "Role matches." }],
        }),
      ),
    );

    await expect(
      service.rerankCandidates({
        query: "QA architect",
        candidates: [{ resumeId: "resume-1", role: "QA Architect" }],
      }),
    ).resolves.toMatchObject({
      provider: "groq",
      model: ENV.GROQ_MODEL,
      results: [{ resumeId: "resume-1" }],
    });
  });

  it("rejects model-generated IDs outside the candidate pool", async () => {
    const service = new LLMService(
      jest.fn().mockResolvedValue(
        JSON.stringify({
          ranked: [{ id: "invented-id", reason: "Looks relevant." }],
        }),
      ),
    );

    await expect(
      service.rerankCandidates({
        query: "QA",
        candidates: [{ resumeId: "resume-1" }],
      }),
    ).rejects.toMatchObject({ statusCode: 502, errorCode: "GROQ_INVALID_RESPONSE" });
  });

  it("rejects malformed summaries", async () => {
    const service = new LLMService(jest.fn().mockResolvedValue('{"summary":""}'));

    await expect(
      service.summarizeCandidateFit("QA", { resumeId: "resume-1" }),
    ).rejects.toMatchObject({ statusCode: 502, errorCode: "GROQ_INVALID_RESPONSE" });
  });

  it("accepts fenced JSON and reports provider-specific schema errors", async () => {
    const validService = new LLMService(
      jest.fn().mockResolvedValue({
        content: '```json\n{"summary":"Grounded summary."}\n```',
        provider: "openrouter",
        model: "openai/test-model",
      }),
    );
    await expect(
      validService.summarizeCandidateFit("QA", { resumeId: "resume-1" }),
    ).resolves.toBe("Grounded summary.");

    const service = new LLMService(
      jest.fn().mockResolvedValue({
        content: '{"summary":""}',
        provider: "openrouter",
        model: "openai/test-model",
      }),
    );

    await expect(
      service.summarizeCandidateFit("QA", { resumeId: "resume-1" }),
    ).rejects.toMatchObject({
      statusCode: 502,
      errorCode: "OPENROUTER_SCHEMA_MISMATCH",
    });
  });
});
