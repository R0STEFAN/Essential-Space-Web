import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { toggleTodoEvent } from '@/lib/storage';
import { updateCloudCard } from '@/lib/nothing-cards';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { id: cardId } = await params;
  const { eventId } = await req.json();

  if (!eventId) {
    return NextResponse.json({ success: false, error: 'Missing eventId' }, { status: 400 });
  }

  const updatedCard = await toggleTodoEvent(user.uuid, cardId, eventId);
  if (!updatedCard) {
    return NextResponse.json({ success: false, error: 'Card or Event not found' }, { status: 404 });
  }

  // Synchronize toggled checklist event with Nothing Cloud
  if (user.token) {
    updateCloudCard(user.token, updatedCard).catch(err => {
      console.warn('Background Nothing Cloud todo sync failed:', err);
    });
  }

  return NextResponse.json({ success: true, card: updatedCard });
}
