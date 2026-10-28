import Dexie, { type Table } from 'dexie';
import type { Card, Collection, NothingUser } from '@/types';

export interface SyncQueueItem {
  id: string;
  action:
    | 'CREATE_CARD'
    | 'UPDATE_CARD'
    | 'DELETE_CARD'
    | 'CREATE_COLLECTION'
    | 'UPDATE_COLLECTION'
    | 'DELETE_COLLECTION'
    | 'TOGGLE_TODO';
  payload: any;
  timestamp: number;
  retries: number;
}

export interface AppMetadata {
  key: string;
  value: any;
  updatedAt: number;
}

export interface DismissedSuggestion {
  id: string;
  dismissedAt: number;
}

export class EssentialSpaceDB extends Dexie {
  cards!: Table<Card, string>;
  collections!: Table<Collection, string>;
  auth!: Table<NothingUser, string>;
  meta!: Table<AppMetadata, string>;
  dismissedSuggestions!: Table<DismissedSuggestion, string>;
  syncQueue!: Table<SyncQueueItem, string>;

  constructor() {
    super('EssentialSpaceDB');
    this.version(1).stores({
      cards: 'cardId, userId, targetState, type, createTime, updateTime, collectionId',
      collections: 'collectionId, userId, name, updateTime',
      auth: 'uuid',
      meta: 'key',
      dismissedSuggestions: 'id, dismissedAt',
      syncQueue: 'id, action, timestamp',
    });
  }
}

// Global singleton instance
export const db = new EssentialSpaceDB();

/**
 * Checks if running in browser environment with IndexedDB support
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

/**
 * Retrieve all cards from IndexedDB with optional filtering
 */
export async function getDbCards(options?: {
  trash?: boolean;
  collectionId?: string;
  type?: string;
}): Promise<Card[]> {
  if (!isBrowser()) return [];
  try {
    let collection = db.cards.toCollection();

    if (options?.trash !== undefined) {
      const targetState = options.trash ? 1 : 0;
      collection = db.cards.where('targetState').equals(targetState);
    }

    let results = await collection.toArray();

    if (options?.collectionId) {
      results = results.filter(c => c.collectionId === options.collectionId);
    }

    if (options?.type) {
      results = results.filter(c => c.type.toUpperCase() === options.type?.toUpperCase());
    }

    // Sort by createTime descending
    return results.sort((a, b) => b.createTime - a.createTime);
  } catch (err) {
    console.error('Failed to get cards from IndexedDB:', err);
    return [];
  }
}

/**
 * Save or bulk update cards in IndexedDB
 */
export async function saveDbCards(cards: Card[]): Promise<void> {
  if (!isBrowser() || cards.length === 0) return;
  try {
    await db.cards.bulkPut(cards);
  } catch (err) {
    console.error('Failed to save cards to IndexedDB:', err);
  }
}

/**
 * Update a single card
 */
export async function updateDbCard(cardId: string, changes: Partial<Card>): Promise<void> {
  if (!isBrowser()) return;
  try {
    await db.cards.update(cardId, changes);
  } catch (err) {
    console.error(`Failed to update card ${cardId} in IndexedDB:`, err);
  }
}

/**
 * Delete a card from IndexedDB
 */
export async function deleteDbCard(cardId: string): Promise<void> {
  if (!isBrowser()) return;
  try {
    await db.cards.delete(cardId);
  } catch (err) {
    console.error(`Failed to delete card ${cardId} from IndexedDB:`, err);
  }
}

/**
 * Retrieve all collections from IndexedDB
 */
export async function getDbCollections(): Promise<Collection[]> {
  if (!isBrowser()) return [];
  try {
    return await db.collections.toArray();
  } catch (err) {
    console.error('Failed to get collections from IndexedDB:', err);
    return [];
  }
}

/**
 * Save or bulk update collections in IndexedDB
 */
export async function saveDbCollections(collections: Collection[]): Promise<void> {
  if (!isBrowser() || collections.length === 0) return;
  try {
    await db.collections.bulkPut(collections);
  } catch (err) {
    console.error('Failed to save collections to IndexedDB:', err);
  }
}

/**
 * Save a single collection
 */
export async function saveDbCollection(collection: Collection): Promise<void> {
  if (!isBrowser()) return;
  try {
    await db.collections.put(collection);
  } catch (err) {
    console.error('Failed to save collection to IndexedDB:', err);
  }
}

/**
 * Delete a collection
 */
export async function deleteDbCollection(collectionId: string): Promise<void> {
  if (!isBrowser()) return;
  try {
    await db.collections.delete(collectionId);
  } catch (err) {
    console.error(`Failed to delete collection ${collectionId} from IndexedDB:`, err);
  }
}

/**
 * Store authenticated user in IndexedDB
 */
export async function saveDbAuth(user: NothingUser): Promise<void> {
  if (!isBrowser()) return;
  try {
    await db.auth.clear();
    await db.auth.put(user);
  } catch (err) {
    console.error('Failed to save auth to IndexedDB:', err);
  }
}

/**
 * Retrieve authenticated user from IndexedDB
 */
export async function getDbAuth(): Promise<NothingUser | null> {
  if (!isBrowser()) return null;
  try {
    const users = await db.auth.toArray();
    return users.length > 0 ? users[0] : null;
  } catch (err) {
    console.error('Failed to get auth from IndexedDB:', err);
    return null;
  }
}

/**
 * Clear authenticated user from IndexedDB (logout)
 */
export async function clearDbAuth(): Promise<void> {
  if (!isBrowser()) return;
  try {
    await db.auth.clear();
  } catch (err) {
    console.error('Failed to clear auth from IndexedDB:', err);
  }
}

/**
 * Set metadata key-value
 */
export async function setDbMeta(key: string, value: any): Promise<void> {
  if (!isBrowser()) return;
  try {
    await db.meta.put({ key, value, updatedAt: Date.now() });
  } catch (err) {
    console.error(`Failed to set metadata ${key}:`, err);
  }
}

/**
 * Get metadata value
 */
export async function getDbMeta<T = any>(key: string): Promise<T | null> {
  if (!isBrowser()) return null;
  try {
    const record = await db.meta.get(key);
    return record ? (record.value as T) : null;
  } catch (err) {
    console.error(`Failed to get metadata ${key}:`, err);
    return null;
  }
}

/**
 * Get IDs of dismissed recommendations
 */
export async function getDbDismissedSuggestions(): Promise<string[]> {
  if (!isBrowser()) return [];
  try {
    const records = await db.dismissedSuggestions.toArray();
    return records.map(r => r.id);
  } catch (err) {
    console.error('Failed to get dismissed suggestions:', err);
    return [];
  }
}

/**
 * Mark a recommendation as dismissed
 */
export async function dismissDbSuggestion(id: string): Promise<void> {
  if (!isBrowser()) return;
  try {
    await db.dismissedSuggestions.put({ id, dismissedAt: Date.now() });
  } catch (err) {
    console.error(`Failed to dismiss suggestion ${id}:`, err);
  }
}

/**
 * Clear all data from local IndexedDB
 */
export async function clearAllDbData(): Promise<void> {
  if (!isBrowser()) return;
  try {
    await db.cards.clear();
    await db.collections.clear();
    await db.auth.clear();
    await db.meta.clear();
    await db.dismissedSuggestions.clear();
    await db.syncQueue.clear();
  } catch (err) {
    console.error('Failed to clear IndexedDB:', err);
  }
}
