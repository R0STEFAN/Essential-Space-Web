import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  createSmartCollection,
  assignCardsToCollection,
  dismissSuggestion,
  getUserCards,
  getUserCollections,
  saveUserCollections,
} from '@/lib/storage';
import { createCloudCollection } from '@/lib/nothing-collections';
import { updateCloudCards } from '@/lib/nothing-cards';

export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, recommendationId, name, collectionId, collectionName, cardIds } = body;

    if (!recommendationId) {
      return NextResponse.json(
        { success: false, error: 'Missing recommendationId' },
        { status: 400 }
      );
    }

    if (action === 'CREATE_COLLECTION') {
      if (!name || !Array.isArray(cardIds) || cardIds.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Missing collection name or cardIds' },
          { status: 400 }
        );
      }

      let createdCollection: any = null;

      // 1. Create collection in Nothing Cloud if token is available
      if (user.token) {
        const cloudRes = await createCloudCollection(user.token, user.uuid, name);
        if (cloudRes.success && cloudRes.collection) {
          createdCollection = cloudRes.collection;
        }
      }

      // Fallback to local collection if cloud creation was skipped or failed
      if (!createdCollection) {
        createdCollection = await createSmartCollection(user.uuid, name, cardIds);
      } else {
        // Also save to server storage
        const currentColls = await getUserCollections(user.uuid);
        currentColls.push(createdCollection);
        await saveUserCollections(user.uuid, currentColls);
        await assignCardsToCollection(
          user.uuid,
          cardIds,
          createdCollection.collectionId,
          createdCollection.name
        );
      }

      // 2. Synchronize cards' collection assignment with Nothing Cloud
      if (user.token && createdCollection) {
        const allCards = await getUserCards(user.uuid);
        const matchingCards = allCards
          .filter(c => cardIds.includes(c.cardId))
          .map(c => ({
            ...c,
            collectionId: createdCollection.collectionId,
            collectionName: createdCollection.name,
          }));

        if (matchingCards.length > 0) {
          updateCloudCards(user.token, matchingCards).catch(err => {
            console.warn('Background Nothing Cloud card assignment failed:', err);
          });
        }
      }

      await dismissSuggestion(user.uuid, recommendationId);
      return NextResponse.json({ success: true, collection: createdCollection });
    }

    if (action === 'ADD_TO_COLLECTION') {
      if (!collectionId || !Array.isArray(cardIds) || cardIds.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Missing collectionId or cardIds' },
          { status: 400 }
        );
      }

      await assignCardsToCollection(user.uuid, cardIds, collectionId, collectionName);

      // Synchronize cards' collection assignment with Nothing Cloud
      if (user.token) {
        const allCards = await getUserCards(user.uuid);
        const matchingCards = allCards
          .filter(c => cardIds.includes(c.cardId))
          .map(c => ({
            ...c,
            collectionId,
            collectionName,
          }));

        if (matchingCards.length > 0) {
          updateCloudCards(user.token, matchingCards).catch(err => {
            console.warn('Background Nothing Cloud card assignment failed:', err);
          });
        }
      }

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
