import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getUserCards, getUserCollections, getUserSyncMetadata } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const collectionId = searchParams.get('collectionId');
  const type = searchParams.get('type');
  const tag = searchParams.get('tag')?.trim();
  const query = searchParams.get('query')?.toLowerCase();
  const trash = searchParams.get('trash') === 'true';

  let cards = await getUserCards(user.uuid);
  const collections = await getUserCollections(user.uuid);
  const meta = await getUserSyncMetadata(user.uuid);

  // Filter targetState (0 = active, 1 = trash)
  cards = cards.filter(c => (trash ? c.targetState === 1 : c.targetState === 0));

  if (collections.length > 0) {
    const collMap = new Map(collections.map(col => [col.collectionId, col.name]));
    cards = cards.map(c => ({
      ...c,
      collectionName:
        c.collectionName || (c.collectionId ? collMap.get(c.collectionId) : undefined),
    }));
  }

  const cardMatchesCollection = (
    card: (typeof cards)[number],
    col: (typeof collections)[number]
  ) => {
    if (card.collectionId && card.collectionId === col.collectionId) return true;
    if (col.name && Array.isArray(card.tags)) {
      const colNameLower = col.name.trim().toLowerCase();
      return card.tags.some(t => String(t).trim().toLowerCase() === colNameLower);
    }
    return false;
  };

  // Compute card count per collection across all active/trash cards
  const collWithCounts = collections.map(col => ({
    ...col,
    cardCount: cards.filter(c => cardMatchesCollection(c, col)).length,
  }));

  if (collectionId) {
    const selectedCol = collections.find(col => col.collectionId === collectionId);
    cards = cards.filter(c =>
      selectedCol ? cardMatchesCollection(c, selectedCol) : c.collectionId === collectionId
    );
  }

  if (type) {
    const upper = type.toUpperCase();
    if (upper === 'AUDIO') {
      cards = cards.filter(c => c.type === 'AUDIO' || Boolean(c.audio?.audioUri));
    } else if (upper === 'TODO') {
      cards = cards.filter(c => c.type === 'TODO' || Boolean(c.events && c.events.length > 0));
    } else {
      cards = cards.filter(c => c.type === upper);
    }
  }

  // Compute available tags and their counts across the current view (before tag filter)
  const tagCountMap = new Map<string, { name: string; count: number }>();
  for (const c of cards) {
    if (Array.isArray(c.tags)) {
      const seenOnCard = new Set<string>();
      for (const rawTag of c.tags) {
        const clean = String(rawTag).trim();
        if (!clean) continue;
        const key = clean.toLowerCase();
        if (seenOnCard.has(key)) continue;
        seenOnCard.add(key);
        const existing = tagCountMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          tagCountMap.set(key, { name: clean, count: 1 });
        }
      }
    }
  }
  const tags = Array.from(tagCountMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  );

  if (tag) {
    const tagLower = tag.toLowerCase();
    cards = cards.filter(c => c.tags?.some(t => String(t).trim().toLowerCase() === tagLower));
  }

  if (query) {
    cards = cards.filter(c => {
      const titleMatch = c.title?.toLowerCase().includes(query);
      const contentMatch = c.content?.toLowerCase().includes(query);
      const summaryMatch = c.summary?.toLowerCase().includes(query);
      const transcriptMatch = c.audio?.transcript?.toLowerCase().includes(query);
      const linkMatch =
        c.link?.title?.toLowerCase().includes(query) || c.link?.url?.toLowerCase().includes(query);
      const eventMatch = c.events?.some(e => e.title.toLowerCase().includes(query));
      const tagMatch = c.tags?.some(t => String(t).toLowerCase().includes(query));
      const bulletMatch = c.bulletPoints?.some(b => b.toLowerCase().includes(query));
      return (
        titleMatch ||
        contentMatch ||
        summaryMatch ||
        transcriptMatch ||
        linkMatch ||
        eventMatch ||
        tagMatch ||
        bulletMatch
      );
    });
  }

  // Sort newest first
  cards.sort((a, b) => b.createTime - a.createTime);

  return NextResponse.json({
    success: true,
    cards,
    collections: collWithCounts,
    tags,
    lastSyncTime: meta.lastSyncTime,
    user: {
      uuid: user.uuid,
      email: user.email,
      userName: user.userName,
      token: user.token,
    },
  });
}
