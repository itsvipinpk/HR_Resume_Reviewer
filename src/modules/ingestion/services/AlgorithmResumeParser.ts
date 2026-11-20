import { ParsedResume } from "../types/ingestion.types";
import {
  extractEmail,
  extractPhone,
  extractYearsOfExperience,
} from "../utils/regex";
import { detectSkills, EXTENDED_SKILLS } from "../../../config/skills";

export class AlgorithmResumeParser {
  parseResume(rawText: string): ParsedResume {
    if (!rawText || typeof rawText !== "string") {
      return { skills: [] };
    }

    const lines = rawText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const parsed: ParsedResume = {
      skills: this.extractSkills(rawText),
    };

    // 1. Contact Information
    const email = extractEmail(rawText);
    if (email) parsed.email = email;

    const phone = extractPhone(rawText);
    if (phone) parsed.phone = phone;

    // 2. Experience
    const experience = extractYearsOfExperience(rawText);
    if (experience !== null) parsed.totalExperience = experience;

    // 3. Name
    const name = this.extractName(lines);
    if (name) parsed.name = name;

    // 4. Role / Current Title
    const role = this.extractRole(lines, name);
    if (role) parsed.role = role;

    // 5. Company / Current Organization
    const company = this.extractCompany(lines, role);
    if (company) parsed.company = company;

    // 6. Education
    const education = this.extractEducation(rawText, lines);
    if (education) parsed.education = education;

    // 7. Experience Summary
    const summary = this.extractSummary(rawText, lines);
    if (summary) parsed.experienceSummary = summary;

    return parsed;
  }

  private extractName(lines: string[]): string | undefined {
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const line = lines[i];

      const labelMatch = line.match(
        /^(?:Name|Candidate Name)\s*[:\-]\s*(.+)$/i
      );
      if (labelMatch) {
        return labelMatch[1].trim();
      }

      if (
        !line.includes("@") &&
        !/\d/.test(line) &&
        !/resume|curriculum|vitae|profile|experience|skills|summary|page|contact/i.test(
          line
        )
      ) {
        const words = line.split(/\s+/);
        if (words.length >= 2 && words.length <= 5 && line.length < 50) {
          return line;
        }
      }
    }
    return undefined;
  }

  private extractRole(lines: string[], name?: string): string | undefined {
    const roleKeywords =
      /(?:Test Architect|Agentic Test Engineer|Lead Test Engineer|Senior QA|QA Lead|Software Engineer|Developer|Architect|Consultant|Analyst|Manager)/i;

    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      const line = lines[i];
      if (name && line === name) continue;

      const labelMatch = line.match(
        /^(?:Role|Designation|Title|Position)\s*[:\-]\s*(.+)$/i
      );
      if (labelMatch) {
        return labelMatch[1].trim();
      }

      if (roleKeywords.test(line) && !line.includes("@") && line.length < 90) {
        return line;
      }
    }
    return undefined;
  }

  private extractCompany(lines: string[], role?: string): string | undefined {
    const companyKeywords =
      /(?:Private Limited|Pvt\.?\s*Ltd\.?|Solutions|Technologies|Software|Inc\.?|Corp\.?|Corporation|LLC|LLP|Systems|Infotech)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (role && line === role) continue;

      const labelMatch = line.match(
        /^(?:Company|Organization|Current Company|Employer)\s*[:\-]\s*(.+)$/i
      );
      if (labelMatch) {
        return labelMatch[1].trim();
      }

      if (companyKeywords.test(line) && !line.includes("@") && line.length < 80) {
        return line.replace(/\s*\([^\)]*\)\s*$/, "").trim();
      }
    }
    return undefined;
  }

  private extractEducation(
    rawText: string,
    lines: string[]
  ): string | undefined {
    for (const line of lines) {
      const labelMatch = line.match(
        /^(?:Education|Qualification|Degree)\s*[:\-]\s*(.+)$/i
      );
      if (labelMatch) {
        return labelMatch[1].trim();
      }
    }

    const degreeRegex =
      /\b(?:B\.?Tech|M\.?Tech|B\.?E\.?|M\.?E\.?|BCA|MCA|B\.?Sc|M\.?Sc|Bachelor of [A-Za-z\s]+|Master of [A-Za-z\s]+)\b(?:\s*[-–:]\s*|\s+in\s+)[A-Za-z\s]+/i;
    const match = rawText.match(degreeRegex);
    if (match) {
      return match[0].trim();
    }

    return undefined;
  }

  private extractSkills(rawText: string): string[] {
    const detected = detectSkills(rawText, EXTENDED_SKILLS);

    // Filter out substrings if more specific skills are present
    const filtered: string[] = [];
    for (const skill of detected) {
      if (skill === "Selenium" && detected.includes("Selenium WebDriver")) {
        continue;
      }
      if (skill === "Java" && detected.includes("Core Java")) {
        continue;
      }
      filtered.push(skill);
    }
    return filtered;
  }

  private extractSummary(
    rawText: string,
    lines: string[]
  ): string | undefined {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(
        /^(?:Summary|Professional Summary|Profile Summary|Executive Summary)\s*[:\-]?\s*(.*)$/i
      );
      if (match) {
        if (match[1] && match[1].length > 15) {
          return match[1].trim();
        }
        if (i + 1 < lines.length && lines[i + 1].length > 15) {
          return lines[i + 1].trim();
        }
      }
    }
    return undefined;
  }
}

export const algorithmResumeParser = new AlgorithmResumeParser();
