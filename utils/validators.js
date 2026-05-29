const validator = require('validator');

/**
 * Validates the syntax of an email address.
 * @param {string} email
 * @returns {boolean} true if valid, false otherwise
 */
function isValidEmailSyntax(email) {
  if (email === null || email === undefined || email === '') return false;
  if (typeof email !== 'string') return false;
  
  // Max length of an email is 254 characters
  if (email.length > 254) return false;

  // Basic checks before using validator
  if (email.indexOf('@') === -1) return false;
  if (email.split('@').length > 2) return false;
  if (email.includes('..')) return false;
  
  // Use validator library for robust checking
  return validator.isEmail(email, { allow_utf8_local_part: false });
}

/**
 * Extracts the domain from an email address.
 * @param {string} email
 * @returns {string|null} The domain or null if invalid
 */
function getDomainFromEmail(email) {
  if (!isValidEmailSyntax(email)) return null;
  return email.split('@')[1];
}

module.exports = {
  isValidEmailSyntax,
  getDomainFromEmail
};
