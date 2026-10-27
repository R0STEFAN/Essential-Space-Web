import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { NothingUser } from '@/types';
import { authenticateNothingUser } from '@/lib/nothing-api';
import { saveUserAuth } from '@/lib/storage';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DEVICE_FILE = path.join(DATA_DIR, 'device_identity.json');

interface CachedDeviceIdentity {
  deviceId: string;
  privateKeyPem: string;
  publicSpkiBase64: string;
  deviceInfoB64: string;
  nextRotationAt: number;
}

async function getOrCreateDeviceIdentity(
  cookies: Record<string, string>
): Promise<CachedDeviceIdentity> {
  try {
    const raw = await fs.readFile(DEVICE_FILE, 'utf-8');
    const cached: CachedDeviceIdentity = JSON.parse(raw);
    if (
      cached.deviceId &&
      cached.privateKeyPem &&
      cached.deviceInfoB64 &&
      Date.now() < cached.nextRotationAt
    ) {
      return cached;
    }
  } catch {
    // No cached device yet
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const publicSpkiBase64 = spkiDer.toString('base64');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

  const deviceInfoObj = {
    platform: 'WINDOWS',
    identifier: crypto.randomUUID().replace(/-/g, ''),
    client_type: 'WEB_BROWSER',
    is_first: true,
    screen_resolution: '1920x1080',
    web_gl_renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    canvas_fingerprint: '4f8a9c12',
    timezone: 'Europe/Kyiv',
    language: 'en',
    is_emulator: false,
    is_jail_broken: false,
    is_hooked: false,
    is_debug_mode: false,
    network_type: '4g',
    public_key: publicSpkiBase64,
  };
  const deviceInfoStr = JSON.stringify(deviceInfoObj);
  const deviceInfoB64 = Buffer.from(deviceInfoStr, 'utf8').toString('base64');

  const ts = String(Date.now());
  const nonce = crypto.randomUUID();
  const appSig = buildAppSignature(
    DEVICE_API_KEY,
    nonce,
    ts,
    '/api/v2/device/report',
    deviceInfoStr
  );

  const reportRes = await fetch(`${API_V2_BASE}/device/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Timestamp': ts,
      'X-Nonce': nonce,
      'X-App-Signature': appSig,
      'User-Agent': USER_AGENT,
    },
    body: deviceInfoStr,
  });

  extractSetCookies(reportRes, cookies);
  if (!reportRes.ok) {
    if (reportRes.status === 429) {
      throw new Error(
        'Nothing temporarily rate-limited requests from your IP address (HTTP 429). Please wait for the cooldown to expire.'
      );
    }
    const errText = await reportRes.text();
    throw new Error(`Nothing device registration failed (${reportRes.status}): ${errText}`);
  }

  const reportData = await reportRes.json();
  const identity: CachedDeviceIdentity = {
    deviceId: reportData.device_id,
    privateKeyPem,
    publicSpkiBase64,
    deviceInfoB64,
    nextRotationAt: reportData.next_key_rotation_at
      ? new Date(reportData.next_key_rotation_at).getTime()
      : Date.now() + 25 * 24 * 60 * 60 * 1000,
  };

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DEVICE_FILE, JSON.stringify(identity, null, 2), 'utf-8');
  return identity;
}

const SSO_ORIGIN = 'https://account.nothing.tech';
const API_V2_BASE = 'https://account.nothing.tech/api/v2';
const CLIENT_ID = 'account-app-web';
const REDIRECT_URI = 'https://account.nothing.tech/v2/oauth-callback';
const DEVICE_API_KEY = 'YDU0vfkpb2MBU4kjx1r1WvGMRaMVJ8dj4ByhgPECE6PbdstiVFBectExlaKDrwSk';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface AuthflowSession {
  id: string;
  email: string;
  privateKeyPem: string;
  publicSpkiBase64: string;
  deviceInfoB64: string;
  deviceId: string;
  xRef: string;
  loginFlow: string;
  codeVerifier: string;
  codeChallenge: string;
  oauthState: string;
  stateToken: string;
  cookies: Record<string, string>;
  createdAt: number;
}

export interface QrLoginSession {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'EXPIRED';
  user?: NothingUser;
  createdAt: number;
}

const globalForAuth = globalThis as unknown as {
  __nothingAuthSessions?: Map<string, AuthflowSession>;
  __nothingQrSessions?: Map<string, QrLoginSession>;
};

const authSessions =
  globalForAuth.__nothingAuthSessions ||
  (globalForAuth.__nothingAuthSessions = new Map<string, AuthflowSession>());

const qrSessions =
  globalForAuth.__nothingQrSessions ||
  (globalForAuth.__nothingQrSessions = new Map<string, QrLoginSession>());

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [k, v] of authSessions.entries()) {
    if (now - v.createdAt > 15 * 60 * 1000) authSessions.delete(k);
  }
  for (const [k, v] of qrSessions.entries()) {
    if (now - v.createdAt > 10 * 60 * 1000) qrSessions.delete(k);
  }
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildAppSignature(
  apiKey: string,
  nonce: string,
  timestamp: string,
  path: string,
  body: string
): string {
  const bodyHash = crypto
    .createHash('sha256')
    .update(body || '', 'utf8')
    .digest('hex');

  const params: Record<string, string> = {
    body: bodyHash,
    nonce,
    path: encodeURIComponent(path),
    timestamp,
  };

  const parts = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`);
  parts.push(`apiKey=${apiKey}`);

  const signingStr = parts.join('&');
  const hmac = crypto.createHmac('sha256', Buffer.from(apiKey, 'utf8'));
  hmac.update(signingStr, 'utf8');
  return base64UrlEncode(hmac.digest());
}

function signBodyEcdsa(privateKeyPem: string, timestamp: string, body: string): string {
  const msg = Buffer.from(`${timestamp}.${body || ''}`, 'utf8');
  const sig = crypto.sign('sha256', msg, {
    key: privateKeyPem,
    dsaEncoding: 'ieee-p1363',
  });
  return base64UrlEncode(sig);
}

function extractSetCookies(res: Response, cookieJar: Record<string, string>) {
  const setCookies =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : res.headers.get('set-cookie')
      ? [res.headers.get('set-cookie')!]
      : [];

  for (const raw of setCookies) {
    if (!raw) continue;
    const firstPart = raw.split(';')[0];
    const eqIdx = firstPart.indexOf('=');
    if (eqIdx > 0) {
      const name = firstPart.slice(0, eqIdx).trim();
      const val = firstPart.slice(eqIdx + 1).trim();
      cookieJar[name] = val;
    }
  }
}

function formatCookieHeader(cookieJar: Record<string, string>): string {
  return Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function initAuthflowSession(email: string): Promise<AuthflowSession> {
  cleanupExpiredSessions();

  const cookies: Record<string, string> = {};
  const identity = await getOrCreateDeviceIdentity(cookies);
  const { deviceId, privateKeyPem, publicSpkiBase64, deviceInfoB64 } = identity;

  // Initialize OAuth2 PKCE Authorize session to obtain x_ref and __Host-oauth_session_id cookie
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(
    crypto.createHash('sha256').update(codeVerifier, 'ascii').digest()
  );
  const oauthState = base64UrlEncode(crypto.randomBytes(16));

  const authorizeParams = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email offline_access',
    state: oauthState,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    x_page: 'login',
    lang: 'en',
    theme: 'dark',
  });

  const authRes = await fetch(`${API_V2_BASE}/oauth2/authorize?${authorizeParams.toString()}`, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      ...(Object.keys(cookies).length ? { Cookie: formatCookieHeader(cookies) } : {}),
    },
    redirect: 'manual',
  });

  extractSetCookies(authRes, cookies);
  const location = authRes.headers.get('location') || '';
  let xRef = '';
  let loginFlow = 'oauth-v25';

  if (location) {
    const locUrl = new URL(location, SSO_ORIGIN);
    xRef = locUrl.searchParams.get('x_ref') || '';
    loginFlow = locUrl.searchParams.get('login_flow') || 'oauth-v25';
  }
  if (!xRef && cookies['__Host-oauth_session_id']) {
    xRef = cookies['__Host-oauth_session_id'];
  }

  // 4. Start Authflow (/api/v2/authflow)
  const afBody = JSON.stringify({ type: 'login', name: loginFlow });
  const afTs = String(Date.now());
  const afSig = signBodyEcdsa(privateKeyPem, afTs, afBody);

  const afRes = await fetch(`${API_V2_BASE}/authflow`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': 'en',
      'X-OAuth-Session-Id': xRef,
      'X-Device-Id': deviceId,
      'X-Device-Info': deviceInfoB64,
      'X-Request-Timestamp': afTs,
      'X-Device-Signature': afSig,
      Cookie: formatCookieHeader(cookies),
      'User-Agent': USER_AGENT,
    },
    body: afBody,
  });

  extractSetCookies(afRes, cookies);
  const afData = await afRes.json();
  if (!afRes.ok || !afData.state_token) {
    throw new Error(afData.message || 'Failed to start Nothing Account authentication flow');
  }

  const session: AuthflowSession = {
    id: crypto.randomUUID(),
    email,
    privateKeyPem,
    publicSpkiBase64,
    deviceInfoB64,
    deviceId,
    xRef,
    loginFlow,
    codeVerifier,
    codeChallenge,
    oauthState,
    stateToken: afData.state_token,
    cookies,
    createdAt: Date.now(),
  };

  authSessions.set(session.id, session);
  return session;
}

async function postAuthflowInput(
  session: AuthflowSession,
  inputPayload: Record<string, any>
): Promise<{ status: number; data: any }> {
  const bodyStr = JSON.stringify({
    state_token: session.stateToken,
    input: inputPayload,
  });
  const ts = String(Date.now());
  const sig = signBodyEcdsa(session.privateKeyPem, ts, bodyStr);

  const res = await fetch(`${API_V2_BASE}/authflow/state/input`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': 'en',
      'X-OAuth-Session-Id': session.xRef,
      'X-Device-Id': session.deviceId,
      'X-Device-Info': session.deviceInfoB64,
      'X-Request-Timestamp': ts,
      'X-Device-Signature': sig,
      Cookie: formatCookieHeader(session.cookies),
      'User-Agent': USER_AGENT,
    },
    body: bodyStr,
  });

  extractSetCookies(res, session.cookies);
  const data = await res.json().catch(() => ({}));
  if (data?.state_token) {
    session.stateToken = data.state_token;
  }
  return { status: res.status, data };
}

async function resolveAuthorizationCode(
  session: AuthflowSession,
  actionData: any
): Promise<string> {
  if (actionData?.authorization_code) {
    return actionData.authorization_code;
  }

  let currentUrl: string = actionData?.redirect_url || actionData?.redirectUrl || '';

  // Check if currentUrl already contains ?code=
  if (currentUrl) {
    const parsedInitial = new URL(currentUrl, SSO_ORIGIN);
    const directCode = parsedInitial.searchParams.get('code');
    if (directCode) return directCode;
    currentUrl = parsedInitial.toString();
  } else {
    // Fallback: call /api/v2/oauth2/authorize with the now-authenticated session cookies
    const authorizeParams = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'openid profile email offline_access',
      state: session.oauthState,
      code_challenge: session.codeChallenge,
      code_challenge_method: 'S256',
      x_page: 'login',
      lang: 'en',
      theme: 'dark',
    });
    currentUrl = `${API_V2_BASE}/oauth2/authorize?${authorizeParams.toString()}`;
  }

  // Follow redirects manually up to 6 hops to catch ?code=
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(currentUrl, {
      method: 'GET',
      headers: {
        Cookie: formatCookieHeader(session.cookies),
        'User-Agent': USER_AGENT,
      },
      redirect: 'manual',
    });
    extractSetCookies(res, session.cookies);

    const loc = res.headers.get('location');
    if (!loc) break;

    const nextUrl = new URL(loc, SSO_ORIGIN);
    const code = nextUrl.searchParams.get('code');
    if (code) return code;

    currentUrl = nextUrl.toString();
  }

  // Final fallback: re-trigger authorize endpoint with authenticated cookies
  const authorizeParams = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email offline_access',
    state: session.oauthState,
    code_challenge: session.codeChallenge,
    code_challenge_method: 'S256',
  });
  const finalRes = await fetch(`${API_V2_BASE}/oauth2/authorize?${authorizeParams.toString()}`, {
    method: 'GET',
    headers: {
      Cookie: formatCookieHeader(session.cookies),
      'User-Agent': USER_AGENT,
    },
    redirect: 'manual',
  });
  extractSetCookies(finalRes, session.cookies);
  const finalLoc = finalRes.headers.get('location');
  if (finalLoc) {
    const finalUrl = new URL(finalLoc, SSO_ORIGIN);
    const code = finalUrl.searchParams.get('code');
    if (code) return code;
  }

  throw new Error('Could not obtain OAuth2 authorization code from Nothing Account');
}

async function exchangeCodeForUser(
  session: AuthflowSession,
  code: string
): Promise<NothingUser> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: session.codeVerifier,
  });
  const bodyStr = params.toString();
  const ts = String(Date.now());
  const sig = signBodyEcdsa(session.privateKeyPem, ts, bodyStr);

  const tokenRes = await fetch(`${API_V2_BASE}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Device-Id': session.deviceId,
      'X-Device-Info': session.deviceInfoB64,
      'X-Request-Timestamp': ts,
      'X-Device-Signature': sig,
      Cookie: formatCookieHeader(session.cookies),
      'User-Agent': USER_AGENT,
    },
    body: bodyStr,
  });

  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(
      tokenData.error_description ||
        tokenData.message ||
        `Nothing token exchange failed (${tokenRes.status})`
    );
  }

  authSessions.delete(session.id);

  const user = await authenticateNothingUser({
    email: session.email,
    token: tokenData.access_token,
  });

  if (tokenData.refresh_token) {
    user.refreshToken = tokenData.refresh_token;
  }

  // Also parse id_token if present for given_name / family_name / email
  if (tokenData.id_token) {
    try {
      const parts = tokenData.id_token.split('.');
      if (parts.length >= 2) {
        const idPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        if (idPayload.email) user.email = idPayload.email;
        const fullName = [idPayload.given_name, idPayload.family_name].filter(Boolean).join(' ');
        if (fullName) user.userName = fullName;
      }
    } catch {
      // ignore id_token parse errors
    }
  }

  await saveUserAuth(user);
  return user;
}

function isOtpAction(action: any): boolean {
  if (!action) return false;
  return (
    action.type === 'verify_identity' ||
    action.type === 'verify_oob_otp_data' ||
    Boolean(
      action.data &&
        ['verify_oob_otp_data', 'verify_identification_data'].includes(action.data.type)
    )
  );
}

export async function startNothingEmailLogin(
  email: string,
  password: string
): Promise<
  | { status: 'SUCCESS'; user: NothingUser }
  | {
      status: 'OTP_REQUIRED';
      sessionId: string;
      maskedEmail: string;
      cooldownAt?: number;
    }
> {
  const session = await initAuthflowSession(email.trim());

  const { status, data } = await postAuthflowInput(session, {
    identification: 'email',
    login_id: email.trim(),
    password,
  });

  if (status === 200 && data?.action) {
    const action = data.action;
    if (action.type === 'finished') {
      const code = await resolveAuthorizationCode(session, action.data);
      const user = await exchangeCodeForUser(session, code);
      return { status: 'SUCCESS', user };
    }

    if (isOtpAction(action)) {
      const actionData = action.data || {};
      return {
        status: 'OTP_REQUIRED',
        sessionId: session.id,
        maskedEmail: actionData.masked_destination || email.trim(),
        cooldownAt: actionData.cooldown_at ? Number(actionData.cooldown_at) : undefined,
      };
    }
  }

  authSessions.delete(session.id);

  if (status === 404) {
    throw new Error('No Nothing Account found with this email address.');
  }
  if (status === 401 || status === 400) {
    throw new Error('Incorrect email or password for Nothing Account.');
  }
  if (status === 403 || status === 429) {
    const cooldownAt = data?.causes?.[0]?.details?.cooldown_at;
    if (cooldownAt) {
      const mins = Math.max(1, Math.ceil((Number(cooldownAt) - Date.now()) / 60000));
      throw new Error(
        `Too many login attempts (${data?.reason || 'rate_limit'}). Please try again in ${mins} min.`
      );
    }
    throw new Error(
      `Access temporarily restricted by Nothing (${data?.reason || data?.message || status}).`
    );
  }

  throw new Error(data?.message || `Nothing authentication failed (HTTP ${status})`);
}

export async function verifyNothingEmailOtp(
  sessionId: string,
  code: string
): Promise<NothingUser> {
  const session = authSessions.get(sessionId);
  if (!session) {
    throw new Error('Verification session expired. Please sign in again.');
  }

  const { status, data } = await postAuthflowInput(session, {
    code: code.trim(),
  });

  if (status === 200 && data?.action?.type === 'finished') {
    const authCode = await resolveAuthorizationCode(session, data.action.data);
    return await exchangeCodeForUser(session, authCode);
  }

  if (status === 400 && data?.reason === 'code_incorrect') {
    throw new Error('Incorrect verification code. Please check the 6-digit code in your email.');
  }
  if (status === 403 && data?.reason === 'challenge_expired') {
    authSessions.delete(sessionId);
    throw new Error('Verification code expired. Please sign in again.');
  }

  throw new Error(data?.message || 'Failed to verify OTP code.');
}

export async function resendNothingEmailOtp(
  sessionId: string
): Promise<{ cooldownAt?: number }> {
  const session = authSessions.get(sessionId);
  if (!session) {
    throw new Error('Verification session expired. Please sign in again.');
  }

  const { status, data } = await postAuthflowInput(session, {
    resend: true,
  });

  if (status !== 200) {
    throw new Error(data?.message || 'Could not resend verification code. Try again in a minute.');
  }

  return {
    cooldownAt: data?.action?.data?.cooldown_at
      ? Number(data.action.data.cooldown_at)
      : Date.now() + 60000,
  };
}

export async function startNothingOAuthLogin(
  provider: 'google' | 'apple' = 'google'
): Promise<{ sessionId: string; authorizationUrl: string }> {
  const session = await initAuthflowSession(`${provider}@nothing.tech`);

  const { status, data } = await postAuthflowInput(session, {
    identification: 'oauth',
    alias: provider,
  });

  const authUrl = data?.action?.data?.authorization_url;
  if (status !== 200 || !authUrl) {
    authSessions.delete(session.id);
    throw new Error(data?.message || `Failed to initialize ${provider} sign-in`);
  }

  return {
    sessionId: session.id,
    authorizationUrl: authUrl,
  };
}

export async function pollNothingOAuthLogin(
  sessionId: string
): Promise<
  | { status: 'PENDING' }
  | { status: 'SUCCESS'; user: NothingUser }
  | { status: 'OTP_REQUIRED'; sessionId: string; maskedEmail: string; cooldownAt?: number }
> {
  const session = authSessions.get(sessionId);
  if (!session) {
    throw new Error('OAuth session expired.');
  }

  const { status, data } = await postAuthflowInput(session, {});

  if (status === 200 && data?.action) {
    const action = data.action;

    if (action.type === 'oauth_authorization') {
      return { status: 'PENDING' };
    }

    if (action.type === 'finished') {
      const code = await resolveAuthorizationCode(session, action.data);
      const user = await exchangeCodeForUser(session, code);
      return { status: 'SUCCESS', user };
    }

    if (isOtpAction(action)) {
      const actionData = action.data || {};
      return {
        status: 'OTP_REQUIRED',
        sessionId: session.id,
        maskedEmail: actionData.masked_destination || actionData.email || 'your email',
        cooldownAt: actionData.cooldown_at ? Number(actionData.cooldown_at) : undefined,
      };
    }
  }

  return { status: 'PENDING' };
}

function normalizeRefreshTokenCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    if (decoded && decoded.length >= 20 && /^[\x20-\x7E]+$/.test(decoded) && decoded !== trimmed) {
      candidates.unshift(decoded);
    }
  } catch {
    // ignore
  }
  return candidates;
}

export async function refreshNothingAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken?: string; idToken?: string } | null> {
  const candidates = normalizeRefreshTokenCandidates(refreshToken);

  let identity: CachedDeviceIdentity | null = null;
  try {
    identity = await getOrCreateDeviceIdentity({});
  } catch {
    identity = null;
  }

  for (const candidate of candidates) {
    try {
      const bodyStr = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: candidate,
        client_id: CLIENT_ID,
      }).toString();

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      };

      if (identity) {
        const ts = String(Date.now());
        const sig = signBodyEcdsa(identity.privateKeyPem, ts, bodyStr);
        headers['X-Device-Id'] = identity.deviceId;
        headers['X-Device-Info'] = identity.deviceInfoB64;
        headers['X-Request-Timestamp'] = ts;
        headers['X-Device-Signature'] = sig;
      }

      const res = await fetch(`${API_V2_BASE}/oauth2/token`, {
        method: 'POST',
        headers,
        body: bodyStr,
      });

      if (!res.ok) continue;
      const data = await res.json();
      if (!data.access_token) continue;

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || candidate,
        idToken: data.id_token,
      };
    } catch {
      // try next candidate
    }
  }

  return null;
}

// ==========================================
// QR CODE MOBILE HANDOFF SESSIONS
// ==========================================

export function createQrSession(): QrLoginSession {
  cleanupExpiredSessions();
  const session: QrLoginSession = {
    id: crypto.randomUUID(),
    status: 'PENDING',
    createdAt: Date.now(),
  };
  qrSessions.set(session.id, session);
  return session;
}

export function getQrSession(id: string): QrLoginSession | null {
  cleanupExpiredSessions();
  return qrSessions.get(id) || null;
}

export function approveQrSession(id: string, user: NothingUser): boolean {
  const session = qrSessions.get(id);
  if (!session || session.status !== 'PENDING') return false;
  session.status = 'APPROVED';
  session.user = user;
  return true;
}
