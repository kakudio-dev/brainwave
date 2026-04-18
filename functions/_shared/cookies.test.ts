import { describe, it, expect } from 'vitest';
import { buildSessionCookie, buildClearSessionCookie, readSessionCookie } from './cookies';

describe('buildSessionCookie', () => {
  it('sets the expected flags', () => {
    const c = buildSessionCookie('abc123');
    expect(c).toContain('brainwave_session=abc123');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).toContain('Max-Age=');
  });
});

describe('buildClearSessionCookie', () => {
  it('issues a zero-valued cookie with Max-Age=0', () => {
    const c = buildClearSessionCookie();
    expect(c).toContain('brainwave_session=;');
    expect(c).toContain('Max-Age=0');
  });
});

describe('readSessionCookie', () => {
  function makeReq(cookieHeader?: string): Request {
    return new Request('https://example.com/', {
      headers: cookieHeader ? { Cookie: cookieHeader } : {}
    });
  }

  it('returns null when no cookie header is present', () => {
    expect(readSessionCookie(makeReq())).toBeNull();
  });

  it('returns the session value when present', () => {
    expect(readSessionCookie(makeReq('brainwave_session=abc123'))).toBe('abc123');
  });

  it('ignores other cookies and returns the right one', () => {
    const c = 'other=foo; brainwave_session=xyz; another=bar';
    expect(readSessionCookie(makeReq(c))).toBe('xyz');
  });

  it('returns null for an empty value', () => {
    expect(readSessionCookie(makeReq('brainwave_session='))).toBeNull();
  });
});
