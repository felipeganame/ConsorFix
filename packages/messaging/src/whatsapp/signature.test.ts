import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMetaSignature } from './signature.js';

const SECRET = 'unit-test-secret';

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');
}

describe('verifyMetaSignature', () => {
  it('returns true on valid signature', () => {
    const body = '{"object":"whatsapp_business_account"}';
    expect(verifyMetaSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('returns false on tampered body', () => {
    const body = '{"object":"whatsapp_business_account"}';
    expect(verifyMetaSignature(body + 'X', sign(body), SECRET)).toBe(false);
  });

  it('returns false on wrong secret', () => {
    const body = '{}';
    expect(verifyMetaSignature(body, sign(body), 'different-secret')).toBe(false);
  });

  it('returns false on missing header', () => {
    expect(verifyMetaSignature('{}', undefined, SECRET)).toBe(false);
  });

  it('returns false on wrong prefix', () => {
    expect(verifyMetaSignature('{}', 'sha1=abc', SECRET)).toBe(false);
  });

  it('returns false on garbage hex', () => {
    expect(verifyMetaSignature('{}', 'sha256=not-hex', SECRET)).toBe(false);
  });

  it('handles Buffer body', () => {
    const body = Buffer.from('{"x":1}', 'utf8');
    expect(verifyMetaSignature(body, sign('{"x":1}'), SECRET)).toBe(true);
  });
});
