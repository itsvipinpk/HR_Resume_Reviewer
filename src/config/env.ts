import dotenv from "dotenv";

dotenv.config();

export const ENV = {
  PORT: parseInt(process.env.PORT || "3000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGODB_URI: process.env.MONGODB_URI || "",
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || "resume_rag",
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || "",
  MISTRAL_EMBED_MODEL: "mistral-embed",
  EMBEDDING_DIMENSION: 1024,
  MONGODB_VECTOR_INDEX: process.env.MONGODB_VECTOR_INDEX || "resume_vector_index",
  USE_LLM_PARSER: process.env.USE_LLM_PARSER === "true",
  LLM_PROVIDER: (process.env.LLM_PROVIDER || "groq").trim().toLowerCase(),
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GROQ_MODEL: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b",
  MAX_UPLOAD_SIZE_MB: parseInt(process.env.MAX_UPLOAD_SIZE_MB || "5", 10),
};
