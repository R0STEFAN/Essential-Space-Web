interface Env {}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

const SSO_ORIGIN = 'https://account.nothing.tech';
const API_V2_BASE = 'https://account.nothing.tech/api/v2';
const CLIENT_ID = 'account-app-native';
const REDIRECT_URI = 'nothing-account-app://oauth2/callback';
const DEVICE_API_KEY = 'YDU0vfkpb2MBU4kjx1r1WvGMRaMVJ8dj4ByhgPECE6PbdstiVFBectExlaKDrwSk';
const USER_AGENT = 'Dart/3.5 (dart:io)';

interface CachedDeviceIdentity {
  deviceId: string;
  privateKey: CryptoKey;
  publicSpkiBase64: string;
  deviceInfoB64: string;
  nextRotationAt: number;
}

interface AuthflowSession {
  id: string;
  email: string;
  privateKey: CryptoKey;
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

let cachedIdentity: CachedDeviceIdentity | null = null;
const authSessions = new Map<string, AuthflowSession>();

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [k, v] of authSessions.entries()) {
    if (now - v.createdAt > 15 * 60 * 1000) authSessions.delete(k);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function stringToBase64(str: string): string {
  return bytesToBase64(new TextEncoder().encode(str));
}

function base64UrlDecodeToString(str: string): string {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function formatCookieHeader(cookieJar: Record<string, string>): string {
  return Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function extractSetCookies(res: Response, cookieJar: Record<string, string>) {
  const setCookies =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : res.headers.get('set-cookie')
      ? [res.headers.get('set-cookie')!]
      : [];

  for (const raw of setCookies) {
    const pair = String(raw).split(';')[0];
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      const k = pair.substring(0, eqIdx).trim();
      const v = pair.substring(eqIdx + 1).trim();
      cookieJar[k] = v;
    }
  }
}

async function buildAppSignature(
  apiKey: string,
  nonce: string,
  timestamp: string,
  path: string,
  body: string
): Promise<string> {
  const bodyBytes = new TextEncoder().encode(body || '');
  const bodyHashBuf = await crypto.subtle.digest('SHA-256', bodyBytes);
  const hashArray = Array.from(new Uint8Array(bodyHashBuf));
  const bodyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

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
  const keyBytes = new TextEncoder().encode(apiKey);
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(signingStr));
  return base64UrlEncodeBytes(new Uint8Array(sigBuf));
}

async function signBodyEcdsa(privateKey: CryptoKey, timestamp: string, body: string): Promise<string> {
  const msg = new TextEncoder().encode(`${timestamp}.${body || ''}`);
  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    msg
  );
  return base64UrlEncodeBytes(new Uint8Array(sigBuf));
}

async function buildDeviceHeaders(
  identity: { privateKey: CryptoKey; deviceId: string; deviceInfoB64: string },
  path: string,
  bodyStr: string,
  extraHeaders: Record<string, string> = {}
): Promise<Record<string, string>> {
  const ts = String(Date.now());
  const nonce = crypto.randomUUID();
  const devSig = await signBodyEcdsa(identity.privateKey, ts, bodyStr);
  const appSig = await buildAppSignature(DEVICE_API_KEY, nonce, ts, path, bodyStr);

  return {
    'Content-Type': 'application/json',
    'Accept-Language': 'en',
    'X-Device-Id': identity.deviceId,
    'X-Device-Info': identity.deviceInfoB64,
    'X-Request-Timestamp': ts,
    'X-Nonce': nonce,
    'X-App-Signature': appSig,
    'X-Device-Signature': devSig,
    'User-Agent': USER_AGENT,
    ...extraHeaders,
  };
}

async function getOrCreateDeviceIdentity(cookies: Record<string, string>): Promise<CachedDeviceIdentity> {
  if (cachedIdentity && Date.now() < cachedIdentity.nextRotationAt) {
    return cachedIdentity;
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const spkiDer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicSpkiBase64 = bytesToBase64(new Uint8Array(spkiDer));

  const deviceInfoObj = {
    platform: 'ANDROID',
    identifier: crypto.randomUUID().replace(/-/g, ''),
    client_type: 'APP',
    device_model: 'AIN24',
    device_brand: 'Nothing',
    device_manufacturer: 'Nothing',
    device_architecture: 'arm64-v8a',
    device_hardware: 'qcom',
    device_board: 'taro',
    os_version: '14',
    is_first: true,
    screen_resolution: '1080x2412',
    timezone: 'Europe/Kyiv',
    language: 'en',
    is_emulator: false,
    is_jail_broken: false,
    is_hooked: false,
    is_debug_mode: false,
    network_type: 'wifi',
    public_key: publicSpkiBase64,
  };
  const deviceInfoStr = JSON.stringify(deviceInfoObj);
  const deviceInfoB64 = stringToBase64(deviceInfoStr);

  const ts = String(Date.now());
  const nonce = crypto.randomUUID();
  const appSig = await buildAppSignature(
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
        'Nothing Cloud temporarily rate-limited requests from Cloudflare datacenter IP (HTTP 429). Please use the TOKEN tab to sign in directly.'
      );
    }
    const errText = await reportRes.text();
    throw new Error(`Nothing device registration failed (${reportRes.status}): ${errText}`);
  }

  const reportData = (await reportRes.json()) as any;
  cachedIdentity = {
    deviceId: reportData.device_id,
    privateKey: keyPair.privateKey,
    publicSpkiBase64,
    deviceInfoB64,
    nextRotationAt: reportData.next_key_rotation_at
      ? new Date(reportData.next_key_rotation_at).getTime()
      : Date.now() + 25 * 24 * 60 * 60 * 1000,
  };

  return cachedIdentity;
}

async function initAuthflowSession(email: string): Promise<AuthflowSession> {
  cleanupExpiredSessions();

  const cookies: Record<string, string> = {};
  const identity = await getOrCreateDeviceIdentity(cookies);
  const { deviceId, privateKey, publicSpkiBase64, deviceInfoB64 } = identity;

  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const codeVerifier = base64UrlEncodeBytes(verifierBytes);

  const challengeDigest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier)
  );
  const codeChallenge = base64UrlEncodeBytes(new Uint8Array(challengeDigest));

  const stateBytes = new Uint8Array(16);
  crypto.getRandomValues(stateBytes);
  const oauthState = base64UrlEncodeBytes(stateBytes);

  const authorizeParams = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email offline_access',
    state: oauthState,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
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
  let loginFlow = 'default';

  if (location) {
    try {
      const locUrl = new URL(location, SSO_ORIGIN);
      xRef = locUrl.searchParams.get('x_ref') || '';
      loginFlow = locUrl.searchParams.get('login_flow') || 'default';
    } catch {}
  }
  if (!xRef && cookies['__Host-oauth_session_id']) {
    xRef = cookies['__Host-oauth_session_id'];
  }

  const afPath = '/api/v2/authflow';
  const afBody = JSON.stringify({ type: 'login', name: loginFlow || 'default' });
  const afHeaders = await buildDeviceHeaders(identity, afPath, afBody, {
    ...(xRef ? { 'X-OAuth-Session-Id': xRef } : {}),
    ...(Object.keys(cookies).length ? { Cookie: formatCookieHeader(cookies) } : {}),
  });

  const afRes = await fetch(`${API_V2_BASE}/authflow`, {
    method: 'POST',
    headers: afHeaders,
    body: afBody,
  });

  extractSetCookies(afRes, cookies);
  const afData = (await afRes.json().catch(() => ({}))) as any;
  if (!afRes.ok || !afData.state_token) {
    throw new Error(afData.message || 'Failed to start Nothing Account authentication flow');
  }

  const session: AuthflowSession = {
    id: crypto.randomUUID(),
    email,
    privateKey,
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
  const inputPath = '/api/v2/authflow/state/input';
  const headers = await buildDeviceHeaders(session, inputPath, bodyStr, {
    ...(session.xRef ? { 'X-OAuth-Session-Id': session.xRef } : {}),
    ...(Object.keys(session.cookies).length ? { Cookie: formatCookieHeader(session.cookies) } : {}),
  });

  const res = await fetch(`${API_V2_BASE}/authflow/state/input`, {
    method: 'POST',
    headers,
    body: bodyStr,
  });

  extractSetCookies(res, session.cookies);
  const data = (await res.json().catch(() => ({}))) as any;
  if (data?.state_token) {
    session.stateToken = data.state_token;
  }
  return { status: res.status, data };
}

async function resolveAuthorizationCode(session: AuthflowSession, actionData: any): Promise<string> {
  if (actionData?.authorization_code) {
    return actionData.authorization_code;
  }

  let currentUrl: string = actionData?.redirect_url || actionData?.redirectUrl || '';
  if (currentUrl) {
    const parsedInitial = new URL(currentUrl, SSO_ORIGIN);
    const directCode = parsedInitial.searchParams.get('code');
    if (directCode) return directCode;
    currentUrl = parsedInitial.toString();
  } else {
    const authorizeParams = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'openid profile email offline_access',
      state: session.oauthState,
      code_challenge: session.codeChallenge,
      code_challenge_method: 'S256',
    });
    currentUrl = `${API_V2_BASE}/oauth2/authorize?${authorizeParams.toString()}`;
  }

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

  throw new Error('Could not obtain OAuth2 authorization code from Nothing Account');
}

async function exchangeCodeForUser(session: AuthflowSession, code: string) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: session.codeVerifier,
  });
  const bodyStr = params.toString();
  const tokenPath = '/api/v2/oauth2/token';
  const headers = await buildDeviceHeaders(session, tokenPath, bodyStr, {
    'Content-Type': 'application/x-www-form-urlencoded',
    ...(Object.keys(session.cookies).length ? { Cookie: formatCookieHeader(session.cookies) } : {}),
  });

  const tokenRes = await fetch(`${API_V2_BASE}/oauth2/token`, {
    method: 'POST',
    headers,
    body: bodyStr,
  });

  const tokenData = (await tokenRes.json().catch(() => ({}))) as any;
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(
      tokenData.error_description ||
        tokenData.message ||
        `Nothing token exchange failed (${tokenRes.status})`
    );
  }

  authSessions.delete(session.id);

  let uuid = `nt_user_${Date.now()}`;
  let email = session.email;
  let userName = 'Nothing User';

  try {
    const parts = tokenData.access_token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(base64UrlDecodeToString(parts[1]));
      if (payload.uuid) uuid = payload.uuid;
      else if (payload.sub) uuid = `sub_${payload.sub}`;
      if (payload.email) email = payload.email;
      if (payload.given_name || payload.family_name) {
        userName = [payload.given_name, payload.family_name].filter(Boolean).join(' ');
      }
    }
  } catch {}

  return {
    uuid,
    email,
    userName,
    token: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
  };
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

export const onRequestOptions = async (): Promise<Response> => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const req = context.request;
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const { action, email, password, sessionId, code } = body;

    // 1. Verify 2FA OTP
    if (action === 'verify_otp') {
      if (!sessionId || !code) {
        return new Response(
          JSON.stringify({ success: false, error: 'Please enter the 6-digit verification code' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const session = authSessions.get(sessionId);
      if (!session) {
        return new Response(
          JSON.stringify({ success: false, error: 'Verification session expired. Please sign in again.' }),
          { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }

      const { status, data } = await postAuthflowInput(session, { code: String(code).trim() });
      if (status === 200 && data?.action?.type === 'finished') {
        const authCode = await resolveAuthorizationCode(session, data.action.data);
        const user = await exchangeCodeForUser(session, authCode);
        return new Response(JSON.stringify({ success: true, user }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({ success: false, error: data?.message || 'Invalid verification code' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Resend OTP
    if (action === 'resend_otp') {
      const session = authSessions.get(sessionId);
      if (!session) {
        return new Response(JSON.stringify({ success: false, error: 'Session expired' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      await postAuthflowInput(session, { resend: true });
      return new Response(JSON.stringify({ success: true, cooldownAt: Date.now() + 60000 }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 3. Email & Password Login
    if (!email || !password) {
      return new Response(JSON.stringify({ success: false, error: 'Email and password are required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const session = await initAuthflowSession(String(email).trim());

    // Step 1: Identify email
    const identRes = await postAuthflowInput(session, {
      identification: 'email',
      login_id: String(email).trim(),
    });

    if (identRes.status === 404) {
      authSessions.delete(session.id);
      return new Response(
        JSON.stringify({ success: false, error: 'No Nothing Account found with this email address.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (identRes.status !== 200 || !identRes.data?.action) {
      authSessions.delete(session.id);
      return new Response(
        JSON.stringify({ success: false, error: identRes.data?.message || 'Identification failed' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Submit password
    const pwdRes = await postAuthflowInput(session, {
      authentication: 'password',
      password: String(password).trim(),
    });

    if (pwdRes.status === 200 && pwdRes.data?.action) {
      const pwdAction = pwdRes.data.action;
      if (pwdAction.type === 'finished') {
        const code = await resolveAuthorizationCode(session, pwdAction.data);
        const user = await exchangeCodeForUser(session, code);
        return new Response(JSON.stringify({ success: true, user }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      if (isOtpAction(pwdAction)) {
        const actionData = pwdAction.data || {};
        return new Response(
          JSON.stringify({
            success: true,
            otpRequired: true,
            sessionId: session.id,
            maskedEmail: actionData.masked_destination || String(email).trim(),
            cooldownAt: actionData.cooldown_at ? Number(actionData.cooldown_at) : undefined,
          }),
          { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (pwdRes.status === 401 || pwdRes.status === 400) {
      authSessions.delete(session.id);
      return new Response(
        JSON.stringify({ success: false, error: 'Incorrect password for Nothing Account.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: pwdRes.data?.message || 'Authentication failed' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Authentication error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
};
