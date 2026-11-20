"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inceptionClient = exports.InceptionClient = void 0;
const env_1 = require("../../../config/env");
const errorHandler_1 = require("../../../middleware/errorHandler");
class InceptionClient {
    request;
    timeoutMs;
    constructor(request = fetch, timeoutMs = 20_000) {
        this.request = request;
        this.timeoutMs = timeoutMs;
    }
    async complete(messages, maxCompletionTokens) {
        if (!env_1.ENV.INCEPTION_API_KEY.trim()) {
            throw new errorHandler_1.AppError(503, "INCEPTION_NOT_CONFIGURED", "Inception is not configured");
        }
        if (!env_1.ENV.INCEPTION_MODEL.trim()) {
            throw new errorHandler_1.AppError(503, "INCEPTION_MODEL_NOT_CONFIGURED", "Inception model is not configured");
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.request("https://api.inceptionlabs.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: "Bearer " + env_1.ENV.INCEPTION_API_KEY,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: env_1.ENV.INCEPTION_MODEL,
                    messages,
                    temperature: 0.5,
                    max_completion_tokens: maxCompletionTokens,
                    response_format: { type: "json_object" },
                }),
                signal: controller.signal,
            });
            if (!response.ok) {
                const providerError = await readProviderError(response);
                const errorCode = classifyProviderError(response.status, providerError);
                const statusCode = response.status === 401 || response.status === 403 ? 503 : 502;
                throw new errorHandler_1.AppError(statusCode, errorCode, providerErrorMessage(errorCode));
            }
            const payload = await response.json();
            const content = extractMessageContent(payload);
            if (!content) {
                throw new errorHandler_1.AppError(502, "INCEPTION_INVALID_RESPONSE", "Inception returned an invalid response");
            }
            return content;
        }
        catch (error) {
            if (error instanceof errorHandler_1.AppError)
                throw error;
            if (controller.signal.aborted) {
                throw new errorHandler_1.AppError(504, "INCEPTION_TIMEOUT", "The Inception request timed out");
            }
            throw new errorHandler_1.AppError(502, "INCEPTION_UNAVAILABLE", "The Inception service is unavailable");
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.InceptionClient = InceptionClient;
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
        return "INCEPTION_AUTH_FAILED";
    if (status === 404 ||
        (status === 400 &&
            detail.includes("model") &&
            (detail.includes("not found") ||
                detail.includes("decommission") ||
                detail.includes("unavailable")))) {
        return "INCEPTION_MODEL_UNAVAILABLE";
    }
    if (status === 429)
        return "INCEPTION_RATE_LIMITED";
    if (status === 400)
        return "INCEPTION_BAD_REQUEST";
    if (status >= 500)
        return "INCEPTION_UPSTREAM_ERROR";
    return "INCEPTION_REQUEST_FAILED";
}
function providerErrorMessage(errorCode) {
    switch (errorCode) {
        case "INCEPTION_AUTH_FAILED":
            return "Inception rejected authentication. Verify the backend INCEPTION_API_KEY.";
        case "INCEPTION_MODEL_UNAVAILABLE":
            return "The configured Inception model is unavailable.";
        case "INCEPTION_RATE_LIMITED":
            return "Inception rate or token limit was reached.";
        case "INCEPTION_BAD_REQUEST":
            return "Inception rejected the request parameters.";
        case "INCEPTION_UPSTREAM_ERROR":
            return "Inception is temporarily unavailable.";
        default:
            return "The Inception request failed.";
    }
}
function extractMessageContent(payload) {
    if (!payload || typeof payload !== "object")
        return null;
    const choices = payload.choices;
    if (!Array.isArray(choices) || choices.length !== 1)
        return null;
    const message = choices[0]?.message;
    if (!message || typeof message !== "object")
        return null;
    const content = message.content;
    return typeof content === "string" && content.trim() ? content.trim() : null;
}
exports.inceptionClient = new InceptionClient();
