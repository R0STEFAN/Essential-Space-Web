import { generateUuid } from './uuid';
import {
  NOTHING_BASE_URL,
  generateNothingAuthHeaders,
  generateWriteCipherSession,
  encryptPayload,
} from './crypto';
import { nothingFetch } from './nothing-fetch';
import { saveDbCollection, deleteDbCollection } from './db';
import type { Collection } from '@/types';

const DEVICE_MODEL = 'A059';

/**
 * Creates a new collection in Nothing Cloud and persists to local IndexedDB.
 */
export async function createCloudCollection(
  token: string,
  userId: string,
  name: string,
  color?: string
): Promise<{ success: boolean; collection?: Collection; error?: string }> {
  try {
    const collectionId = generateUuid();
    const now = Date.now();

    const newCollection: Collection = {
      collectionId,
      userId,
      name: name.trim(),
      color: color || '#D71921',
      updateTime: now,
      cardCount: 0,
    };

    // Prepare encrypted payload
    const { aesKeyB64, cipherKey } = generateWriteCipherSession();
    const payload = encryptPayload(DEVICE_MODEL, aesKeyB64);

    const body = {
      collections: [
        {
          collectionId,
          collectionName: newCollection.name,
          clientCreateTime: now,
          clientUpdateTime: now,
        },
      ],
      payload,
      cipherKey,
    };

    const targetUrl = `${NOTHING_BASE_URL}/storage/collection/v1/create`;
    const res = await nothingFetch(targetUrl, {
      method: 'POST',
      headers: generateNothingAuthHeaders(token),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || data?.code !== '00000') {
      const errorMsg = data?.msg || `Failed to create collection (HTTP ${res.status})`;
      console.error('Create collection failed:', errorMsg);
      return { success: false, error: errorMsg };
    }

    // Persist to local IndexedDB
    await saveDbCollection(newCollection);

    return { success: true, collection: newCollection };
  } catch (err: any) {
    console.error('Error creating collection:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Renames / updates an existing collection in Nothing Cloud and local IndexedDB.
 */
export async function updateCloudCollection(
  token: string,
  collectionId: string,
  name: string,
  color?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = Date.now();
    const trimmedName = name.trim();

    // Prepare encrypted payload
    const { aesKeyB64, cipherKey } = generateWriteCipherSession();
    const payload = encryptPayload(DEVICE_MODEL, aesKeyB64);

    const body = {
      collections: [
        {
          collectionId,
          collectionName: trimmedName,
          clientUpdateTime: now,
        },
      ],
      payload,
      cipherKey,
    };

    const targetUrl = `${NOTHING_BASE_URL}/storage/collection/v1/update`;
    const res = await nothingFetch(targetUrl, {
      method: 'POST',
      headers: generateNothingAuthHeaders(token),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || data?.code !== '00000') {
      const errorMsg = data?.msg || `Failed to update collection (HTTP ${res.status})`;
      return { success: false, error: errorMsg };
    }

    // Update in local IndexedDB
    await saveDbCollection({
      collectionId,
      userId: '', // preserved by bulkPut or read before
      name: trimmedName,
      color: color || '#D71921',
      updateTime: now,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error updating collection:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Deletes a collection from Nothing Cloud and local IndexedDB.
 */
export async function deleteCloudCollection(
  token: string,
  collectionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Prepare encrypted payload
    const { aesKeyB64, cipherKey } = generateWriteCipherSession();
    const payload = encryptPayload(DEVICE_MODEL, aesKeyB64);

    const body = {
      collectionIds: [collectionId],
      payload,
      cipherKey,
    };

    const targetUrl = `${NOTHING_BASE_URL}/storage/collection/v1/delete`;
    const res = await nothingFetch(targetUrl, {
      method: 'POST',
      headers: generateNothingAuthHeaders(token),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || data?.code !== '00000') {
      const errorMsg = data?.msg || `Failed to delete collection (HTTP ${res.status})`;
      return { success: false, error: errorMsg };
    }

    // Delete from local IndexedDB
    await deleteDbCollection(collectionId);

    return { success: true };
  } catch (err: any) {
    console.error('Error deleting collection:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}
