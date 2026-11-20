"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractYearsOfExperience = exports.extractPhone = exports.extractEmail = exports.EXPERIENCE_REGEX = exports.PHONE_REGEX = exports.EMAIL_REGEX = void 0;
exports.EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i;
exports.PHONE_REGEX = /(?:(?:\+91[\-\s]?)?[6-9]\d{9}|(?:\+?1[\-\s]?)?\(?\d{3}\)?[\-\s]?\d{3}[\-\s]?\d{4})/;
exports.EXPERIENCE_REGEX = /(?:(?:over|around|more than|\b))\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+(?:of\s+)?experience)?/i;
/**
 * Extracts the first valid email address found in the text.
 */
const extractEmail = (text) => {
    if (!text)
        return null;
    const match = text.match(exports.EMAIL_REGEX);
    return match ? match[0].trim() : null;
};
exports.extractEmail = extractEmail;
/**
 * Extracts the first valid phone number found in the text.
 */
const extractPhone = (text) => {
    if (!text)
        return null;
    const match = text.match(exports.PHONE_REGEX);
    return match ? match[0].trim() : null;
};
exports.extractPhone = extractPhone;
/**
 * Extracts total years of experience as a number from resume text.
 */
const extractYearsOfExperience = (text) => {
    if (!text)
        return null;
    const match = text.match(exports.EXPERIENCE_REGEX);
    if (match && match[1]) {
        const years = parseFloat(match[1]);
        return isNaN(years) ? null : Math.round(years * 10) / 10;
    }
    return null;
};
exports.extractYearsOfExperience = extractYearsOfExperience;
