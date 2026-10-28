import fs from 'fs/promises';
import path from 'path';
import type { Card, Collection, NothingUser, SyncResult } from '@/types';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

async function ensureUserDir(userId: string) {
  const userDir = path.join(DATA_DIR, 'users', userId);
  await fs.mkdir(userDir, { recursive: true });
  return userDir;
}

export async function saveUserAuth(user: NothingUser): Promise<void> {
  const userDir = await ensureUserDir(user.uuid);
  const filePath = path.join(userDir, 'auth.json');
  await fs.writeFile(
    filePath,
    JSON.stringify({ ...user, updatedAt: Date.now() }, null, 2),
    'utf-8'
  );
}

export async function getUserAuth(userId: string): Promise<NothingUser | null> {
  try {
    const userDir = await ensureUserDir(userId);
    const filePath = path.join(userDir, 'auth.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function getLatestAuthorizedUser(): Promise<NothingUser | null> {
  try {
    const usersRoot = path.join(DATA_DIR, 'users');
    const entries = await fs.readdir(usersRoot, { withFileTypes: true });
    let latest: (NothingUser & { updatedAt?: number }) | null = null;

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('demo-')) continue;
      try {
        const authPath = path.join(usersRoot, entry.name, 'auth.json');
        const raw = await fs.readFile(authPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed?.token && (!latest || (parsed.updatedAt || 0) > (latest.updatedAt || 0))) {
          latest = parsed;
        }
      } catch {
        // ignore missing auth.json
      }
    }
    return latest;
  } catch {
    return null;
  }
}

export async function getUserCards(userId: string): Promise<Card[]> {
  try {
    const userDir = await ensureUserDir(userId);
    const filePath = path.join(userDir, 'cards.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

export async function saveUserCards(userId: string, cards: Card[]): Promise<void> {
  const userDir = await ensureUserDir(userId);
  const filePath = path.join(userDir, 'cards.json');
  const tempPath = path.join(userDir, `cards.json.tmp.${Date.now()}`);
  await fs.writeFile(tempPath, JSON.stringify(cards, null, 2), 'utf-8');
  await fs.rename(tempPath, filePath);
}

export async function getUserCollections(userId: string): Promise<Collection[]> {
  try {
    const userDir = await ensureUserDir(userId);
    const filePath = path.join(userDir, 'collections.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

export async function saveUserCollections(userId: string, collections: Collection[]): Promise<void> {
  const userDir = await ensureUserDir(userId);
  const filePath = path.join(userDir, 'collections.json');
  const tempPath = path.join(userDir, `collections.json.tmp.${Date.now()}`);
  await fs.writeFile(tempPath, JSON.stringify(collections, null, 2), 'utf-8');
  await fs.rename(tempPath, filePath);
}

export async function getUserSyncMetadata(userId: string): Promise<{ lastSyncTime: number; cardsCount: number }> {
  try {
    const userDir = await ensureUserDir(userId);
    const filePath = path.join(userDir, 'meta.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { lastSyncTime: 0, cardsCount: 0 };
  }
}

export async function saveUserSyncMetadata(userId: string, meta: { lastSyncTime: number; cardsCount: number }): Promise<void> {
  const userDir = await ensureUserDir(userId);
  const filePath = path.join(userDir, 'meta.json');
  await fs.writeFile(filePath, JSON.stringify(meta, null, 2), 'utf-8');
}

export async function updateCardStatus(userId: string, cardId: string, updates: Partial<Card>): Promise<Card | null> {
  const cards = await getUserCards(userId);
  const index = cards.findIndex(c => c.cardId === cardId);
  if (index === -1) return null;

  cards[index] = { ...cards[index], ...updates, updateTime: Date.now() };
  await saveUserCards(userId, cards);
  return cards[index];
}

export async function toggleTodoEvent(userId: string, cardId: string, eventId: string): Promise<Card | null> {
  const cards = await getUserCards(userId);
  const card = cards.find(c => c.cardId === cardId);
  if (!card || !card.events) return null;

  const event = card.events.find(e => e.eventId === eventId);
  if (!event) return null;

  event.check = event.check === 1 ? 0 : 1;
  card.updateTime = Date.now();
  await saveUserCards(userId, cards);
  return card;
}

export async function getDismissedSuggestions(userId: string): Promise<string[]> {
  try {
    const userDir = await ensureUserDir(userId);
    const filePath = path.join(userDir, 'dismissed_suggestions.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

export async function dismissSuggestion(userId: string, suggestionId: string): Promise<void> {
  const dismissed = await getDismissedSuggestions(userId);
  if (!dismissed.includes(suggestionId)) {
    dismissed.push(suggestionId);
    const userDir = await ensureUserDir(userId);
    const filePath = path.join(userDir, 'dismissed_suggestions.json');
    await fs.writeFile(filePath, JSON.stringify(dismissed, null, 2), 'utf-8');
  }
}

export async function assignCardsToCollection(
  userId: string,
  cardIds: string[],
  collectionId: string,
  collectionName?: string
): Promise<void> {
  const cards = await getUserCards(userId);
  let changed = false;
  for (const c of cards) {
    if (cardIds.includes(c.cardId)) {
      c.collectionId = collectionId;
      if (collectionName) c.collectionName = collectionName;
      c.updateTime = Date.now();
      changed = true;
    }
  }
  if (changed) {
    await saveUserCards(userId, cards);
  }
}

export async function createSmartCollection(
  userId: string,
  name: string,
  cardIds: string[]
): Promise<Collection> {
  const collections = await getUserCollections(userId);
  const newColl: Collection = {
    collectionId: `col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId,
    name,
    updateTime: Date.now(),
    cardCount: cardIds.length,
  };
  collections.push(newColl);
  await saveUserCollections(userId, collections);
  await assignCardsToCollection(userId, cardIds, newColl.collectionId, newColl.name);
  return newColl;
}
