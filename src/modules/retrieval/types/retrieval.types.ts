export interface RetrievalFilter {
  minYearsExperience?: number;
  [key: string]: unknown;
}

export interface RetrievalCandidate {
  resumeId: string;
  name?: string | null;
  role?: string | null;
  company?: string | null;
  score: number;
  source: "bm25" | "vector" | "hybrid";
  matchedSkills?: string[];
  [key: string]: unknown;
}

export interface HybridSearchSummary {
  bm25: RetrievalCandidate[];
  vector: RetrievalCandidate[];
  merged: RetrievalCandidate[];
}

export interface RetrievalReadinessPayload {
  ready: boolean;
  collection: string;
  resumeCount?: number;
  resumesWithEmbedding?: number;
  embeddingModel?: string;
  embeddingDimension?: number;
  reason?: string;
}
