const { verifyEmail } = require('../verifier');
const { isValidEmailSyntax, getDomainFromEmail } = require('../utils/validators');
const { getDidYouMean } = require('../didYouMean');

// Mock DNS and SMTP so tests run instantly without external network dependency
jest.mock('dns', () => ({
  setServers: jest.fn(),
  promises: {
    resolveMx: jest.fn()
  }
}));

jest.mock('../smtp', () => ({
  verifyMailbox: jest.fn()
}));

const dns = require('dns').promises;
const { verifyMailbox } = require('../smtp');

describe('Email Verifier Module', () => {

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Syntax Validation', () => {
    test('validates correct email syntax', () => {
      expect(isValidEmailSyntax('test@example.com')).toBe(true);
      expect(isValidEmailSyntax('user.name+tag@domain.co.uk')).toBe(true);
    });

    test('rejects invalid email formats', () => {
      expect(isValidEmailSyntax('missingat.com')).toBe(false);
      expect(isValidEmailSyntax('multiple@@example.com')).toBe(false);
      expect(isValidEmailSyntax('double..dots@example.com')).toBe(false);
      expect(isValidEmailSyntax('')).toBe(false);
      expect(isValidEmailSyntax(null)).toBe(false);
      expect(isValidEmailSyntax(undefined)).toBe(false);
    });

    test('extracts domain correctly', () => {
      expect(getDomainFromEmail('test@example.com')).toBe('example.com');
      expect(getDomainFromEmail('invalid')).toBe(null);
    });
  });

  describe('Typo Detection (Did You Mean)', () => {
    test('detects common typos', () => {
      expect(getDidYouMean('user@gmial.com')).toBe('user@gmail.com');
      expect(getDidYouMean('test@hotmial.com')).toBe('test@hotmail.com');
      expect(getDidYouMean('admin@yahooo.com')).toBe('admin@yahoo.com');
      expect(getDidYouMean('contact@outlok.com')).toBe('contact@outlook.com');
    });

    test('returns null for valid common domains', () => {
      expect(getDidYouMean('user@gmail.com')).toBe(null);
    });

    test('returns null for unrelated domains', () => {
      expect(getDidYouMean('user@somestartup1234.com')).toBe(null); // Distance > 2
    });
  });

  describe('Integration (verifyEmail)', () => {
    test('handles invalid syntax quickly', async () => {
      const result = await verifyEmail('bad-email');
      expect(result.result).toBe('invalid');
      expect(result.resultcode).toBe(6);
      expect(result.subresult).toBe('invalid_syntax');
      expect(dns.resolveMx).not.toHaveBeenCalled();
    });

    test('handles DNS resolution failure', async () => {
      dns.resolveMx.mockRejectedValue({ code: 'ENOTFOUND' });
      const result = await verifyEmail('test@unknown-domain-123.com');
      
      expect(result.result).toBe('invalid');
      expect(result.subresult).toBe('domain_not_found');
    });

    test('handles missing MX records', async () => {
      dns.resolveMx.mockResolvedValue([]);
      const result = await verifyEmail('test@no-mx.com');
      
      expect(result.result).toBe('invalid');
      expect(result.subresult).toBe('no_mx_records');
    });

    test('cleans up empty MX records', async () => {
      dns.resolveMx.mockResolvedValue([{ exchange: '', priority: 10 }, { exchange: '   ', priority: 20 }]);
      const result = await verifyEmail('test@empty-mx.com');
      
      expect(result.result).toBe('invalid');
      expect(result.subresult).toBe('no_mx_records');
    });

    test('returns provider_blocked for blocked providers like Gmail', async () => {
      dns.resolveMx.mockResolvedValue([{ exchange: 'gmail-smtp-in.l.google.com', priority: 10 }]);
      verifyMailbox.mockResolvedValue({ result: 'unknown', subresult: 'connection_error', code: null });
      
      const result = await verifyEmail('test@gmail.com');
      
      expect(result.result).toBe('unknown');
      expect(result.subresult).toBe('provider_blocked');
    });

    test('returns valid when SMTP replies 250', async () => {
      dns.resolveMx.mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }]);
      verifyMailbox.mockResolvedValue({ result: 'valid', subresult: 'mailbox_exists', code: 250 });
      
      const result = await verifyEmail('test@example.com');
      
      expect(result.result).toBe('valid');
      expect(result.resultcode).toBe(1);
      expect(result.subresult).toBe('mailbox_exists');
      expect(result.mxRecords).toEqual(['mx.example.com']);
      expect(result.didyoumean).toBe(null);
    });

    test('returns invalid when SMTP replies 550', async () => {
      dns.resolveMx.mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }]);
      verifyMailbox.mockResolvedValue({ result: 'invalid', subresult: 'mailbox_does_not_exist', code: 550 });
      
      const result = await verifyEmail('baduser@example.com');
      
      expect(result.result).toBe('invalid');
      expect(result.subresult).toBe('mailbox_does_not_exist');
    });

    test('returns unknown when SMTP replies 450 (greylisted)', async () => {
      dns.resolveMx.mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }]);
      verifyMailbox.mockResolvedValue({ result: 'unknown', subresult: 'greylisted_or_temp_error', code: 450 });
      
      const result = await verifyEmail('test@example.com');
      
      expect(result.result).toBe('unknown');
      expect(result.resultcode).toBe(3);
    });

    test('handles timeout during SMTP', async () => {
      dns.resolveMx.mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }]);
      verifyMailbox.mockResolvedValue({ result: 'unknown', subresult: 'timeout', code: null });
      
      const result = await verifyEmail('test@example.com');
      
      expect(result.result).toBe('unknown');
      expect(result.subresult).toBe('timeout');
    });

    test('handles DNS unknown errors', async () => {
      dns.resolveMx.mockRejectedValue(new Error('Random DNS error'));
      const result = await verifyEmail('test@example.com');
      
      expect(result.result).toBe('unknown');
      expect(result.subresult).toBe('dns_error');
    });

    test('handles SMTP unexpected errors', async () => {
      dns.resolveMx.mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }]);
      verifyMailbox.mockRejectedValue(new Error('Connection reset'));
      
      const result = await verifyEmail('test@example.com');
      
      expect(result.result).toBe('unknown');
      expect(result.subresult).toBe('smtp_error');
    });
    
    test('handles very long email', async () => {
      const longLocal = 'a'.repeat(65);
      const result = await verifyEmail(`${longLocal}@example.com`);
      
      // The validator library rejects local parts > 64 chars
      expect(result.result).toBe('invalid');
      expect(result.subresult).toBe('invalid_syntax');
    });
  });

});
