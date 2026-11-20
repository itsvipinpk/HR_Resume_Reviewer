"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmProviderClient = exports.LLMProviderClient = void 0;
const env_1 = require("../../../config/env");
const errorHandler_1 = require("../../../middleware/errorHandler");
const GroqClient_1 = require("./GroqClient");
const InceptionClient_1 = require("./InceptionClient");
class LLMProviderClient {
    groq;
    inception;
    groqUnavailable = false;
    constructor(groq = GroqClient_1.groqClient, inception = InceptionClient_1.inceptionClient) {
        this.groq = groq;
        this.inception = inception;
    }
    async complete(messages, maxCompletionTokens) {
        if (!this.groqUnavailable && env_1.ENV.GROQ_API_KEY.trim()) {
            try {
                const content = await this.groq.complete(messages, maxCompletionTokens);
                return {
                    content,
                    provider: "groq",
                    model: env_1.ENV.GROQ_MODEL,
                };
            }
            catch (error) {
                if (isPermanentGroqFailure(error))
                    this.groqUnavailable = true;
                if (!env_1.ENV.INCEPTION_API_KEY.trim())
                    throw error;
                try {
                    const content = await this.inception.complete(messages, maxCompletionTokens);
                    return {
                        content,
                        provider: "inception",
                        model: env_1.ENV.INCEPTION_MODEL,
                    };
                }
                catch (fallbackError) {
                    throw bothProvidersFailed(error, fallbackError);
                }
            }
        }
        if (env_1.ENV.INCEPTION_API_KEY.trim()) {
            try {
                const content = await this.inception.complete(messages, maxCompletionTokens);
                return {
                    content,
                    provider: "inception",
                    model: env_1.ENV.INCEPTION_MODEL,
                };
            }
            catch (error) {
                throw error;
            }
        }
        if (!env_1.ENV.GROQ_API_KEY.trim()) {
            throw new errorHandler_1.AppError(503, "LLM_PROVIDERS_NOT_CONFIGURED", "Configure GROQ_API_KEY or INCEPTION_API_KEY in the backend environment.");
        }
        throw new errorHandler_1.AppError(503, "GROQ_UNAVAILABLE", "Groq is unavailable and no Inception fallback is configured.");
    }
}
exports.LLMProviderClient = LLMProviderClient;
function isPermanentGroqFailure(error) {
    const code = getErrorCode(error);
    return [
        "GROQ_NOT_CONFIGURED",
        "GROQ_MODEL_NOT_CONFIGURED",
        "GROQ_AUTH_FAILED",
        "GROQ_MODEL_UNAVAILABLE",
    ].includes(code);
}
function getErrorCode(error) {
    if (error &&
        typeof error === "object" &&
        "errorCode" in error &&
        typeof error.errorCode === "string") {
        return error.errorCode;
    }
    return "GROQ_REQUEST_FAILED";
}
function bothProvidersFailed(primary, fallback) {
    const primaryCode = getErrorCode(primary);
    const fallbackCode = getErrorCode(fallback);
    const statusCode = fallback instanceof errorHandler_1.AppError ? fallback.statusCode : 502;
    return new errorHandler_1.AppError(statusCode, "LLM_PROVIDERS_FAILED", `Groq and Inception fallback both failed (${primaryCode}, ${fallbackCode}).`);
}
exports.llmProviderClient = new LLMProviderClient();
