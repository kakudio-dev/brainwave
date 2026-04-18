import { describe, it, expect } from 'vitest';
import { normalizeEmail, deriveDeviceLabel } from './auth';

describe('normalizeEmail', () => {
  it('lowercases and trims valid emails', () => {
    expect(normalizeEmail('  User@Example.com  ')).toBe('user@example.com');
  });

  it('accepts plus-addressed emails', () => {
    expect(normalizeEmail('user+tag@example.com')).toBe('user+tag@example.com');
  });

  it('rejects empty strings', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
  });

  it('rejects strings without an @', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
  });

  it('rejects strings without a domain TLD', () => {
    expect(normalizeEmail('user@nodomain')).toBeNull();
  });

  it('rejects overly long emails', () => {
    const huge = 'a'.repeat(250) + '@x.co';
    expect(normalizeEmail(huge)).toBeNull();
  });

  it('rejects emails with embedded whitespace', () => {
    expect(normalizeEmail('user name@example.com')).toBeNull();
  });
});

describe('deriveDeviceLabel', () => {
  it('identifies Chrome on Mac', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
    expect(deriveDeviceLabel(ua)).toBe('Mac (Chrome)');
  });

  it('identifies Safari on iPhone', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
    expect(deriveDeviceLabel(ua)).toBe('iPhone (Safari)');
  });

  it('identifies Firefox on Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0';
    expect(deriveDeviceLabel(ua)).toBe('Windows (Firefox)');
  });

  it('returns null for missing UA', () => {
    expect(deriveDeviceLabel(null)).toBeNull();
    expect(deriveDeviceLabel(undefined)).toBeNull();
    expect(deriveDeviceLabel('')).toBeNull();
  });

  it('returns a best-effort label for unknown UAs', () => {
    expect(deriveDeviceLabel('CustomBot/1.0')).toBeNull();
  });
});
