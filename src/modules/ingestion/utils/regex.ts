export const EMAIL_REGEX =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i;

export const PHONE_REGEX =
  /(?:(?:\+91[\-\s]?)?[6-9]\d{9}|(?:\+?1[\-\s]?)?\(?\d{3}\)?[\-\s]?\d{3}[\-\s]?\d{4})/;

export const EXPERIENCE_REGEX =
  /(?:(?:over|around|more than|\b))\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+(?:of\s+)?experience)?/i;

/**
 * Extracts the first valid email address found in the text.
 */
export const extractEmail = (text: string): string | null => {
  if (!text) return null;
  const match = text.match(EMAIL_REGEX);
  return match ? match[0].trim() : null;
};

/**
 * Extracts the first valid phone number found in the text.
 */
export const extractPhone = (text: string): string | null => {
  if (!text) return null;
  const match = text.match(PHONE_REGEX);
  return match ? match[0].trim() : null;
};

/**
 * Extracts total years of experience as a number from resume text.
 */
export const extractYearsOfExperience = (text: string): number | null => {
  if (!text) return null;
  const match = text.match(EXPERIENCE_REGEX);
  if (match && match[1]) {
    const years = parseFloat(match[1]);
    return isNaN(years) ? null : Math.round(years * 10) / 10;
  }
  return null;
};
