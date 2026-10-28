import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  createSmartCollection,
  assignCardsToCollection,
  dismissSuggestion,
} from '@/lib/storage';

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, recommendationId, name, collectionId, collectionName, cardIds } = body;

    if (!recommendationId) {
      return NextResponse.json({ success: false, error: 'Missing recommendationId' }, { status: 400 });
    }

    if (action === 'CREATE_COLLECTION') {
      if (!name || !Array.isArray(cardIds) || cardIds.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Missing collection name or cardIds' },
          { status: 400 }
        );
      }
      const newCollection = await createSmartCollection(user.uuid, name, cardIds);
      await dismissSuggestion(user.uuid, recommendationId);
      return NextResponse.json({ success: true, collection: newCollection });
    }

    if (action === 'ADD_TO_COLLECTION') {
      if (!collectionId || !Array.isArray(cardIds) || cardIds.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Missing collectionId or cardIds' },
          { status: 400 }
        );
      }
      await assignCardsToCollection(user.uuid, cardIds, collectionId, collectionName);
      await dismissSuggestion(user.uuid, recommendationId);
      return NextResponse.json({ success: true });
    }

    if (action === 'DISMISS') {
      await dismissSuggestion(user.uuid, recommendationId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('Failed to execute For You action:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to execute action' },
      { status: 500 }
    );
  }
}
