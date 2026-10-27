import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { NothingUser } from '@/types';

const SECRET_KEY = process.env.SESSION_SECRET || 'nothing-essential-space-secret-key-32chars-minimum!';
const encodedKey = new TextEncoder().encode(SECRET_KEY);
const COOKIE_NAME = 'nothing_session';

export async function createSession(user: NothingUser) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
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
    .sign(encodedKey);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
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
    const { payload } = await jwtVerify(session, encodedKey, {
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
  cookieStore.delete(COOKIE_NAME);
}
