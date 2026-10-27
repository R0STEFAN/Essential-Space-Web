import { NextResponse } from 'next/server';
import { getSession, createSession, deleteSession } from '@/lib/session';
import { syncUserData } from '@/lib/nothing-api';

export async function POST() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json(
      { success: false, authExpired: true, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const prevToken = user.token;
  const result = await syncUserData(user);

  if (user.token && user.token !== prevToken) {
    await createSession(user);
  }

  if (!result.success) {
    const isAuthError =
      result.error?.includes('AUTH_EXPIRED') ||
      result.error?.includes('401') ||
      result.error?.toLowerCase().includes('expired') ||
      result.error?.toLowerCase().includes('invalidated') ||
      result.error?.toLowerCase().includes('token validation failed');

    if (isAuthError) {
      await deleteSession();
      return NextResponse.json({ ...result, authExpired: true }, { status: 401 });
    }
    return NextResponse.json(result, { status: 500 });
  }

  return NextResponse.json(result);
}
