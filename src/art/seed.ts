export interface Fingerprint {
  /** Full SHA-256 of the file bytes, lowercase hex (64 chars). */
  hex: string;
  /** First 8 hex digits, uppercase: the "Fingerprint ID" printed on the card. */
  id: string;
}

/**
 * Hashes the original file bytes (not the decoded audio), so the seed is
 * identical in every browser. Uses Web Crypto, available in browsers,
 * workers and Node.
 */
export async function fingerprintBytes(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<Fingerprint> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return { hex, id: hex.slice(0, 8).toUpperCase() };
}
