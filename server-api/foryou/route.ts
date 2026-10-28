import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getForYouData } from '@/lib/foryou';

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await getForYouData(user.uuid, user.token);
    return NextResponse.json({ success: true, ...data });
  } catch (err: any) {
    console.error('Failed to get For You data:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to get For You data' },
      { status: 500 }
    );
  }
}
