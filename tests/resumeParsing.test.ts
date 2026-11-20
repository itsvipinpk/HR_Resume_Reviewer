import { detectSkills } from "../src/config/skills";
import { AlgorithmResumeParser } from "../src/modules/ingestion/services/AlgorithmResumeParser";
import { extractEmail, extractPhone, extractYearsOfExperience } from "../src/modules/ingestion/utils/regex";
import { cleanText } from "../src/modules/ingestion/utils/textCleaner";

describe("resume text utilities", () => {
  describe("cleanText", () => {
    it("normalizes whitespace and line endings while preserving technical symbols", () => {
      expect(cleanText("  C#\tDeveloper\r\n\r\nC++  and .NET \u0001")).toBe(
        "C# Developer\nC++ and .NET"
      );
    });

    it("returns an empty string for empty input", () => {
      expect(cleanText("")).toBe("");
    });
  });

  describe("resume field extraction", () => {
    it("extracts email, phone, and decimal years of experience", () => {
      expect(extractEmail("Contact: RAJ@example.com")).toBe("RAJ@example.com");
      expect(extractPhone("Phone: +91 9876543210")).toBe("+91 9876543210");
      expect(extractYearsOfExperience("Over 12.5 years of experience")).toBe(12.5);
    });

    it("returns null when a field is not present", () => {
      expect(extractEmail("No contact details")).toBeNull();
      expect(extractPhone("No contact details")).toBeNull();
      expect(extractYearsOfExperience("Early-career engineer")).toBeNull();
    });
  });

  describe("detectSkills", () => {
    it("matches standalone skills including technical punctuation", () => {
      expect(detectSkills("JavaScript, Java, C++, .NET, and C#", ["Java", "C++", ".NET", "C#"])).toEqual([
        "Java",
        "C++",
        ".NET",
        "C#",
      ]);
    });

    it("does not detect partial word matches", () => {
      expect(detectSkills("JavaScript and Selenium2 tools", ["Java", "Selenium"])).toEqual([]);
    });
  });
});

describe("AlgorithmResumeParser", () => {
  const parser = new AlgorithmResumeParser();

  it("extracts structured resume fields deterministically", () => {
    const parsed = parser.parseResume(
      [
        "Name: Rajesh Mohan Kumar",
        "Role: Test Architect",
        "Company: Acme Technologies",
        "Email: rajesh@example.com",
        "Phone: +91 9876543210",
        "Experience: 12.5 years",
        "Education: M.Tech - Computer Science",
        "Summary: Senior test engineer focused on quality automation.",
        "Skills: Playwright, C#, and C++",
      ].join("\n")
    );

    expect(parsed).toMatchObject({
      name: "Rajesh Mohan Kumar",
      role: "Test Architect",
      company: "Acme Technologies",
      email: "rajesh@example.com",
      phone: "+91 9876543210",
      totalExperience: 12.5,
      education: "M.Tech - Computer Science",
      experienceSummary: "Senior test engineer focused on quality automation.",
      skills: ["Playwright", "C#", "C++"],
    });
  });

  it("returns an empty skill list for empty text", () => {
    expect(parser.parseResume("")).toEqual({ skills: [] });
  });

  it("does not mistake the letters in a name for a degree", () => {
    expect(
      parser.parseResume("Name: Sam Taylor\nRole: Test Architect")
    ).not.toHaveProperty("education");
  });
});
