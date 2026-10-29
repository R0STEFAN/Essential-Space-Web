import type { Card, Collection } from '@/types';
import { md5, NOTHING_BASE_URL, NOTHING_API_KEY } from './crypto';
import { nothingFetch } from './nothing-fetch';

function getNothingAuthHeaders(token: string) {
  const ts = Date.now().toString();
  const auth = md5(NOTHING_API_KEY + ts);

  return {
    'Authorization': `Bearer ${token}`,
    'timestamp': ts,
    'auth': auth,
    'Content-Type': 'application/json; charset=UTF-8',
    'User-Agent': 'okhttp/4.12.0',
  };
}

export interface ForYouTask {
  eventId: string;
  cardId: string;
  title: string;
  content?: string;
  check: number; // 0 or 1
  time?: number;
  isPotentialReminder?: boolean;
  cardTitle: string;
  cardType: string;
  cardCreateTime: number;
}

export interface ForYouRecommendation {
  id: string;
  type: 'CREATE_COLLECTION' | 'ADD_TO_COLLECTION';
  title: string;
  suggestedName: string;
  collectionId?: string;
  cardIds: string[];
  previewCards: Array<{
    cardId: string;
    title: string;
    type: string;
    imageUrl?: string;
    summary?: string;
    tags?: string[];
  }>;
  reason?: string;
}

export interface ForYouData {
  tasks: ForYouTask[];
  recommendations: ForYouRecommendation[];
  stats: {
    totalPendingTasks: number;
    totalCompletedTasks: number;
    totalSuggestions: number;
    totalCards: number;
  };
}

/**
 * Attempts to request AI collection name from Nothing Cloud API,
 * matching com.nothing.ai.service.engine.remote.NothingApiManager.getSmartCollectionName
 */
async function fetchNothingSmartCollectionName(
  token: string | undefined,
  cardTitles: string[]
): Promise<string | null> {
  if (!token || cardTitles.length === 0) return null;

  try {
    const res = await nothingFetch(`${NOTHING_BASE_URL}/ai/v1/getSmartCollectionName`, {
      method: 'POST',
      headers: getNothingAuthHeaders(token),
      body: JSON.stringify({
        cardTitles: cardTitles.slice(0, 10),
        language: 'en',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.data?.name && typeof data.data.name === 'string') {
        return data.data.name.trim();
      }
    }
  } catch (err) {
    // Graceful fallback to heuristic
  }
  return null;
}

/**
 * Clean fallback title generator from keywords/hashtags
 */
function generateFallbackCollectionName(tags: string[], titles: string[]): string {
  if (tags.length > 0) {
    const rawTag = tags[0].replace(/^#/, '');
    return rawTag.charAt(0).toUpperCase() + rawTag.slice(1);
  }

  // Extract recurring keywords
  const stopWords = new Set([
    'and', 'the', 'for', 'with', 'from', 'about', 'note', 'saved', 'capture', 'new', 'item', 'meeting',
    'this', 'that', 'voice', 'untitled', 'link', 'today', 'work'
  ]);

  const words = titles
    .flatMap(t => t.toLowerCase().split(/[\s,.:;_\-]+/))
    .filter(w => w.length > 3 && !stopWords.has(w));

  const freqMap = new Map<string, number>();
  for (const w of words) {
    freqMap.set(w, (freqMap.get(w) || 0) + 1);
  }

  const sorted = Array.from(freqMap.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 0) {
    const topWord = sorted[0][0];
    return topWord.charAt(0).toUpperCase() + topWord.slice(1);
  }

  return 'General Captures';
}

export async function computeForYouData(
  cards: Card[],
  collections: Collection[],
  dismissedIds: Set<string>,
  token?: string
): Promise<ForYouData> {
  // Only consider active, non-trashed cards
  const activeCards = cards.filter(c => c.targetState === 0);

  // 1. Gather all tasks & reminders from cards
  const tasks: ForYouTask[] = [];
  for (const card of activeCards) {
    if (Array.isArray(card.events) && card.events.length > 0) {
      for (const ev of card.events) {
        if (!ev.title || ev.isPotentialReminder) continue;
        tasks.push({
          eventId: ev.eventId,
          cardId: card.cardId,
          title: ev.title,
          content: ev.content,
          check: ev.check === 1 ? 1 : 0,
          time: ev.time,
          isPotentialReminder: ev.isPotentialReminder,
          cardTitle: card.title || 'Untitled Note',
          cardType: card.type,
          cardCreateTime: card.createTime,
        });
      }
    }
  }

  // Sort tasks: pending first, then by time (soonest first), then creation date
  tasks.sort((a, b) => {
    if (a.check !== b.check) return a.check - b.check;
    if (a.time && b.time) return a.time - b.time;
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    return b.cardCreateTime - a.cardCreateTime;
  });

  // 2. Compute Smart Recommendations
  const recommendations: ForYouRecommendation[] = [];
  const unassignedCards = activeCards.filter(c => !c.collectionId);

  // A. Check for notes matching existing collections
  for (const coll of collections) {
    const collNameLower = coll.name.toLowerCase();
    const collId = coll.collectionId;

    // Existing cards in this collection to discover vocabulary/tags
    const existingCollCards = activeCards.filter(c => c.collectionId === collId);
    const collTags = new Set(
      existingCollCards.flatMap(c => (c.tags || []).map(t => t.toLowerCase().replace(/^#/, '')))
    );

    const matchingUnassigned: Card[] = [];
    for (const card of unassignedCards) {
      const cardTitleLower = (card.title || '').toLowerCase();
      const cardSummaryLower = (card.summary || '').toLowerCase();
      const cardTags = (card.tags || []).map(t => t.toLowerCase().replace(/^#/, ''));

      const hasTagMatch = cardTags.some(t => collTags.has(t));
      const hasNameMatch =
        collNameLower.length > 2 &&
        (cardTitleLower.includes(collNameLower) || cardSummaryLower.includes(collNameLower));

      if (hasTagMatch || hasNameMatch) {
        matchingUnassigned.push(card);
      }
    }

    if (matchingUnassigned.length > 0) {
      const recId = `rec_add_${collId}_${matchingUnassigned.map(c => c.cardId.slice(0, 4)).sort().join('')}`;
      if (!dismissedIds.has(recId)) {
        recommendations.push({
          id: recId,
          type: 'ADD_TO_COLLECTION',
          title: `Add to your "${coll.name}" collection?`,
          suggestedName: coll.name,
          collectionId: collId,
          cardIds: matchingUnassigned.map(c => c.cardId),
          previewCards: matchingUnassigned.slice(0, 3).map(c => ({
            cardId: c.cardId,
            title: c.title || 'Note',
            type: c.type,
            imageUrl: c.imageUrl || c.link?.preview,
            summary: c.summary,
            tags: c.tags,
          })),
          reason: `Found ${matchingUnassigned.length} notes relevant to "${coll.name}"`,
        });
      }
    }
  }

  // B. Discover new themes among unassigned cards
  // Group by common hashtag
  const tagClusters = new Map<string, Card[]>();
  for (const card of unassignedCards) {
    if (Array.isArray(card.tags)) {
      for (const t of card.tags) {
        const cleanTag = t.trim().toLowerCase().replace(/^#/, '');
        if (cleanTag.length > 2) {
          const list = tagClusters.get(cleanTag) || [];
          list.push(card);
          tagClusters.set(cleanTag, list);
        }
      }
    }
  }

  // Find clusters with >= 2 notes
  for (const [tag, clusterCards] of tagClusters.entries()) {
    if (clusterCards.length >= 2) {
      const recId = `rec_new_tag_${tag}`;
      if (
        !dismissedIds.has(recId) &&
        !collections.some(c => c.name.toLowerCase() === tag.toLowerCase())
      ) {
        const titles = clusterCards.map(c => c.title || 'Note');
        const aiName = await fetchNothingSmartCollectionName(token, titles);
        const finalName = aiName || tag.charAt(0).toUpperCase() + tag.slice(1);

        recommendations.push({
          id: recId,
          type: 'CREATE_COLLECTION',
          title: `Create a "${finalName}" collection?`,
          suggestedName: finalName,
          cardIds: clusterCards.map(c => c.cardId),
          previewCards: clusterCards.slice(0, 3).map(c => ({
            cardId: c.cardId,
            title: c.title || 'Note',
            type: c.type,
            imageUrl: c.imageUrl || c.link?.preview,
            summary: c.summary,
            tags: c.tags,
          })),
          reason: `${clusterCards.length} notes share #${tag}`,
        });
      }
    }
  }

  // Group by common domains for links if no hashtag clusters
  if (recommendations.length < 2) {
    const domainClusters = new Map<string, Card[]>();
    for (const card of unassignedCards) {
      if (card.type === 'LINK' && card.link?.domain) {
        const domain = card.link.domain.replace(/^www\./, '').toLowerCase();
        const list = domainClusters.get(domain) || [];
        list.push(card);
        domainClusters.set(domain, list);
      }
    }

    for (const [dom, domCards] of domainClusters.entries()) {
      if (domCards.length >= 2) {
        const recId = `rec_dom_${dom.replace(/[^a-z0-9]/g, '_')}`;
        const domName = dom.split('.')[0];
        const finalName = domName.charAt(0).toUpperCase() + domName.slice(1);
        if (!dismissedIds.has(recId) && !collections.some(c => c.name.toLowerCase() === finalName.toLowerCase())) {
          recommendations.push({
            id: recId,
            type: 'CREATE_COLLECTION',
            title: `Create a "${finalName}" collection?`,
            suggestedName: finalName,
            cardIds: domCards.map(c => c.cardId),
            previewCards: domCards.slice(0, 3).map(c => ({
              cardId: c.cardId,
              title: c.title || 'Link',
              type: c.type,
              imageUrl: c.imageUrl || c.link?.preview,
              summary: c.summary,
            })),
            reason: `${domCards.length} links saved from ${dom}`,
          });
        }
      }
    }
  }

  // C. Fallback cluster for remaining unassigned cards if >= 3
  if (recommendations.length === 0 && unassignedCards.length >= 3) {
    const candidateCards = unassignedCards.slice(0, 4);
    const recId = `rec_unassigned_cluster`;
    if (!dismissedIds.has(recId)) {
      const titles = candidateCards.map(c => c.title || 'Note');
      const allTags = candidateCards.flatMap(c => c.tags || []);
      const aiName = await fetchNothingSmartCollectionName(token, titles);
      const finalName = aiName || generateFallbackCollectionName(allTags, titles);

      if (!collections.some(c => c.name.toLowerCase() === finalName.toLowerCase())) {
        recommendations.push({
          id: recId,
          type: 'CREATE_COLLECTION',
          title: `Create a "${finalName}" collection?`,
          suggestedName: finalName,
          cardIds: candidateCards.map(c => c.cardId),
          previewCards: candidateCards.slice(0, 3).map(c => ({
            cardId: c.cardId,
            title: c.title || 'Note',
            type: c.type,
            imageUrl: c.imageUrl || c.link?.preview,
            summary: c.summary,
            tags: c.tags,
          })),
          reason: `Group ${candidateCards.length} recent uncategorized captures`,
        });
      }
    }
  }

  const totalPending = tasks.filter(t => t.check === 0).length;
  const totalCompleted = tasks.filter(t => t.check === 1).length;

  return {
    tasks,
    recommendations: recommendations.slice(0, 6),
    stats: {
      totalPendingTasks: totalPending,
      totalCompletedTasks: totalCompleted,
      totalSuggestions: recommendations.length,
      totalCards: activeCards.length,
    },
  };
}
