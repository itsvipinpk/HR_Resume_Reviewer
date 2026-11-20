"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchService = exports.SearchService = void 0;
const errorHandler_1 = require("../../../middleware/errorHandler");
const env_1 = require("../../../config/env");
const EmbeddingService_1 = require("../../ingestion/services/EmbeddingService");
const ResumeRepository_1 = require("../repositories/ResumeRepository");
const LLMService_1 = require("./LLMService");
const deduplicate_1 = require("../utils/deduplicate");
const candidateMapper_1 = require("../utils/candidateMapper");
const MAX_TOP_K = 50;
class SearchService {
    normalizeTopK(topK, fallback = 10) {
        const parsed = Number(topK ?? fallback);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TOP_K) {
            throw new errorHandler_1.AppError(400, "INVALID_TOP_K", `topK must be an integer between 1 and ${MAX_TOP_K}`);
        }
        return parsed;
    }
    validateQuery(query) {
        if (typeof query !== "string" || query.trim().length === 0) {
            throw new errorHandler_1.AppError(400, "INVALID_SEARCH_QUERY", "Search query is required");
        }
        if (query.length > 2000) {
            throw new errorHandler_1.AppError(400, "INVALID_SEARCH_QUERY", "Search query is too long");
        }
        return query.trim();
    }
    buildCandidateResult(item, source, index) {
        const rawId = item._id ?? item.resumeId;
        const hasStableId = rawId !== undefined && rawId !== null && String(rawId).trim().length > 0;
        return (0, candidateMapper_1.mapCandidate)({
            ...item,
            resumeId: hasStableId
                ? String(rawId)
                : `unidentified-${source}-${index + 1}`,
            profileAvailable: hasStableId,
            matchedSkills: item.skills ?? [],
            score: Number(item.score ?? 0),
            ranksBySource: { [source]: index + 1 },
        }, source);
    }
    async bm25Search(request) {
        const query = this.validateQuery(request.query);
        const topK = this.normalizeTopK(request.topK, 10);
        const matches = await ResumeRepository_1.resumeRepository.searchByBM25(query, topK, request.filters ?? {});
        const mapped = matches.map((item, index) => this.buildCandidateResult({ ...item }, "bm25", index));
        return (0, deduplicate_1.deduplicateCandidates)(mapped).slice(0, topK);
    }
    async vectorSearch(request, queryEmbedding) {
        if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
            throw new errorHandler_1.AppError(400, "INVALID_EMBEDDING", "queryEmbedding must be a non-empty numeric array");
        }
        const topK = this.normalizeTopK(request.topK, 10);
        const expectedDimension = env_1.ENV.EMBEDDING_DIMENSION || 1024;
        if (queryEmbedding.length !== expectedDimension) {
            throw new errorHandler_1.AppError(400, "INVALID_EMBEDDING_DIMENSION", `queryEmbedding must contain ${expectedDimension} numbers`);
        }
        const matches = await ResumeRepository_1.resumeRepository.searchByVector(queryEmbedding, topK);
        const mapped = matches.map((item, index) => this.buildCandidateResult({ ...item }, "vector", index));
        return (0, deduplicate_1.deduplicateCandidates)(mapped).slice(0, topK);
    }
    async hybridSearch(request, queryEmbedding) {
        const bm25Start = Date.now();
        const bm25Promise = this.bm25Search(request).then((results) => ({
            results,
            duration: Date.now() - bm25Start,
        }));
        const vectorStart = Date.now();
        const vectorPromise = this.vectorSearch(request, queryEmbedding).then((results) => ({
            results,
            duration: Date.now() - vectorStart,
        }));
        const [bm25Outcome, vectorOutcome] = await Promise.allSettled([
            bm25Promise,
            vectorPromise,
        ]);
        if (bm25Outcome.status === "rejected")
            throw bm25Outcome.reason;
        if (vectorOutcome.status === "rejected")
            throw vectorOutcome.reason;
        const bm25 = bm25Outcome.value.results;
        const vector = vectorOutcome.value.results;
        const merged = (0, deduplicate_1.deduplicateCandidates)(interleaveResults(bm25, vector));
        return {
            bm25,
            vector,
            merged,
            timings: {
                bm25Ms: bm25Outcome.value.duration,
                embeddingMs: 0,
                vectorMs: vectorOutcome.value.duration,
            },
        };
    }
    async endToEndSearch(query, filters = {}, options = {}) {
        const requestQuery = this.validateQuery(query);
        const mode = options.mode ?? "hybrid";
        const bm25TopK = this.normalizeTopK(options.bm25TopK ?? 20, 20);
        const vectorTopK = this.normalizeTopK(options.vectorTopK ?? 20, 20);
        const rerankTopN = this.normalizeTopK(options.rerankTopN ?? 10, 10);
        const finalTopK = this.normalizeTopK(options.finalTopK ?? 5, 5);
        const totalStart = Date.now();
        const warnings = [];
        const llmProviders = new Set();
        const timings = {
            embeddingMs: 0,
            bm25Ms: 0,
            vectorMs: 0,
            deduplicationMs: 0,
            rerankMs: 0,
            summarizeMs: 0,
            totalMs: 0,
        };
        const pipeline = {
            retrieval: "completed",
            deduplication: "skipped",
            reranking: "skipped",
            summarization: "skipped",
        };
        if (!["bm25", "vector", "hybrid"].includes(mode)) {
            throw new errorHandler_1.AppError(400, "INVALID_SEARCH_MODE", "Unsupported search mode");
        }
        let bm25 = [];
        let vector = [];
        const bm25Task = async () => {
            if (mode !== "bm25" && mode !== "hybrid")
                return;
            const start = Date.now();
            try {
                bm25 = await this.bm25Search({
                    query: requestQuery,
                    topK: bm25TopK,
                    filters,
                });
            }
            catch {
                warnings.push("BM25 retrieval failed.");
            }
            finally {
                timings.bm25Ms = Date.now() - start;
            }
        };
        const vectorTask = async () => {
            if (mode !== "vector" && mode !== "hybrid")
                return;
            const embeddingStart = Date.now();
            let embedding = null;
            try {
                const embeddingText = EmbeddingService_1.embeddingService.buildEmbeddingText({
                    rawText: requestQuery,
                });
                const result = await EmbeddingService_1.embeddingService.generateEmbedding(embeddingText);
                embedding = result.embedding;
            }
            catch {
                warnings.push("Query embedding generation failed.");
            }
            finally {
                timings.embeddingMs = Date.now() - embeddingStart;
            }
            if (!embedding) {
                warnings.push("Vector retrieval was skipped because no query embedding was available.");
                return;
            }
            const vectorStart = Date.now();
            try {
                vector = await this.vectorSearch({ query: requestQuery, topK: vectorTopK, filters }, embedding);
            }
            catch {
                warnings.push("Vector retrieval failed.");
            }
            finally {
                timings.vectorMs = Date.now() - vectorStart;
            }
        };
        await Promise.all([bm25Task(), vectorTask()]);
        if (warnings.length > 0)
            pipeline.retrieval = "degraded";
        let candidates = interleaveResults(bm25, vector);
        if (candidates.length === 0 && warnings.length > 0) {
            timings.totalMs = Date.now() - totalStart;
            return {
                query: requestQuery,
                mode,
                count: 0,
                results: [],
                degraded: true,
                warnings,
                pipeline,
                timings,
            };
        }
        const dedupeStart = Date.now();
        const exactDeduped = (0, deduplicate_1.deduplicateCandidates)(candidates);
        const exactDuplicatesRemoved = candidates.length - exactDeduped.length;
        candidates = exactDeduped;
        let llmDuplicatesRemoved = 0;
        let uncertainDuplicateGroups = 0;
        if (candidates.length > 1) {
            try {
                const duplicateResult = await LLMService_1.llmService.detectDuplicateGroups(candidates);
                if (duplicateResult.provider)
                    llmProviders.add(duplicateResult.provider);
                uncertainDuplicateGroups = duplicateResult.uncertainGroupCount;
                const result = applyConservativeDuplicateGroups(candidates, duplicateResult.groups);
                candidates = result.candidates;
                llmDuplicatesRemoved = result.removed;
                pipeline.deduplication = "completed";
            }
            catch (error) {
                pipeline.deduplication = "degraded";
                warnings.push(`LLM duplicate detection failed: ${describeFailure(error)} Exact-ID deduplication was retained.`);
            }
        }
        else {
            pipeline.deduplication = "completed";
        }
        if (uncertainDuplicateGroups > 0) {
            warnings.push(`${uncertainDuplicateGroups} uncertain duplicate group(s) were preserved.`);
        }
        timings.deduplicationMs = Date.now() - dedupeStart;
        const candidatePool = candidates.slice(0, rerankTopN);
        let ranked;
        if (candidatePool.length === 0) {
            ranked = [];
            pipeline.reranking = "skipped";
        }
        else {
            const rerankStart = Date.now();
            try {
                const reranked = await LLMService_1.llmService.rerankCandidates({
                    query: requestQuery,
                    candidates: candidatePool,
                    topN: candidatePool.length,
                });
                if (reranked.provider)
                    llmProviders.add(reranked.provider);
                ranked = reranked.results;
                pipeline.reranking = "completed";
            }
            catch (error) {
                ranked = orderByReciprocalRank(candidatePool).map((candidate, index) => ({
                    ...candidate,
                    rank: index + 1,
                    rerankReason: "Initial retrieval order; model reranking was unavailable.",
                }));
                pipeline.reranking = "degraded";
                warnings.push(`LLM reranking failed: ${describeFailure(error)} Deterministic retrieval order was used.`);
            }
            finally {
                timings.rerankMs = Date.now() - rerankStart;
            }
        }
        let finalResults = ranked.slice(0, finalTopK).map((result, index) => ({
            ...result,
            rank: index + 1,
        }));
        if (options.summarize && finalResults.length > 0) {
            const summarizeStart = Date.now();
            const summaries = await settleWithConcurrency(finalResults, 3, (result) => LLMService_1.llmService.summarizeCandidateFitWithMetadata(requestQuery, result, {
                style: options.summaryStyle ?? "short",
                maxTokens: options.maxTokens ?? 400,
            }));
            const summaryFailureCodes = new Map();
            finalResults = finalResults.map((result, index) => {
                const summary = summaries[index];
                if (summary.status === "fulfilled") {
                    llmProviders.add(summary.value.provider);
                    return {
                        ...result,
                        summary: summary.value.summary,
                        summaryStatus: "completed",
                        summaryProvider: summary.value.provider,
                        summaryModel: summary.value.model,
                    };
                }
                const code = getFailureCode(summary.reason);
                summaryFailureCodes.set(code, (summaryFailureCodes.get(code) ?? 0) + 1);
                return { ...result, summaryStatus: "failed", summaryErrorCode: code };
            });
            timings.summarizeMs = Date.now() - summarizeStart;
            const summaryFailures = [...summaryFailureCodes.values()].reduce((total, count) => total + count, 0);
            pipeline.summarization = summaryFailures > 0 ? "degraded" : "completed";
            if (summaryFailures > 0) {
                const causes = [...summaryFailureCodes]
                    .map(([code, count]) => `${count} ${code}: ${failureHint(code)}`)
                    .join(", ");
                warnings.push(`${summaryFailures} candidate summary operation(s) failed (${causes}).`);
            }
        }
        else if (options.summarize) {
            pipeline.summarization = "completed";
        }
        timings.totalMs = Date.now() - totalStart;
        const results = finalResults.map((candidate) => toPublicResult(candidate));
        const degraded = Object.values(pipeline).some((status) => status === "degraded") ||
            warnings.length > 0;
        return {
            query: requestQuery,
            mode,
            count: results.length,
            results,
            degraded,
            warnings,
            pipeline: {
                ...pipeline,
                exactDuplicatesRemoved,
                llmDuplicatesRemoved,
                llmProviders: [...llmProviders],
            },
            timings,
        };
    }
}
exports.SearchService = SearchService;
async function settleWithConcurrency(values, concurrency, operation) {
    const settled = new Array(values.length);
    for (let start = 0; start < values.length; start += concurrency) {
        const batch = values.slice(start, start + concurrency);
        const results = await Promise.all(batch.map(async (value) => {
            try {
                return { status: "fulfilled", value: await operation(value) };
            }
            catch (reason) {
                return { status: "rejected", reason };
            }
        }));
        results.forEach((result, index) => {
            settled[start + index] = result;
        });
    }
    return settled;
}
function interleaveResults(bm25, vector) {
    const interleaved = [];
    const maxLength = Math.max(bm25.length, vector.length);
    for (let index = 0; index < maxLength; index += 1) {
        if (bm25[index])
            interleaved.push(bm25[index]);
        if (vector[index])
            interleaved.push(vector[index]);
    }
    return interleaved;
}
function orderByReciprocalRank(candidates) {
    return candidates
        .map((candidate, index) => ({
        candidate,
        index,
        reciprocalRank: Object.values(candidate.ranksBySource && typeof candidate.ranksBySource === "object"
            ? candidate.ranksBySource
            : {}).reduce((sum, rank) => sum +
            (typeof rank === "number" && Number.isFinite(rank) && rank > 0
                ? 1 / (60 + rank)
                : 0), 0),
    }))
        .sort((left, right) => right.reciprocalRank - left.reciprocalRank || left.index - right.index)
        .map(({ candidate }) => candidate);
}
function applyConservativeDuplicateGroups(candidates, groups) {
    const byOpaqueId = new Map(candidates.map((candidate, index) => [`candidate-${index + 1}`, candidate]));
    const removedIds = new Set();
    const replacements = new Map();
    for (const group of groups) {
        if (group.confidence < 0.98)
            continue;
        const members = group.ids
            .map((id) => byOpaqueId.get(id))
            .filter((item) => Boolean(item));
        if (members.length !== group.ids.length || members.length < 2)
            continue;
        if (!hasStrongDuplicateEvidence(members))
            continue;
        const survivor = members[0];
        const sources = [...new Set(members.flatMap((item) => getSources(item)))];
        const skills = [
            ...new Set(members.flatMap((item) => Array.isArray(item.skills)
                ? item.skills.filter((skill) => typeof skill === "string")
                : [])),
        ];
        const duplicateResumeIds = members
            .slice(1)
            .map((item) => item.resumeId);
        replacements.set(survivor.resumeId, {
            ...survivor,
            sources,
            skills,
            duplicateResumeIds,
            duplicateReason: group.reason,
        });
        members.slice(1).forEach((item) => removedIds.add(item.resumeId));
    }
    return {
        candidates: candidates
            .filter((candidate) => !removedIds.has(candidate.resumeId))
            .map((candidate) => replacements.get(candidate.resumeId) ?? candidate),
        removed: removedIds.size,
    };
}
function hasStrongDuplicateEvidence(candidates) {
    const fingerprints = candidates
        .map((candidate) => normalizeResumeText(candidate))
        .filter((text) => text.length > 0);
    if (fingerprints.length !== candidates.length)
        return false;
    if (fingerprints.every((text) => text === fingerprints[0]))
        return true;
    const tokenSets = fingerprints.map((text) => new Set(text.split(/\s+/).filter((token) => token.length > 2)));
    if (tokenSets.some((tokens) => tokens.size < 12))
        return false;
    for (let left = 0; left < tokenSets.length; left += 1) {
        for (let right = left + 1; right < tokenSets.length; right += 1) {
            const common = [...tokenSets[left]].filter((token) => tokenSets[right].has(token)).length;
            const union = new Set([...tokenSets[left], ...tokenSets[right]]).size;
            if (union === 0 || common / union < 0.95)
                return false;
        }
    }
    return true;
}
function normalizeResumeText(candidate) {
    const rawText = typeof candidate.rawText === "string" ? candidate.rawText : "";
    const experience = typeof candidate.experienceSummary === "string"
        ? candidate.experienceSummary
        : "";
    const text = rawText || experience;
    return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function getSources(candidate) {
    const sources = Array.isArray(candidate.sources)
        ? candidate.sources.filter((source) => typeof source === "string")
        : [];
    if (candidate.source)
        sources.push(candidate.source);
    return [...new Set(sources)];
}
function getFailureCode(error) {
    if (error &&
        typeof error === "object" &&
        "errorCode" in error &&
        typeof error.errorCode === "string") {
        return error.errorCode;
    }
    return "LLM_OPERATION_FAILED";
}
function describeFailure(error) {
    const code = getFailureCode(error);
    return `${code}: ${failureHint(code)}.`;
}
function failureHint(code) {
    switch (code) {
        case "GROQ_NOT_CONFIGURED":
            return "configure GROQ_API_KEY in the backend environment";
        case "GROQ_MODEL_NOT_CONFIGURED":
        case "GROQ_MODEL_UNAVAILABLE":
            return "set GROQ_MODEL to an active Groq model";
        case "GROQ_AUTH_FAILED":
            return "verify the backend GROQ_API_KEY";
        case "GROQ_RATE_LIMITED":
            return "Groq rate or token limit reached; retry after it resets";
        case "GROQ_BAD_REQUEST":
            return "check model support for the requested JSON response format";
        case "GROQ_TIMEOUT":
            return "Groq did not respond before the request timeout";
        case "GROQ_INVALID_RESPONSE":
            return "the model response did not match the required output schema";
        case "OPENROUTER_NOT_CONFIGURED":
            return "configure OPENROUTER_API_KEY in the backend environment";
        case "OPENROUTER_MODEL_NOT_CONFIGURED":
        case "OPENROUTER_MODEL_UNAVAILABLE":
            return "set OPENROUTER_MODEL to an active OpenRouter model";
        case "OPENROUTER_AUTH_FAILED":
            return "verify the backend OPENROUTER_API_KEY";
        case "OPENROUTER_RATE_LIMITED":
            return "OpenRouter rate limit or account quota reached";
        case "OPENROUTER_BAD_REQUEST":
            return "confirm the selected OpenRouter model endpoint supports structured outputs";
        case "OPENROUTER_TIMEOUT":
            return "OpenRouter did not respond before the request timeout";
        case "OPENROUTER_OUTPUT_TRUNCATED":
            return "increase the output-token limit or use a model with lower reasoning-token overhead";
        case "OPENROUTER_INVALID_JSON":
            return "the model did not return valid JSON; verify the selected model supports JSON mode";
        case "OPENROUTER_SCHEMA_MISMATCH":
            return "the model returned JSON but omitted or changed required fields; verify its JSON instruction following";
        case "OPENROUTER_UNAVAILABLE":
        case "OPENROUTER_UPSTREAM_ERROR":
        case "OPENROUTER_REQUEST_FAILED":
            return "check OpenRouter availability and backend configuration";
        case "OPENROUTER_INVALID_RESPONSE":
            return "the model response did not match the required output schema";
        default:
            return "check the selected LLM provider and backend configuration";
    }
}
function toPublicResult(candidate) {
    const { rawText: _rawText, embedding: _embedding, rerankReason, ...publicCandidate } = candidate;
    return {
        ...publicCandidate,
        score: candidate.score,
        relevanceScore: candidate.relevanceScore ?? candidate.score,
        rerankReason,
        snippet: (typeof candidate.snippet === "string" && candidate.snippet) ||
            (typeof candidate.experienceSummary === "string" &&
                candidate.experienceSummary.slice(0, 600)) ||
            "",
    };
}
exports.searchService = new SearchService();
