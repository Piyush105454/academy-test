/**
 * Utility functions for robust topic matching between curriculum and sessions.
 * Solves discrepancies like:
 * - Leading zeros: "01.04 Application of AI" vs "1.4 Application of AI"
 * - Formatting: "1.4 - Application of AI" vs "1.4. Application of AI"
 * - Class name variations: "WESa 8" vs "WESa8"
 * - Session type defaults: missing/capitalized session_type_option defaulted to fresh
 */

/**
 * Normalizes a topic string for robust matching.
 * Converts "01.04 Application of AI" -> "1.4 application of ai"
 * and "1.4 Application of AI" -> "1.4 application of ai"
 */
export function normalizeTopicKey(text?: string | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    // Normalize dotted numbers with leading zeros (e.g. 01.04 -> 1.4, 01.02.03 -> 1.2.3, 10.01 -> 10.1)
    .replace(/\b(?:\d+\.)+\d+\b/g, (match) => {
      return match
        .split('.')
        .map((part) => (isNaN(Number(part)) ? part : parseInt(part, 10).toString()))
        .join('.');
    })
    // Normalize single standalone numbers with leading zeros (e.g. "01 " -> "1 ")
    .replace(/\b0+(\d+)\b/g, '$1')
    // Remove punctuation right after topic numbering like "1.4.", "1.4 -", "1.4:"
    .replace(/^(\d+(?:\.\d+)*)[\s.:\-_]+/g, '$1 ')
    // Collapse multiple whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts the core title text of a topic by stripping leading module/topic number prefixes.
 * e.g. "01.04 Application of AI" -> "application of ai"
 * e.g. "1.4 Application of AI" -> "application of ai"
 * e.g. "Module 1: 1.4 Application of AI" -> "application of ai"
 */
export function extractCoreTopic(text?: string | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    // Remove leading Module prefix if present
    .replace(/^module\s*\d+[\s.:\-_]*/i, '')
    // Remove leading numbering like "01.04", "1.4.", "1.", etc.
    .replace(/^\s*(?:\d+(?:\.\d+)*)[\s.:\-_]*/i, '')
    // Remove leading and trailing punctuation
    .replace(/^[\s.:\-_]+|[\s.:\-_]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether two topic strings refer to the same topic.
 */
export function isTopicMatch(topicA?: string | null, topicB?: string | null): boolean {
  if (!topicA || !topicB) return false;
  if (topicA === topicB) return true;
  const aTrim = topicA.trim().toLowerCase();
  const bTrim = topicB.trim().toLowerCase();
  if (aTrim === bTrim) return true;

  const aNorm = normalizeTopicKey(topicA);
  const bNorm = normalizeTopicKey(topicB);
  if (aNorm && bNorm && aNorm === bNorm) return true;

  const aCore = extractCoreTopic(topicA);
  const bCore = extractCoreTopic(topicB);
  if (aCore && bCore && aCore.length >= 4 && aCore === bCore) return true;

  return false;
}

/**
 * Checks whether a class name matches another, ignoring spaces and non-alphanumerics.
 * e.g. "WESa 8" matches "WESa8" or "WESa-8"
 */
export function isClassMatch(classA?: string | null, classB?: string | null): boolean {
  if (!classA || !classB) return false;
  if (classA === classB) return true;
  const cleanA = classA.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const cleanB = classB.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return cleanA === cleanB || classA.trim().toLowerCase() === classB.trim().toLowerCase();
}

/**
 * Checks whether a session should be classified as a revision session.
 * Default is fresh unless session_type_option or session_type includes "revision".
 */
export function isRevisionSession(sessionTypeOption?: string | null, sessionType?: string | null): boolean {
  const opt = (sessionTypeOption || '').toLowerCase().trim();
  const typ = (sessionType || '').toLowerCase().trim();
  return opt.includes('revision') || typ.includes('revision');
}
