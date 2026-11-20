type CandidateRecord = Record<string, unknown> & {
  resumeId?: string;
  _id?: unknown;
  source?: string;
  sources?: string[];
  score?: number;
};

export function deduplicateCandidates<T extends CandidateRecord>(items: T[]): T[] {
  const candidates = new Map<string, T>();

  for (const [index, item] of items.entries()) {
    const rawId = item.resumeId ?? item._id;
    const key =
      rawId === undefined || rawId === null || String(rawId).trim() === ""
        ? `unidentified:${index}`
        : String(rawId);
    const existing = candidates.get(key);
    if (!existing) {
      candidates.set(key, { ...item });
      continue;
    }

    const merged: Record<string, unknown> = { ...existing };
    for (const [field, value] of Object.entries(item)) {
      if (isEmpty(merged[field]) && !isEmpty(value)) {
        merged[field] = value;
      }
    }

    const sources = uniqueStrings([
      ...(Array.isArray(existing.sources) ? existing.sources : []),
      ...(existing.source ? [existing.source] : []),
      ...(Array.isArray(item.sources) ? item.sources : []),
      ...(item.source ? [item.source] : []),
    ]);
    if (sources.length > 0) merged.sources = sources;

    const scoresBySource: Record<string, number> = {
      ...asScoreMap(existing.scoresBySource),
      ...asScoreMap(item.scoresBySource),
    };
    if (existing.source && typeof existing.score === "number") {
      scoresBySource[existing.source] = existing.score;
    }
    if (item.source && typeof item.score === "number") {
      scoresBySource[item.source] = item.score;
    }
    if (Object.keys(scoresBySource).length > 0) {
      merged.scoresBySource = scoresBySource;
    }
    const ranksBySource = {
      ...asNumberMap(existing.ranksBySource),
      ...asNumberMap(item.ranksBySource),
    };
    if (Object.keys(ranksBySource).length > 0) {
      merged.ranksBySource = ranksBySource;
    }
    candidates.set(key, merged as T);
  }

  return [...candidates.values()];
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value))];
}

function asScoreMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
}

function asNumberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0,
    ),
  );
}
