"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmService = exports.LLMService = void 0;
const env_1 = require("../../../config/env");
const errorHandler_1 = require("../../../middleware/errorHandler");
const GroqClient_1 = require("./GroqClient");
const OpenRouterClient_1 = require("./OpenRouterClient");
class LLMService {
    complete;
    constructor(complete = completeWithConfiguredProvider) {
        this.complete = complete;
    }
    async detectDuplicateGroups(candidates) {
        if (candidates.length < 2) {
            return {
                groups: [],
                uncertainGroupCount: 0,
                model: getConfiguredModel(),
                provider: getConfiguredProvider(),
            };
        }
        const records = candidates.slice(0, 50).map((candidate, index) => ({
            id: `candidate-${index + 1}`,
            candidate,
        }));
        const completion = await this.requestJson([
            {
                role: "system",
                content: "Identify only records that appear to be the same resume document/person. Similar roles, skills, or employers alone are not duplicates. If uncertain, return no group. Output only one valid JSON object, with no markdown or surrounding text, matching exactly {\"groups\":[{\"ids\":[\"candidate-1\",\"candidate-2\"],\"confidence\":0.99,\"reason\":\"brief evidence\"}]}. Always include groups, ids, confidence, and reason. Use only supplied IDs. Do not infer identity from missing data.",
            },
            {
                role: "user",
                content: JSON.stringify(records.map(({ id, candidate }) => ({
                    id,
                    profile: buildSafeProfile(candidate),
                }))),
            },
        ], 1200, duplicateGroupsSchema);
        const response = completion.data;
        if (!Array.isArray(response.groups)) {
            throw invalidModelResponse("Duplicate detection", completion.provider);
        }
        const submittedIds = new Set(records.map(({ id }) => id));
        const usedIds = new Set();
        let uncertainGroupCount = 0;
        const groups = [];
        for (const rawGroup of response.groups) {
            if (!isObject(rawGroup) || !Array.isArray(rawGroup.ids)) {
                throw invalidModelResponse("Duplicate detection", completion.provider);
            }
            const ids = rawGroup.ids;
            const confidence = rawGroup.confidence;
            const reason = rawGroup.reason;
            if (ids.length < 2 ||
                ids.some((id) => typeof id !== "string" || !submittedIds.has(id)) ||
                new Set(ids).size !== ids.length ||
                typeof confidence !== "number" ||
                confidence < 0 ||
                confidence > 1 ||
                typeof reason !== "string" ||
                reason.length > 300 ||
                ids.some((id) => usedIds.has(id))) {
                throw invalidModelResponse("Duplicate detection", completion.provider);
            }
            ids.forEach((id) => usedIds.add(id));
            if (confidence < 0.98) {
                uncertainGroupCount += 1;
                continue;
            }
            groups.push({ ids, confidence, reason });
        }
        return {
            groups,
            uncertainGroupCount,
            model: completion.model,
            provider: completion.provider,
        };
    }
    async rerankCandidates(request) {
        const topN = Math.min(request.candidates.length, Math.max(1, Math.min(50, Math.floor(request.topN ?? request.candidates.length))));
        const candidates = request.candidates.slice(0, topN);
        if (candidates.length === 0) {
            return {
                results: [],
                model: getConfiguredModel(),
                provider: getConfiguredProvider(),
            };
        }
        const records = candidates.map((candidate, index) => ({
            id: `candidate-${index + 1}`,
            candidate,
        }));
        const completion = await this.requestJson([
            {
                role: "system",
                content: "Rank candidate resumes for the recruiter query using only evidence in the supplied profiles. Output only one valid JSON object, with no markdown or surrounding text, matching exactly {\"ranked\":[{\"id\":\"candidate-1\",\"reason\":\"brief evidence\"}]}. Include every supplied ID exactly once, in relevance order. Do not invent qualifications, scores, or IDs. Reasons must be concise and evidence-based.",
            },
            {
                role: "user",
                content: JSON.stringify({
                    query: request.query.slice(0, 2000),
                    candidates: records.map(({ id, candidate }) => ({
                        id,
                        profile: buildSafeProfile(candidate),
                    })),
                }),
            },
        ], Math.min(2400, 300 + candidates.length * 100), rankedCandidatesSchema);
        const response = completion.data;
        if (!Array.isArray(response.ranked) || response.ranked.length !== candidates.length) {
            throw invalidModelResponse("Reranking", completion.provider);
        }
        const byOpaqueId = new Map(records.map((record) => [record.id, record.candidate]));
        const seen = new Set();
        const results = response.ranked.map((entry, index) => {
            if (!isObject(entry) ||
                typeof entry.id !== "string" ||
                !byOpaqueId.has(entry.id) ||
                seen.has(entry.id) ||
                typeof entry.reason !== "string" ||
                entry.reason.trim().length === 0 ||
                entry.reason.length > 500) {
                throw invalidModelResponse("Reranking", completion.provider);
            }
            seen.add(entry.id);
            return {
                ...byOpaqueId.get(entry.id),
                rank: index + 1,
                rerankReason: entry.reason.trim(),
            };
        });
        return { results, model: completion.model, provider: completion.provider };
    }
    async summarizeCandidateFit(query, candidate, options) {
        const result = await this.summarizeCandidateFitWithMetadata(query, candidate, options);
        return result.summary;
    }
    async summarizeCandidateFitWithMetadata(query, candidate, options) {
        const maxTokens = Math.max(50, Math.min(600, Math.floor(options?.maxTokens ?? 400)));
        const style = options?.style ?? "short";
        const completion = await this.requestJson([
            {
                role: "system",
                content: `Write a ${style} candidate-fit summary grounded only in supplied profile facts and the recruiter query. Do not infer missing qualifications, dates, skills, or experience. Output only one valid JSON object, with no markdown or surrounding text, matching exactly {"summary":"concise plain-text summary"}.`,
            },
            {
                role: "user",
                content: JSON.stringify({
                    query: query.slice(0, 2000),
                    profile: buildSafeProfile(candidate),
                }),
            },
        ], maxTokens, candidateSummarySchema);
        const response = completion.data;
        if (typeof response.summary !== "string" ||
            response.summary.trim().length === 0 ||
            response.summary.length > 2000) {
            throw invalidModelResponse("Summarization", completion.provider);
        }
        return {
            summary: response.summary.trim(),
            provider: completion.provider,
            model: completion.model,
        };
    }
    async extractMetadata(rawText) {
        return {
            length: rawText.length,
            preview: rawText.slice(0, 200),
        };
    }
    async requestJson(messages, maxTokens, jsonSchema) {
        const completion = await this.complete(messages, maxTokens, jsonSchema);
        const content = typeof completion === "string" ? completion : completion.content;
        const provider = typeof completion === "string" ? getConfiguredProvider() : completion.provider;
        const parsed = parseJsonObject(content);
        if (!parsed)
            throw invalidModelResponse("JSON parsing", provider, true);
        return typeof completion === "string"
            ? {
                data: parsed,
                provider: getConfiguredProvider(),
                model: getConfiguredModel(),
            }
            : {
                data: parsed,
                provider: completion.provider,
                model: completion.model,
            };
    }
}
exports.LLMService = LLMService;
async function completeWithConfiguredProvider(messages, maxTokens, jsonSchema) {
    const provider = getConfiguredProvider();
    if (provider === "groq") {
        return {
            content: await GroqClient_1.groqClient.complete(messages, maxTokens),
            provider,
            model: env_1.ENV.GROQ_MODEL,
        };
    }
    return {
        content: await OpenRouterClient_1.openRouterClient.complete(messages, maxTokens, jsonSchema),
        provider,
        model: env_1.ENV.OPENROUTER_MODEL,
    };
}
const duplicateGroupsSchema = {
    name: "duplicate_groups",
    schema: {
        type: "object",
        properties: {
            groups: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        ids: { type: "array", items: { type: "string" } },
                        confidence: { type: "number" },
                        reason: { type: "string" },
                    },
                    required: ["ids", "confidence", "reason"],
                    additionalProperties: false,
                },
            },
        },
        required: ["groups"],
        additionalProperties: false,
    },
};
const rankedCandidatesSchema = {
    name: "ranked_candidates",
    schema: {
        type: "object",
        properties: {
            ranked: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        reason: { type: "string" },
                    },
                    required: ["id", "reason"],
                    additionalProperties: false,
                },
            },
        },
        required: ["ranked"],
        additionalProperties: false,
    },
};
const candidateSummarySchema = {
    name: "candidate_fit_summary",
    schema: {
        type: "object",
        properties: { summary: { type: "string" } },
        required: ["summary"],
        additionalProperties: false,
    },
};
function getConfiguredProvider() {
    if (env_1.ENV.LLM_PROVIDER === "groq" || env_1.ENV.LLM_PROVIDER === "openrouter") {
        return env_1.ENV.LLM_PROVIDER;
    }
    throw new errorHandler_1.AppError(500, "INVALID_LLM_PROVIDER", "LLM_PROVIDER must be either groq or openrouter.");
}
function getConfiguredModel() {
    return getConfiguredProvider() === "openrouter"
        ? env_1.ENV.OPENROUTER_MODEL
        : env_1.ENV.GROQ_MODEL;
}
function buildSafeProfile(candidate) {
    const name = stringValue(candidate.name);
    const rawText = stringValue(candidate.rawText);
    const experienceSummary = stringValue(candidate.experienceSummary);
    const snippet = stringValue(candidate.snippet);
    const text = redactSensitiveText([rawText, experienceSummary, snippet].filter(Boolean).join("\n"), name).slice(0, 6000);
    return {
        role: redactSensitiveText(stringValue(candidate.role), name).slice(0, 200),
        company: redactSensitiveText(stringValue(candidate.company), name).slice(0, 200),
        skills: Array.isArray(candidate.skills)
            ? candidate.skills
                .filter((skill) => typeof skill === "string")
                .slice(0, 60)
            : [],
        jobTitles: Array.isArray(candidate.jobTitles)
            ? candidate.jobTitles
                .filter((title) => typeof title === "string")
                .slice(0, 30)
            : [],
        totalExperience: typeof candidate.totalExperience === "number" ? candidate.totalExperience : null,
        relevantExperience: typeof candidate.relevantExperience === "number"
            ? candidate.relevantExperience
            : null,
        text,
    };
}
function redactSensitiveText(value, name) {
    let text = value
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
        .replace(/(?:\+?\d[\d().\s-]{7,}\d)/g, "[REDACTED_PHONE]")
        .replace(/\b\d{1,6}\s+(?:[\w.-]+\s+){0,4}(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln)\b[^,\n]*/gi, "[REDACTED_ADDRESS]");
    if (name.trim().length >= 2) {
        const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        text = text.replace(new RegExp(escaped, "gi"), "[REDACTED_NAME]");
    }
    return text;
}
function stringValue(value) {
    return typeof value === "string" ? value : "";
}
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseJsonObject(content) {
    const trimmed = content.trim().replace(/^\uFEFF/, "");
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const candidates = fenced ? [fenced[1]] : [trimmed];
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (isObject(parsed))
                return parsed;
        }
        catch {
            continue;
        }
    }
    return null;
}
function invalidModelResponse(operation, provider, invalidJson = false) {
    return new errorHandler_1.AppError(502, provider === "openrouter"
        ? invalidJson
            ? "OPENROUTER_INVALID_JSON"
            : "OPENROUTER_SCHEMA_MISMATCH"
        : "GROQ_INVALID_RESPONSE", `${operation} returned an invalid language model response`);
}
exports.llmService = new LLMService();
