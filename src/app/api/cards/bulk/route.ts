import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  getUserCards,
  getUserCollections,
  bulkUpdateCardsTargetState,
  bulkDeleteCardsPermanently,
  assignCardsToCollection,
} from '@/lib/storage';
import {
  bulkDeleteCloudCards,
  bulkRestoreCloudCards,
  bulkHardDeleteCloudCards,
  bulkAssignCollectionCloudCards,
} from '@/lib/nothing-cards';

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action, cardIds, collectionId, collectionName } = await req.json();

    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No cards selected' }, { status: 400 });
    }

    const allCards = await getUserCards(user.uuid);
    const selectedCards = allCards.filter(c => cardIds.includes(c.cardId));

    if (action === 'DELETE') {
      // 1. Sync soft delete with Nothing Cloud
      if (user.token) {
        bulkDeleteCloudCards(user.token, cardIds).catch(err => {
          console.warn('Background Nothing Cloud bulk delete failed:', err);
        });
      }

      // 2. Update local server storage
      const updated = await bulkUpdateCardsTargetState(user.uuid, cardIds, 1);
      return NextResponse.json({ success: true, action, count: updated.length, updatedCards: updated });
    }

    if (action === 'RESTORE') {
      // 1. Sync restore with Nothing Cloud
      if (user.token) {
        bulkRestoreCloudCards(user.token, cardIds).catch(err => {
          console.warn('Background Nothing Cloud bulk restore failed:', err);
        });
      }

      // 2. Update local server storage
      const updated = await bulkUpdateCardsTargetState(user.uuid, cardIds, 0);
      return NextResponse.json({ success: true, action, count: updated.length, updatedCards: updated });
    }

    if (action === 'PERMANENT_DELETE') {
      // 1. Sync hard delete with Nothing Cloud
      if (user.token) {
        bulkHardDeleteCloudCards(user.token, cardIds).catch(err => {
          console.warn('Background Nothing Cloud permanent delete failed:', err);
        });
      }

      // 2. Permanently remove from local server storage
      const deletedIds = await bulkDeleteCardsPermanently(user.uuid, cardIds);
      return NextResponse.json({ success: true, action, count: deletedIds.length, deletedCardIds: deletedIds });
    }

    if (action === 'ASSIGN_COLLECTION') {
      // 1. Sync collection change with Nothing Cloud
      if (user.token) {
        bulkAssignCollectionCloudCards(user.token, selectedCards, collectionId).catch(err => {
          console.warn('Background Nothing Cloud bulk collection update failed:', err);
        });
      }

      // 2. Update local server storage
      const updated = await assignCardsToCollection(
        user.uuid,
        cardIds,
        collectionId,
        collectionName
      );
      return NextResponse.json({
        success: true,
        action,
        count: updated.length,
        updatedCards: updated,
        collectionId,
      });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    console.error('Error in /api/cards/bulk:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
