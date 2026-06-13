import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies Meta's `X-Hub-Signature-256` header on a raw request body.
 * Reference: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validating
 *
 * `signatureHeader` looks like `sha256=<hex>`. Empty header or wrong format ⇒ false.
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expectedHex = createHmac('sha256', appSecret)
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
    .digest('hex');
  const actualHex = signatureHeader.slice('sha256='.length);
  // timing-safe compare requires equal length buffers
  const expected = Buffer.from(expectedHex, 'hex');
  let actual: Buffer;
  try {
    actual = Buffer.from(actualHex, 'hex');
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(expected, actual);
}
