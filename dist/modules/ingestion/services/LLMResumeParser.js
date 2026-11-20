"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmResumeParser = exports.LLMResumeParser = void 0;
const env_1 = require("../../../config/env");
const errorHandler_1 = require("../../../middleware/errorHandler");
class LLMResumeParser {
    async parseResume(rawText) {
        if (!env_1.ENV.USE_LLM_PARSER) {
            throw new errorHandler_1.AppError(400, "LLM_PARSER_DISABLED", "LLM resume parser is disabled");
        }
        if (!env_1.ENV.GROQ_API_KEY) {
            throw new errorHandler_1.AppError(500, "LLM_CONFIG_ERROR", "GROQ_API_KEY is not configured");
        }
        try {
            const systemPrompt = `You are an expert HR resume parser. Extract structured information from the provided resume text into valid JSON matching this schema:
{
  "name": string or null,
  "email": string or null,
  "phone": string or null,
  "location": string or null,
  "company": string or null,
  "role": string or null,
  "education": string or null,
  "totalExperience": number or null,
  "skills": string[],
  "jobTitles": string[],
  "experienceSummary": string or null
}
Return ONLY valid JSON. Do not include markdown code fences or explanatory text.`;
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env_1.ENV.GROQ_API_KEY}`,
                },
                body: JSON.stringify({
                    model: env_1.ENV.GROQ_MODEL,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: rawText },
                    ],
                    temperature: 0.1,
                    response_format: { type: "json_object" },
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Groq API error (${response.status}): ${errorText}`);
            }
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error("No response received from Groq LLM");
            }
            const parsed = JSON.parse(content);
            if (!Array.isArray(parsed.skills)) {
                parsed.skills = [];
            }
            return parsed;
        }
        catch (error) {
            if (error instanceof errorHandler_1.AppError) {
                throw error;
            }
            throw new errorHandler_1.AppError(422, "RESUME_PARSE_FAILED", `LLM resume parsing failed: ${error.message}`);
        }
    }
}
exports.LLMResumeParser = LLMResumeParser;
exports.llmResumeParser = new LLMResumeParser();
