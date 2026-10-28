import forge from 'node-forge';

/**
 * Nothing Essential Space API Constants (Reverse engineered from Nothing Space & User Center APKs)
 */
export const NOTHING_API_KEY =
  process.env.NOTHING_API_KEY || 'ZNtCkkSHqahusjfyouYxeaHUryeqKNaG';
export const NOTHING_BASE_URL = 'https://essential-space.nothingtech.link/essentialSpace';

const CLAIM_PUBLIC_KEY_B64 =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApH/X4DvBWC4UlJT0GdVbzZ4B+NQLESj9nnTgYl+o2UzxqV7JDIFSO4F+v/kFXF+10XEtoGZli6peg0QJpXe5HoqWZJBEnriFrLxzQu3hRWfqy0A3LosscxpfgrYrbtvRAO9/dB6d0jzYBal76btJxDJ9DFwi0qLlDSHTdbkMV+GaV+cI4Rpz2fl/LGSAtC2f5VibtINMtRY1KObNW9lJU6Yd/pazIYHqGh6FxGZHpQRrxRF6oxAqytG4dYgfOoBSUr3y8QNEks3sN9PZbSZP9im5crL1xiWTk4TKtq+uJxOn3uwDOtuxrV5jDIA+IOnIFjuGyAr5I43ld+dbFWak/QIDAQAB';

const CLAIM_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----\n${CLAIM_PUBLIC_KEY_B64.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;

/**
 * Generate MD5 hash of string (lowercase hex)
 */
export function md5(input: string): string {
  const md = forge.md.md5.create();
  md.update(input, 'utf8');
  return md.digest().toHex();
}

/**
 * Generate Nothing API Authentication Headers
 */
export function generateNothingAuthHeaders(token?: string): Record<string, string> {
  const timestamp = Date.now().toString();
  const auth = md5(NOTHING_API_KEY + timestamp);

  const headers: Record<string, string> = {
    timestamp,
    auth,
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Generates a random 256-bit AES key (Base64 string) and its RSA-encrypted cipherKey.
 * Matches NothingApiManager:
 * Random.Default.nextBytes(32) -> Base64.encodeToString(..., NO_WRAP)
 * RSA/ECB/PKCS1Padding
 */
export function generateWriteCipherSession(): { aesKeyB64: string; cipherKey: string } {
  // 1. Generate 32 random bytes for AES-256
  const rawAesBytes = forge.random.getBytesSync(32);
  const aesKeyB64 = forge.util.encode64(rawAesBytes);

  // 2. Encrypt the UTF-8 string bytes of aesKeyB64 with RSA/ECB/PKCS1Padding
  const publicKey = forge.pki.publicKeyFromPem(CLAIM_PUBLIC_KEY_PEM);
  const encryptedKeyBytes = publicKey.encrypt(aesKeyB64, 'RSAES-PKCS1-V1_5');
  const cipherKey = forge.util.encode64(encryptedKeyBytes);

  return {
    aesKeyB64,
    cipherKey,
  };
}

/**
 * Encrypts a plaintext string using AES-256-ECB (PKCS7 padding) with the decoded aesKeyB64.
 * Matches NothingApiManager.getPayload(plaintext, aesKeyB64).
 */
export function encryptPayload(plaintext: string, aesKeyB64: string): string {
  const keyBytes = forge.util.decode64(aesKeyB64);
  const cipher = forge.cipher.createCipher('AES-ECB', keyBytes);
  cipher.start();
  cipher.update(forge.util.createBuffer(plaintext, 'utf8'));
  cipher.finish();
  return forge.util.encode64(cipher.output.getBytes());
}

/**
 * Safely decodes a Nothing JWT payload and extracts user metadata (uuid, email, name).
 */
export function parseNothingJwt(token: string): { uuid: string; email: string; userName?: string } | null {
  try {
    const clean = token.trim().replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '');
    const parts = clean.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    let uuid = `nt_user_${Date.now()}`;
    let email = 'user@nothing.tech';
    let userName: string | undefined;

    if (payload.uuid) uuid = payload.uuid;
    else if (payload.sub && String(payload.sub).includes('-')) uuid = payload.sub;
    else if (payload.sub) uuid = `sub_${payload.sub}`;

    if (payload.email) email = payload.email;
    if (payload.given_name || payload.family_name) {
      userName = [payload.given_name, payload.family_name].filter(Boolean).join(' ');
    }
    return { uuid, email, userName };
  } catch {
    return null;
  }
}
