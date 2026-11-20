import { ObjectId } from "mongodb";

export interface ParsedResume {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  company?: string;
  role?: string;
  education?: string;
  totalExperience?: number;
  relevantExperience?: number;
  skills: string[];
  jobTitles?: string[];
  experienceSummary?: string;
}

export interface StoredResumeDocument {
  _id?: ObjectId;
  fileName: string;
  rawText: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  company?: string | null;
  role?: string | null;
  education?: string | null;
  totalExperience?: number | null;
  relevantExperience?: number | null;
  skills: string[];
  jobTitles?: string[];
  experienceSummary?: string | null;
  embedding: number[];
  embeddingModel: string;
  embeddingDimension: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResumeSearchResult {
  _id: ObjectId;
  fileName: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  company?: string | null;
  role?: string | null;
  education?: string | null;
  totalExperience?: number | null;
  relevantExperience?: number | null;
  skills: string[];
  jobTitles?: string[];
  experienceSummary?: string | null;
  score: number;
}

export interface IngestionTimings {
  extractMs: number;
  cleanMs: number;
  parseMs: number;
  embeddingMs: number;
  mongoInsertMs: number;
  totalMs: number;
}

export interface IngestionResult {
  resumeId: string;
  data: {
    name?: string;
    role?: string;
    company?: string;
    totalExperience?: number;
    skillsCount: number;
    embeddingModel: string;
    embeddingDimension: number;
  };
  timings: IngestionTimings;
}
