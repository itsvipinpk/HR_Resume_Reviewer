"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.algorithmResumeParser = exports.AlgorithmResumeParser = void 0;
const regex_1 = require("../utils/regex");
const skills_1 = require("../../../config/skills");
class AlgorithmResumeParser {
    parseResume(rawText) {
        if (!rawText || typeof rawText !== "string") {
            return { skills: [] };
        }
        const lines = rawText
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
        const parsed = {
            skills: this.extractSkills(rawText),
        };
        // 1. Contact Information
        const email = (0, regex_1.extractEmail)(rawText);
        if (email)
            parsed.email = email;
        const phone = (0, regex_1.extractPhone)(rawText);
        if (phone)
            parsed.phone = phone;
        // 2. Experience
        const experience = (0, regex_1.extractYearsOfExperience)(rawText);
        if (experience !== null)
            parsed.totalExperience = experience;
        // 3. Name
        const name = this.extractName(lines);
        if (name)
            parsed.name = name;
        // 4. Role / Current Title
        const role = this.extractRole(lines, name);
        if (role)
            parsed.role = role;
        // 5. Company / Current Organization
        const company = this.extractCompany(lines, role);
        if (company)
            parsed.company = company;
        // 6. Education
        const education = this.extractEducation(rawText, lines);
        if (education)
            parsed.education = education;
        // 7. Experience Summary
        const summary = this.extractSummary(rawText, lines);
        if (summary)
            parsed.experienceSummary = summary;
        return parsed;
    }
    extractName(lines) {
        for (let i = 0; i < Math.min(lines.length, 5); i++) {
            const line = lines[i];
            const labelMatch = line.match(/^(?:Name|Candidate Name)\s*[:\-]\s*(.+)$/i);
            if (labelMatch) {
                return labelMatch[1].trim();
            }
            if (!line.includes("@") &&
                !/\d/.test(line) &&
                !/resume|curriculum|vitae|profile|experience|skills|summary|page|contact/i.test(line)) {
                const words = line.split(/\s+/);
                if (words.length >= 2 && words.length <= 5 && line.length < 50) {
                    return line;
                }
            }
        }
        return undefined;
    }
    extractRole(lines, name) {
        const roleKeywords = /(?:Test Architect|Agentic Test Engineer|Lead Test Engineer|Senior QA|QA Lead|Software Engineer|Developer|Architect|Consultant|Analyst|Manager)/i;
        for (let i = 0; i < Math.min(lines.length, 8); i++) {
            const line = lines[i];
            if (name && line === name)
                continue;
            const labelMatch = line.match(/^(?:Role|Designation|Title|Position)\s*[:\-]\s*(.+)$/i);
            if (labelMatch) {
                return labelMatch[1].trim();
            }
            if (roleKeywords.test(line) && !line.includes("@") && line.length < 90) {
                return line;
            }
        }
        return undefined;
    }
    extractCompany(lines, role) {
        const companyKeywords = /(?:Private Limited|Pvt\.?\s*Ltd\.?|Solutions|Technologies|Software|Inc\.?|Corp\.?|Corporation|LLC|LLP|Systems|Infotech)/i;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (role && line === role)
                continue;
            const labelMatch = line.match(/^(?:Company|Organization|Current Company|Employer)\s*[:\-]\s*(.+)$/i);
            if (labelMatch) {
                return labelMatch[1].trim();
            }
            if (companyKeywords.test(line) && !line.includes("@") && line.length < 80) {
                return line.replace(/\s*\([^\)]*\)\s*$/, "").trim();
            }
        }
        return undefined;
    }
    extractEducation(rawText, lines) {
        for (const line of lines) {
            const labelMatch = line.match(/^(?:Education|Qualification|Degree)\s*[:\-]\s*(.+)$/i);
            if (labelMatch) {
                return labelMatch[1].trim();
            }
        }
        const degreeRegex = /\b(?:B\.?Tech|M\.?Tech|B\.?E\.?|M\.?E\.?|BCA|MCA|B\.?Sc|M\.?Sc|Bachelor of [A-Za-z\s]+|Master of [A-Za-z\s]+)\b(?:\s*[-–:]\s*|\s+in\s+)[A-Za-z\s]+/i;
        const match = rawText.match(degreeRegex);
        if (match) {
            return match[0].trim();
        }
        return undefined;
    }
    extractSkills(rawText) {
        const detected = (0, skills_1.detectSkills)(rawText, skills_1.EXTENDED_SKILLS);
        // Filter out substrings if more specific skills are present
        const filtered = [];
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
    extractSummary(rawText, lines) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(/^(?:Summary|Professional Summary|Profile Summary|Executive Summary)\s*[:\-]?\s*(.*)$/i);
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
exports.AlgorithmResumeParser = AlgorithmResumeParser;
exports.algorithmResumeParser = new AlgorithmResumeParser();
