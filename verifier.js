const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const { isValidEmailSyntax, getDomainFromEmail } = require('./utils/validators');
const { getDidYouMean } = require('./didYouMean');
const { verifyMailbox } = require('./smtp');

const RESULT_CODES = {
  VALID: 1,
  UNKNOWN: 3,
  INVALID: 6
};

const BLOCKED_PROVIDERS = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com'];

/**
 * Main verification function.
 * @param {string} email - The email to verify
 * @returns {Promise<object>} The verification response
 */
async function verifyEmail(email) {
  const startTime = Date.now();
  
  const response = {
    email: email,
    result: 'unknown',
    resultcode: RESULT_CODES.UNKNOWN,
    subresult: null,
    domain: null,
    mxRecords: [],
    executiontime: 0,
    error: null,
    didyoumean: getDidYouMean(email),
    timestamp: new Date().toISOString()
  };

  const finish = (resultStr, subresultStr, errorMsg = null) => {
    response.result = resultStr;
    response.subresult = subresultStr;
    
    if (resultStr === 'valid') response.resultcode = RESULT_CODES.VALID;
    else if (resultStr === 'invalid') response.resultcode = RESULT_CODES.INVALID;
    else response.resultcode = RESULT_CODES.UNKNOWN;
    
    if (errorMsg) response.error = errorMsg;
    
    response.executiontime = Date.now() - startTime;
    return response;
  };

  // 1. Syntax Validation
  if (!isValidEmailSyntax(email)) {
    return finish('invalid', 'invalid_syntax');
  }

  const domain = getDomainFromEmail(email);
  response.domain = domain;

  // 2. DNS MX Lookup with retry logic and fallback
  let mxRecords = [];
  let attempts = 0;
  const maxAttempts = 3;
  let dnsSuccess = false;
  let lastError = null;

  while (attempts < maxAttempts && !dnsSuccess) {
    attempts++;
    try {
      let mxRaw = await dns.promises.resolveMx(domain);
      
      // Cleanup MX records: remove empty/invalid ones
      mxRaw = (mxRaw || []).filter(record => record && record.exchange && record.exchange.trim() !== '');
      
      if (mxRaw.length === 0) {
        return finish('invalid', 'no_mx_records');
      }
      
      // Sort by priority
      mxRaw.sort((a, b) => a.priority - b.priority);
      mxRecords = mxRaw.map(record => record.exchange);
      response.mxRecords = mxRecords;
      dnsSuccess = true;
    } catch (err) {
      lastError = err;
      if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') {
        return finish('invalid', 'domain_not_found');
      }
      
      if (attempts < maxAttempts) {
        // Wait 1 second before retrying
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  if (!dnsSuccess) {
    return finish('unknown', 'dns_error', lastError ? lastError.message : 'Unknown DNS error');
  }

  // 3. SMTP Verification
  let smtpResult = null;
  let smtpErrorMsg = null;

  // Try MX records in order (retry logic for SMTP connection handling)
  for (const mx of mxRecords) {
    try {
      smtpResult = await verifyMailbox(email, mx);
      
      // If we got a definitive answer, stop trying other MX records
      if (smtpResult.result !== 'unknown') {
        break;
      }
      
      // If it's a connection error or timeout, we can try the next MX record
      if (['connection_error', 'timeout'].includes(smtpResult.subresult)) {
        continue;
      }
      
      // If it's greylisted or unexpected response, we can break as the server did respond
      break;
    } catch (err) {
      smtpErrorMsg = err.message;
      // Continue to next MX record on unexpected errors
    }
  }

  if (!smtpResult) {
    smtpResult = { result: 'unknown', subresult: 'smtp_error', code: null };
  }

  // 4. Provider-aware handling
  if (smtpResult.result === 'unknown') {
    if (BLOCKED_PROVIDERS.includes(domain.toLowerCase())) {
      smtpResult.subresult = 'provider_blocked';
    }
  }

  let finalErrorMsg = smtpResult.code ? `SMTP Code: ${smtpResult.code}` : smtpErrorMsg;
  return finish(smtpResult.result, smtpResult.subresult, finalErrorMsg);
}

module.exports = {
  verifyEmail
};
