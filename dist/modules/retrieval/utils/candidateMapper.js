"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapCandidate = mapCandidate;
function mapCandidate(item, source = "hybrid") {
    return {
        resumeId: String((item.resumeId ?? item._id ?? "unknown")),
        name: item.name ?? null,
        role: item.role ?? null,
        company: item.company ?? null,
        score: Number(item.score ?? 0),
        source,
        matchedSkills: Array.isArray(item.matchedSkills)
            ? item.matchedSkills
            : [],
        ...item,
    };
}
