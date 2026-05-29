/**
 * Computes the Levenshtein distance between two strings.
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

const COMMON_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'aol.com', 'icloud.com', 'protonmail.com', 'zoho.com'
];

/**
 * Suggests a corrected email address if the domain contains a typo.
 * @param {string} email
 * @returns {string|null} Suggested email or null if no typo detected
 */
function getDidYouMean(email) {
  if (!email || typeof email !== 'string' || email.indexOf('@') === -1) {
    return null;
  }

  const [localPart, domain] = email.split('@');
  
  // If the domain is already a common domain, no suggestion needed
  if (COMMON_DOMAINS.includes(domain.toLowerCase())) {
    return null;
  }

  let bestMatch = null;
  let minDistance = Infinity;

  for (const commonDomain of COMMON_DOMAINS) {
    const distance = levenshteinDistance(domain.toLowerCase(), commonDomain);
    
    // Requirements state max edit distance <= 2
    if (distance <= 2 && distance < minDistance) {
      minDistance = distance;
      bestMatch = commonDomain;
    }
  }

  if (bestMatch) {
    return `${localPart}@${bestMatch}`;
  }

  return null;
}

module.exports = {
  getDidYouMean,
  levenshteinDistance
};
