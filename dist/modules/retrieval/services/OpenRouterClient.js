"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openRouterClient = exports.OpenRouterClient = void 0;
const env_1 = require("../../../config/env");
const errorHandler_1 = require("../../../middleware/errorHandler");
class OpenRouterClient {
    request;
    timeoutMs;
    constructor(request = fetch, timeoutMs = 20_000) {
        this.request = request;
        this.timeoutMs = timeoutMs;
    }
    async complete(messages, maxCompletionTokens, jsonSchema) {
        if (!env_1.ENV.OPENROUTER_API_KEY.trim()) {
            throw new errorHandler_1.AppError(503, "OPENROUTER_NOT_CONFIGURED", "OpenRouter is selected but OPENROUTER_API_KEY is not configured.");
        }
        if (!env_1.ENV.OPENROUTER_MODEL.trim()) {
            throw new errorHandler_1.AppError(503, "OPENROUTER_MODEL_NOT_CONFIGURED", "OpenRouter model is not configured.");
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.request("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: "Bearer " + env_1.ENV.OPENROUTER_API_KEY,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: env_1.ENV.OPENROUTER_MODEL,
                    messages,
                    temperature: 0,
                    max_tokens: maxCompletionTokens,
                    response_format: jsonSchema
                        ? {
                            type: "json_schema",
                            json_schema: {
                                name: jsonSchema.name,
                                strict: true,
                                schema: jsonSchema.schema,
                            },
                        }
                        : { type: "json_object" },
                    ...(jsonSchema ? { provider: { require_parameters: true } } : {}),
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                const providerError = await readProviderError(response);
                const errorCode = classifyProviderError(response.status, providerError);
                const statusCode = response.status === 401 || response.status === 403 || response.status === 429
                    ? 503
                    : 502;
                throw new errorHandler_1.AppError(statusCode, errorCode, providerErrorMessage(errorCode));
            }
            const payload = await response.json();
            const completion = extractMessageContent(payload);
            if (completion.finishReason === "length") {
                throw new errorHandler_1.AppError(502, "OPENROUTER_OUTPUT_TRUNCATED", "OpenRouter reached the output token limit before completing its response.");
            }
            if (!completion.content) {
                throw new errorHandler_1.AppError(502, "OPENROUTER_INVALID_RESPONSE", "OpenRouter returned an invalid response.");
            }
            return completion.content;
        }
        catch (error) {
            if (error instanceof errorHandler_1.AppError)
                throw error;
            if (controller.signal.aborted) {
                throw new errorHandler_1.AppError(504, "OPENROUTER_TIMEOUT", "The OpenRouter request timed out.");
            }
            throw new errorHandler_1.AppError(502, "OPENROUTER_UNAVAILABLE", "OpenRouter is unavailable.");
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.OpenRouterClient = OpenRouterClient;
async function readProviderError(response) {
    try {
        const body = await response.json();
        if (!body || typeof body !== "object")
            return "";
        const error = body.error;
        if (typeof error === "string")
            return error.slice(0, 500);
        if (!error || typeof error !== "object")
            return "";
        const details = error;
        return [details.code, details.type, details.message]
            .filter((value) => typeof value === "string")
            .join(" ")
            .slice(0, 500);
    }
    catch {
        return "";
    }
}
function classifyProviderError(status, providerError) {
    const detail = providerError.toLowerCase();
    if (status === 401 || status === 403)
        return "OPENROUTER_AUTH_FAILED";
    if (status === 404 ||
        (status === 400 &&
            detail.includes("model") &&
            (detail.includes("not found") || detail.includes("unavailable")))) {
        return "OPENROUTER_MODEL_UNAVAILABLE";
    }
    if (status === 429)
        return "OPENROUTER_RATE_LIMITED";
    if (status === 400)
        return "OPENROUTER_BAD_REQUEST";
    if (status >= 500)
        return "OPENROUTER_UPSTREAM_ERROR";
    return "OPENROUTER_REQUEST_FAILED";
}
function providerErrorMessage(errorCode) {
    switch (errorCode) {
        case "OPENROUTER_AUTH_FAILED":
            return "OpenRouter rejected authentication. Verify OPENROUTER_API_KEY.";
        case "OPENROUTER_MODEL_UNAVAILABLE":
            return "The configured OpenRouter model is unavailable. Verify OPENROUTER_MODEL.";
        case "OPENROUTER_RATE_LIMITED":
            return "OpenRouter rate limit or account quota was reached.";
        case "OPENROUTER_BAD_REQUEST":
            return "OpenRouter rejected the request. Confirm the selected model supports JSON mode.";
        case "OPENROUTER_UPSTREAM_ERROR":
            return "OpenRouter is temporarily unavailable.";
        default:
            return "The OpenRouter request failed.";
    }
}
function extractMessageContent(payload) {
    if (!payload || typeof payload !== "object") {
        return { content: null, finishReason: null };
    }
    const choices = payload.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
        return { content: null, finishReason: null };
    }
    const choice = choices[0];
    const finishReason = typeof choice.finish_reason === "string" ? choice.finish_reason : null;
    const message = choice.message;
    if (!message || typeof message !== "object") {
        return { content: null, finishReason };
    }
    const content = message.content;
    if (typeof content === "string") {
        return { content: content.trim() || null, finishReason };
    }
    if (Array.isArray(content)) {
        const text = content
            .map((part) => part && typeof part === "object" &&
            typeof part.text === "string"
            ? part.text
            : "")
            .filter(Boolean)
            .join("\n")
            .trim();
        return { content: text || null, finishReason };
    }
    return { content: null, finishReason };
}
exports.openRouterClient = new OpenRouterClient();
