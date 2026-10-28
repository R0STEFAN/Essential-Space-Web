import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { computeForYouData } from '@/lib/foryou';
import { getUserCards, getUserCollections, getDismissedSuggestions } from '@/lib/storage';

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const cards = await getUserCards(user.uuid);
    const collections = await getUserCollections(user.uuid);
    const dismissed = await getDismissedSuggestions(user.uuid);
    const data = await computeForYouData(cards, collections, new Set(dismissed), user.token);
    return NextResponse.json({ success: true, ...data });
  } catch (err: any) {
    console.error('Failed to get For You data:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to get For You data' },
      { status: 500 }
    );
  }
}
