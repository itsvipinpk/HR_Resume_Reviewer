export interface MappedCandidate {
  resumeId: string;
  name?: string | null;
  role?: string | null;
  company?: string | null;
  score: number;
  source: "bm25" | "vector" | "hybrid";
  matchedSkills?: string[];
  [key: string]: unknown;
}

export function mapCandidate<T extends Record<string, unknown>>(
  item: T,
  source: MappedCandidate["source"] = "hybrid"
): MappedCandidate {
  return {
    resumeId: String((item.resumeId ?? item._id ?? "unknown") as unknown),
    name: (item.name as string | null | undefined) ?? null,
    role: (item.role as string | null | undefined) ?? null,
    company: (item.company as string | null | undefined) ?? null,
    score: Number((item.score as number | undefined) ?? 0),
    source,
    matchedSkills: Array.isArray(item.matchedSkills)
      ? (item.matchedSkills as string[])
      : [],
    ...item,
  };
}
