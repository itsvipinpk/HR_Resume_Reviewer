"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectSkills = exports.EXTENDED_SKILLS = exports.SKILLS = void 0;
exports.SKILLS = [
    "Java",
    "Selenium",
    "Playwright",
    "API Testing",
    "Postman",
    "SQL",
    "MongoDB",
    "Jenkins",
    "Python",
    "C#",
    "REST Assured",
    "Cucumber",
    "GenAI",
    "Langchain",
    "Langgraph",
    "RAG",
    "Azure DevOps",
    "AWS Lambda",
    "GitHub",
    "DeepEval",
    "MCP (Model Context Protocol)",
];
exports.EXTENDED_SKILLS = [
    "Selenium WebDriver",
    "Core Java",
    ...exports.SKILLS,
    "TypeScript",
    "JavaScript",
    "C++",
    ".NET",
    "Docker",
    "Kubernetes",
    "TestNG",
    "JUnit",
    "CI/CD",
];
/**
 * Deterministically detects skills from the given text against a skill dictionary.
 */
const detectSkills = (text, skillsList = exports.SKILLS) => {
    if (!text || typeof text !== "string") {
        return [];
    }
    const detected = [];
    for (const skill of skillsList) {
        const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Lookaround ensures skill is a standalone token even with symbols like C#, C++, .NET, or ()
        const regex = new RegExp(`(?<=^|[^a-zA-Z0-9_#+])${escaped}(?=[^a-zA-Z0-9_#+]|$)`, "i");
        if (regex.test(text)) {
            detected.push(skill);
        }
    }
    return detected;
};
exports.detectSkills = detectSkills;
