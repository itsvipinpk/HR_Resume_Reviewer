# Resume ingestion backend

Express and TypeScript API for extracting resume text from PDFs, parsing structured fields, generating one Mistral embedding per resume, and storing each resume as a single MongoDB document.

## Setup

1. Copy `.env.example` to `.env` and set `MONGODB_URI` and `MISTRAL_API_KEY`.
2. Ensure the MongoDB Atlas database is reachable and configure the vector search index described below.
3. Run `npm install`, then `npm run dev`. Use `npm test` and `npm run build` to validate changes.

Ingestion uses the fixed `mistral-embed` model and requires 1024-dimensional vectors. `USE_LLM_PARSER=false` uses deterministic regex and keyword parsing. The optional Groq parser is selected by setting `USE_LLM_PARSER=true` and configuring `GROQ_API_KEY`.

Retrieval reranking, duplicate detection, and optional candidate summaries support Groq or OpenRouter. Set backend `LLM_PROVIDER=groq` (default) or `LLM_PROVIDER=openrouter`, and configure the matching provider's API key and model (`GROQ_API_KEY` / `GROQ_MODEL` or `OPENROUTER_API_KEY` / `OPENROUTER_MODEL`). OpenRouter requests use strict JSON Schema output and only route to endpoints advertising structured-output support; check the selected model's supported parameters if requests are rejected. This setting affects retrieval LLM calls only; the optional ingestion parser remains Groq-based. Keep all provider credentials backend-only. If the selected provider is unavailable, search retains deterministic fallback results and reports the failed LLM stages.

## MongoDB Atlas vector index

Create a Vector Search index on the `resumes` collection. Its name must match `MONGODB_VECTOR_INDEX` (default: `resume_vector_index`) and its definition should include:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1024,
      "similarity": "cosine"
    }
  ]
}
```

The ingestion pipeline stores the full cleaned text and one 1024-dimensional embedding on each resume document; it does not chunk resumes. Atlas vector search returns structured resume fields and similarity scores, omitting raw text and embeddings from search results.

## API

- `POST /v1/resume/inject` — multipart form upload with a PDF in field `file`; extracts, parses, embeds, and stores the resume.
- `POST /v1/resume/inject/batch` — multipart form with `batchSize` set to `5` or `10` and one or more PDFs in repeated `files` fields. The upload count may be below the selected size but cannot exceed it. Each file is independently processed through the same single-resume pipeline. A fully successful batch returns HTTP `200`; a batch with per-file failures returns HTTP `207`.
- `GET /v1/search/readiness` — confirms the `resumes` collection has at least one ingested document with a valid non-empty embedding before retrieval begins.
- `POST /v1/embeddings` — accepts a recruiter query payload like `{ "model": "mistral-embed", "input": "senior agentic QA architect with RAG, DeepEval and MCP experience" }` and returns the generated query embedding.
- `POST /v1/search/bm25` — runs lexical BM25 retrieval over stored resume text and metadata.
- `POST /v1/search/vector` — generates an on-demand query embedding and searches the Atlas vector index using the stored `embedding` field.
- `POST /v1/resume/search` — JSON body `{ "query": "senior QA engineer", "limit": 10 }`; embeds the query and searches the Atlas vector index. `limit` is optional and must be between 1 and 50.
- `GET /v1/resume/:id` — retrieve a stored resume by MongoDB ID.
- `GET /v1/health` and `GET /v1/health/db` — service and database health checks.

Uploads are limited by `MAX_UPLOAD_SIZE_MB` (default 5 MB) and temporary files are removed after processing.

The batch endpoint responds with `success`, `batchSize`, `totalFiles`, `succeeded`, `failed`, and a `results` array. Each result includes `fileName` and `success`; successful items also include `resumeId`, parsed summary data, and timings, while failed items include `errorCode` and `message`. Failed files do not stop processing of the remaining files.
