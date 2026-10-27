import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import type { NothingUser } from '@/types';

function getSecretKey(): string {
  return (
    process.env.SESSION_SECRET ||
    'nothing-essential-space-secret-key-32chars-minimum!'
  );
}

function getEncodedKey(): Uint8Array {
  return new TextEncoder().encode(getSecretKey());
}

export const COOKIE_NAME = 'nothing_session';

/**
 * Determines whether the session cookie should include the `Secure` flag.
 *
 * In self-hosted setups (Docker, local IPs, Coolify on HTTP), modern browsers
 * strictly reject cookies with the `Secure` attribute over plain HTTP.
 * Setting `Secure` over HTTP causes the browser to discard the cookie immediately,
 * resulting in endless redirect loops to `/login`.
 *
 * Here, we check:
 * 1. Explicit override via COOKIE_SECURE ('true' or 'false')
 * 2. Incoming request headers for HTTPS indicators (x-forwarded-proto, referer, origin)
 */
export async function isHttpsConnection(): Promise<boolean> {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;

  try {
    const headerList = await headers();
    const proto =
      headerList.get('x-forwarded-proto') ||
      headerList.get('x-forwarded-protocol') ||
      headerList.get('x-url-scheme');
    if (proto && proto.toLowerCase() === 'https') {
      return true;
    }

    const referer = headerList.get('referer');
    if (referer && referer.toLowerCase().startsWith('https://')) {
      return true;
    }

    const origin = headerList.get('origin');
    if (origin && origin.toLowerCase().startsWith('https://')) {
      return true;
    }
  } catch {
    // headers() might not be available in non-request contexts
  }

  return false;
}

export async function createSession(user: NothingUser) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  const isSecure = await isHttpsConnection();

  const session = await new SignJWT({
    uuid: user.uuid,
    email: user.email,
    userName: user.userName || user.email.split('@')[0],
    nickName: user.nickName,
    avatarLink: user.avatarLink,
    token: user.token,
    refreshToken: user.refreshToken,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getEncodedKey());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, session, {
    httpOnly: true,
    secure: isSecure,
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  });

  return session;
}

export async function getSession(): Promise<NothingUser | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(COOKIE_NAME)?.value;

  if (!session) return null;

  try {
    const { payload } = await jwtVerify(session, getEncodedKey(), {
      algorithms: ['HS256'],
    });

    return {
      uuid: payload.uuid as string,
      email: payload.email as string,
      userName: payload.userName as string,
      nickName: payload.nickName as string | undefined,
      avatarLink: payload.avatarLink as string | undefined,
      token: payload.token as string,
      refreshToken: payload.refreshToken as string | undefined,
    };
  } catch {
    return null;
  }
}

export async function deleteSession() {
  const cookieStore = await cookies();
  try {
    cookieStore.delete(COOKIE_NAME);
  } catch {
    // ignore
  }
  try {
    cookieStore.set(COOKIE_NAME, '', {
      httpOnly: true,
      secure: false,
      maxAge: 0,
      path: '/',
    });
  } catch {
    // ignore
  }
}
