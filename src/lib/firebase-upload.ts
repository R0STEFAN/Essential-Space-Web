import { generateUuid } from './uuid';
import { NOTHING_BASE_URL, generateNothingAuthHeaders, md5 } from './crypto';
import { nothingFetch } from './nothing-fetch';

// Firebase client identifier from official Nothing Android APK
const FIREBASE_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  (typeof atob !== 'undefined'
    ? atob('QUl6YVN5QnFkb2hDQzlLT19hNkd2d0gxM2lOSkpYZGlucUxtNDJB')
    : Buffer.from('QUl6YVN5QnFkb2hDQzlLT19hNkd2d0gxM2lOSkpYZGlucUxtNDJB', 'base64').toString('utf-8'));
const FIREBASE_BUCKET = 'essential-space-gcs-europe-west3';

// In-memory cached idToken with expiration
let cachedIdToken: { token: string; expiresAt: number } | null = null;

/**
 * Retrieves Firebase Auth idToken for the user session
 */
export async function getFirebaseIdToken(nothingToken: string): Promise<string> {
  const now = Date.now();
  if (cachedIdToken && cachedIdToken.expiresAt > now + 60_000) {
    return cachedIdToken.token;
  }

  // 1. Get Firebase custom token from Nothing Cloud
  const tokenUrl = `${NOTHING_BASE_URL}/storage/v1/getFirebaseToken`;
  const res = await nothingFetch(tokenUrl, {
    method: 'GET',
    headers: generateNothingAuthHeaders(nothingToken),
  });

  if (!res.ok) {
    throw new Error(`Failed to get Firebase custom token: HTTP ${res.status}`);
  }

  const json = await res.json();
  const customToken = json?.data;
  if (!customToken || typeof customToken !== 'string') {
    throw new Error('Invalid Firebase custom token in response');
  }

  // 2. Exchange customToken for idToken with Google Identity Toolkit
  const exchangeUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`;
  const exchangeRes = await nothingFetch(exchangeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });

  if (!exchangeRes.ok) {
    const errData = await exchangeRes.json().catch(() => null);
    const detail = errData?.error?.message || `HTTP ${exchangeRes.status}`;
    throw new Error(`Firebase token exchange failed: ${detail}`);
  }

  const exchangeJson = await exchangeRes.json();
  const idToken = exchangeJson?.idToken;
  const expiresInSec = parseInt(exchangeJson?.expiresIn || '3600', 10);

  if (!idToken) {
    throw new Error('No idToken returned from Google Identity Toolkit');
  }

  cachedIdToken = {
    token: idToken,
    expiresAt: now + expiresInSec * 1000,
  };

  return idToken;
}

/**
 * Uploads a binary Blob directly to Firebase Storage (Google Cloud Storage)
 */
export async function uploadMediaToGcs(params: {
  nothingToken: string;
  userId: string;
  fileBlob: Blob;
  contentType: 'image/webp' | 'audio/wav' | 'audio/ogg' | 'audio/mp4';
  type: 'image' | 'audio';
  cardId?: string;
}): Promise<{ gcsKey: string; downloadUrl: string }> {
  const idToken = await getFirebaseIdToken(params.nothingToken);
  const cardId = params.cardId || generateUuid();
  const resourceId = generateUuid().replace(/-/g, '').slice(0, 16);

  // Compute 32-char user hash
  const userHash = md5(params.userId);

  const ext =
    params.contentType === 'image/webp'
      ? 'webp'
      : params.contentType === 'audio/wav'
      ? 'wav'
      : params.contentType === 'audio/ogg'
      ? 'ogg'
      : 'm4a';

  const prefix = params.type === 'image' ? 'imageRequest' : 'audioRequest';
  const gcsKey = `${prefix}/${userHash}/${cardId}/${resourceId}.${ext}`;

  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(
    gcsKey
  )}`;

  const uploadRes = await nothingFetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Firebase ${idToken}`,
      'Content-Type': params.contentType,
    },
    body: params.fileBlob,
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text().catch(() => '');
    throw new Error(`GCS upload failed (HTTP ${uploadRes.status}): ${errorText}`);
  }

  const uploadJson = await uploadRes.json();
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_BUCKET}/o/${encodeURIComponent(
    gcsKey
  )}?alt=media`;

  return { gcsKey, downloadUrl };
}
