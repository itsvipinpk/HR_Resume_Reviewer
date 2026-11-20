import { ENV } from "../../../config/env";
import { AppError } from "../../../middleware/errorHandler";

export interface GroqMessage {
  role: "system" | "user";
  content: string;
}

export class GroqClient {
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly timeoutMs = 20_000,
  ) {}

  async complete(messages: GroqMessage[], maxCompletionTokens: number): Promise<string> {
    if (!ENV.GROQ_API_KEY.trim()) {
      throw new AppError(503, "GROQ_NOT_CONFIGURED", "Groq is not configured");
    }
    if (!ENV.GROQ_MODEL.trim()) {
      throw new AppError(503, "GROQ_MODEL_NOT_CONFIGURED", "Groq model is not configured");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.request(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ENV.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: ENV.GROQ_MODEL,
            messages,
            temperature: 0,
            max_completion_tokens: maxCompletionTokens,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const providerError = await readProviderError(response);
        const errorCode = classifyProviderError(response.status, providerError);
        const statusCode =
          response.status === 429 ? 503 : response.status === 401 || response.status === 403 ? 503 : 502;
        throw new AppError(
          statusCode,
          errorCode,
          providerErrorMessage(errorCode),
        );
      }

      const payload: unknown = await response.json();
      const content = extractMessageContent(payload);
      if (!content) {
        throw new AppError(
          502,
          "GROQ_INVALID_RESPONSE",
          "The language model returned an invalid response",
        );
      }
      return content;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (controller.signal.aborted) {
        throw new AppError(504, "GROQ_TIMEOUT", "The language model request timed out");
      }
      throw new AppError(
        502,
        "GROQ_UNAVAILABLE",
        "The language model service is unavailable",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readProviderError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") return "";
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string") return error.slice(0, 500);
    if (!error || typeof error !== "object") return "";
    const details = error as { message?: unknown; code?: unknown; type?: unknown };
    return [details.code, details.type, details.message]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .slice(0, 500);
  } catch {
    return "";
  }
}

function classifyProviderError(status: number, providerError: string): string {
  const detail = providerError.toLowerCase();
  if (status === 401 || status === 403) return "GROQ_AUTH_FAILED";
  if (
    status === 404 ||
    (status === 400 &&
      (detail.includes("model") &&
        (detail.includes("not found") ||
          detail.includes("decommission") ||
          detail.includes("unavailable"))))
  ) {
    return "GROQ_MODEL_UNAVAILABLE";
  }
  if (status === 429) return "GROQ_RATE_LIMITED";
  if (status === 400) return "GROQ_BAD_REQUEST";
  if (status >= 500) return "GROQ_UPSTREAM_ERROR";
  return "GROQ_REQUEST_FAILED";
}

function providerErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case "GROQ_AUTH_FAILED":
      return "Groq rejected authentication. Verify the backend GROQ_API_KEY.";
    case "GROQ_MODEL_UNAVAILABLE":
      return "The configured Groq model is unavailable or retired. Set GROQ_MODEL to an active model.";
    case "GROQ_RATE_LIMITED":
      return "Groq rate or token limit was reached. Retry after the limit resets.";
    case "GROQ_BAD_REQUEST":
      return "Groq rejected the request. Check model support for the requested response format.";
    case "GROQ_UPSTREAM_ERROR":
      return "Groq is temporarily unavailable.";
    default:
      return "The Groq request failed.";
  }
}

function extractMessageContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length !== 1) return null;
  const message = (choices[0] as { message?: unknown })?.message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

export const groqClient = new GroqClient();
