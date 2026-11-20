export const SKILLS: string[] = [
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

export const EXTENDED_SKILLS: string[] = [
  "Selenium WebDriver",
  "Core Java",
  ...SKILLS,
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
export const detectSkills = (
  text: string,
  skillsList: string[] = SKILLS
): string[] => {
  if (!text || typeof text !== "string") {
    return [];
  }

  const detected: string[] = [];

  for (const skill of skillsList) {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Lookaround ensures skill is a standalone token even with symbols like C#, C++, .NET, or ()
    const regex = new RegExp(
      `(?<=^|[^a-zA-Z0-9_#+])${escaped}(?=[^a-zA-Z0-9_#+]|$)`,
      "i"
    );

    if (regex.test(text)) {
      detected.push(skill);
    }
  }

  return detected;
};
