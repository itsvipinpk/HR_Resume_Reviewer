import fs from "fs";
import { AppError } from "../../../middleware/errorHandler";

// Use require to load CommonJS export; pass options to avoid pdf-parse test-file loading
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");

const PDF_PARSE_OPTIONS = { version: "v1.10.100" };

export class ResumeParserService {
  async extractTextFromPdf(filePath: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      throw new AppError(400, "FILE_NOT_FOUND", "File to extract does not exist");
    }

    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer, PDF_PARSE_OPTIONS);
      const rawText = data.text ? data.text.trim() : "";

      if (!rawText) {
        throw new AppError(
          422,
          "RESUME_EXTRACTION_FAILED",
          "Resume text extraction returned empty content"
        );
      }

      return rawText;
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        422,
        "RESUME_EXTRACTION_FAILED",
        error.message || "Resume extraction failed"
      );
    }
  }
}

export const resumeParserService = new ResumeParserService();
