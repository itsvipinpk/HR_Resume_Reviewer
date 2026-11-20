"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanText = void 0;
/**
 * Normalizes extracted text before parsing or embedding.
 * - Removes repeated whitespace and unwanted control characters.
 * - Normalizes line breaks and collapses blank lines.
 * - Preserves technical symbols (e.g. C#, C++, .NET, Node.js).
 */
const cleanText = (rawText) => {
    if (!rawText || typeof rawText !== "string") {
        return "";
    }
    return rawText
        // Remove unwanted control characters (excluding newline)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "")
        // Normalize Windows/Mac line endings to \n
        .replace(/\r\n|\r/g, "\n")
        // Replace multiple horizontal spaces/tabs with a single space
        .replace(/[^\S\n]+/g, " ")
        // Split into lines, trim each line, and remove empty blank lines
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n")
        .trim();
};
exports.cleanText = cleanText;
