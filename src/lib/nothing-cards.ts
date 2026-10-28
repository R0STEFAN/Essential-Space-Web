import { generateUuid } from './uuid';
import {
  NOTHING_BASE_URL,
  generateNothingAuthHeaders,
  generateWriteCipherSession,
  encryptPayload,
} from './crypto';
import { nothingFetch } from './nothing-fetch';
import { saveDbCards, updateDbCard, deleteDbCard } from './db';
import type { Card, CardType, CardEvent } from '@/types';

const DEVICE_MODEL = 'A059';

/**
 * Format timestamp string matching Nothing Android ScreenshotEngine.getUserContent
 */
function formatAiTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

export interface AiAnalysisResult {
  title?: string;
  summary?: string;
  bulletPoints?: string[];
  bulletPointsTitle?: string;
  infoExtract?: Array<{ title: string; value: string }>;
  events?: CardEvent[];
  tags?: string[];
  raw?: any;
}

/**
 * Dispatches a Text, Link, or Image analysis request to Nothing Cloud AI (ai/v3/imageRequest)
 */
export async function requestNothingAiAnalysis(params: {
  token: string;
  promptType: 'TEXT' | 'SHARE_SHEET' | 'IMG';
  userText?: string;
  url?: string;
  linkPreviewMeta?: { title?: string; description?: string; preview?: string };
  s3FileKey?: string;
  language?: string;
}): Promise<AiAnalysisResult | null> {
  try {
    const lang = params.language || 'uk';
    const timeStr = formatAiTimestamp();
    const promptUserContent = `Current Time: ${timeStr}, Output Language: ${lang}, Request: ${params.userText || ''}`;

    const body = {
      aiType: 0,
      promptType: params.promptType,
      promptVersion: 2,
      s3Region: 'europe-west3',
      s3FileKey: params.s3FileKey || '',
      storageType: 'GCS',
      userContent: promptUserContent,
      shareSheetUrl: params.url || '',
      copyToShare: params.linkPreviewMeta?.description || params.linkPreviewMeta?.title || '',
      modelCode: DEVICE_MODEL,
    };

    const targetUrl = `${NOTHING_BASE_URL}/ai/v3/imageRequest`;
    const res = await nothingFetch(targetUrl, {
      method: 'POST',
      headers: generateNothingAuthHeaders(params.token),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`Nothing AI returned HTTP ${res.status}`);
      return null;
    }

    const json = await res.json().catch(() => null);
    if (!json || json.code !== '00000' || !json.data) {
      console.warn('Nothing AI error response:', json);
      return null;
    }

    const d = json.data;

    // Normalize tags
    const rawTags = d.hashtags || d.tags || [];
    const tags = Array.isArray(rawTags)
      ? rawTags.map((t: string) => (t.startsWith('#') ? t : `#${t}`))
      : [];

    // Normalize events / todos
    const rawEvents = d.card_events || d.events || d.todo_list || [];
    const events: CardEvent[] = Array.isArray(rawEvents)
      ? rawEvents.map((ev: any, idx: number) => ({
          eventId: ev.event_id || ev.eventId || `ev_${Date.now()}_${idx}`,
          cardId: '',
          title: ev.event_desc || ev.title || 'Task',
          content: ev.content || '',
          check: ev.check === 1 ? 1 : 0,
          time: ev.time || ev.start_timestamp,
          isPotentialReminder: ev.is_potential_reminder ?? true,
        }))
      : [];

    // Normalize bullet points
    let bulletPoints: string[] = [];
    if (Array.isArray(d.bullet_points)) {
      bulletPoints = d.bullet_points;
    } else if (Array.isArray(d.bulletPoints)) {
      bulletPoints = d.bulletPoints;
    } else if (typeof d.bullet_points === 'string') {
      bulletPoints = d.bullet_points.split('\n').filter(Boolean);
    }

    return {
      title: d.title || d.card_title,
      summary: d.summary || d.card_summary,
      bulletPoints,
      bulletPointsTitle: d.bullet_points_title || 'Key Points',
      infoExtract: Array.isArray(d.info_extract) ? d.info_extract : undefined,
      events,
      tags,
      raw: d,
    };
  } catch (err) {
    console.error('Failed to call Nothing AI:', err);
    return null;
  }
}

/**
 * Dispatches an Audio/Voice note analysis request to Nothing Cloud AI (ai/v2/audioRequest)
 * Powered by Gemini 2.0 Flash on Nothing Cloud
 */
export async function requestAudioAiAnalysis(params: {
  token: string;
  s3FileKey: string;
  audioDurationMs: number;
  userText?: string;
  language?: string;
}): Promise<AiAnalysisResult & { transcript?: string } | null> {
  try {
    const lang = params.language || 'uk';
    const startTimeIso = new Date().toISOString();

    const payloadContent = JSON.stringify({
      deviceInfo: DEVICE_MODEL,
      audioDuration: params.audioDurationMs,
    });

    const { aesKeyB64, cipherKey } = generateWriteCipherSession();
    const payload = encryptPayload(payloadContent, aesKeyB64);

    const body = {
      s3Region: 'europe-west3',
      s3FileKey: params.s3FileKey,
      storageType: 'GCS',
      userContent: params.userText || '',
      clickEvents: [],
      imgEvents: [],
      textEvents: [],
      promptVersion: 2,
      payload,
      cipherKey,
      location: 'AD',
      language: lang,
      startRecordingTime: startTimeIso,
    };

    const targetUrl = `${NOTHING_BASE_URL}/ai/v2/audioRequest`;
    const res = await nothingFetch(targetUrl, {
      method: 'POST',
      headers: generateNothingAuthHeaders(params.token),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`Nothing Audio AI returned HTTP ${res.status}`);
      return null;
    }

    const json = await res.json().catch(() => null);
    if (!json || json.code !== '00000' || !json.data) {
      console.warn('Nothing Audio AI error response:', json);
      return null;
    }

    const d = json.data;

    // Normalize tags
    const rawTags = d.hashtags || d.tags || [];
    const tags = Array.isArray(rawTags)
      ? rawTags.map((t: string) => (t.startsWith('#') ? t : `#${t}`))
      : [];

    // Normalize events / todos
    const rawEvents = d.card_events || d.events || d.todo_list || [];
    const events: CardEvent[] = Array.isArray(rawEvents)
      ? rawEvents.map((ev: any, idx: number) => ({
          eventId: ev.event_id || ev.eventId || `ev_${Date.now()}_${idx}`,
          cardId: '',
          title: ev.event_desc || ev.title || 'Task',
          content: ev.content || '',
          check: ev.check === 1 ? 1 : 0,
          time: ev.time || ev.start_timestamp,
          isPotentialReminder: ev.is_potential_reminder ?? true,
        }))
      : [];

    // Normalize bullet points
    let bulletPoints: string[] = [];
    if (Array.isArray(d.bullet_points)) {
      bulletPoints = d.bullet_points;
    } else if (Array.isArray(d.bulletPoints)) {
      bulletPoints = d.bulletPoints;
    } else if (typeof d.bullet_points === 'string') {
      bulletPoints = d.bullet_points.split('\n').filter(Boolean);
    }

    return {
      title: d.title || d.card_title || 'Voice Note',
      summary: d.summary || d.card_summary,
      transcript: d.transcript || d.asr_text,
      bulletPoints,
      bulletPointsTitle: d.bullet_points_title || 'Audio Summary',
      infoExtract: Array.isArray(d.info_extract) ? d.info_extract : undefined,
      events,
      tags,
      raw: d,
    };
  } catch (err) {
    console.error('Failed to call Nothing Audio AI:', err);
    return null;
  }
}

/**
 * Creates a new Card in Nothing Cloud Storage and saves it to IndexedDB
 */
export async function createCloudCard(params: {
  token: string;
  userId: string;
  type: CardType;
  title?: string;
  content?: string;
  summary?: string;
  imageUrl?: string;
  collectionId?: string;
  tags?: string[];
  bulletPoints?: string[];
  bulletPointsTitle?: string;
  infoExtract?: Array<{ title: string; value: string }>;
  events?: CardEvent[];
  linkUrl?: string;
  linkMeta?: {
    title?: string;
    description?: string;
    domain?: string;
    preview?: string;
  };
  audio?: {
    audioUri?: string;
    transcript?: string;
    duration?: number;
  };
}): Promise<{ success: boolean; card?: Card; error?: string }> {
  try {
    const cardId = generateUuid();
    const now = Date.now();

    // Attach cardId to events
    const eventsWithId = (params.events || []).map(ev => ({
      ...ev,
      cardId,
      eventId: ev.eventId || `ev_${cardId.slice(0, 6)}_${Date.now()}`,
    }));

    const newCard: Card = {
      cardId,
      userId: params.userId,
      type: params.type,
      title: params.title || (params.type === 'LINK' ? params.linkUrl : 'New Note'),
      content: params.content || '',
      summary: params.summary,
      imageUrl: params.imageUrl || params.linkMeta?.preview,
      collectionId: params.collectionId,
      tags: params.tags,
      bulletPoints: params.bulletPoints,
      bulletPointsTitle: params.bulletPointsTitle,
      infoExtract: params.infoExtract,
      events: eventsWithId,
      targetState: 0,
      createTime: now,
      updateTime: now,
      link: params.linkUrl
        ? {
            url: params.linkUrl,
            title: params.linkMeta?.title || params.title,
            description: params.linkMeta?.description || params.summary,
            domain:
              params.linkMeta?.domain ||
              (() => {
                try {
                  return new URL(params.linkUrl).hostname.replace(/^www\./, '');
                } catch {
                  return '';
                }
              })(),
            preview: params.linkMeta?.preview || params.imageUrl,
          }
        : undefined,
      audio: params.audio,
    };

    // Encrypt payload
    const { aesKeyB64, cipherKey } = generateWriteCipherSession();
    const payload = encryptPayload(DEVICE_MODEL, aesKeyB64);

    const body = {
      cards: [
        {
          cardId: newCard.cardId,
          clientCreateTime: newCard.createTime,
          clientUpdateTime: newCard.updateTime,
          collectionId: newCard.collectionId,
          targetState: newCard.targetState,
          type: newCard.type,
          title: newCard.title,
          content: newCard.content,
          summary: newCard.summary,
          tags: newCard.tags,
          bulletPoints: newCard.bulletPoints,
          bulletPointsTitle: newCard.bulletPointsTitle,
          infoExtract: newCard.infoExtract,
          events: newCard.events,
          link: newCard.link,
          imageUrl: newCard.imageUrl,
          audio: newCard.audio,
        },
      ],
      payload,
      cipherKey,
    };

    const targetUrl = `${NOTHING_BASE_URL}/storage/card/v1/create`;
    const res = await nothingFetch(targetUrl, {
      method: 'POST',
      headers: generateNothingAuthHeaders(params.token),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || data?.code !== '00000') {
      const errorMsg = data?.msg || `Failed to create card (HTTP ${res.status})`;
      console.error('Create card failed:', errorMsg);
      return { success: false, error: errorMsg };
    }

    // Persist to local IndexedDB
    await saveDbCards([newCard]);

    return { success: true, card: newCard };
  } catch (err: any) {
    console.error('Error creating card:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Updates a Card (title, checklist item toggle, move to collection) in Nothing Cloud and local DB
 */
export async function updateCloudCard(
  token: string,
  card: Card
): Promise<{ success: boolean; error?: string }> {
  try {
    const updatedCard: Card = {
      ...card,
      updateTime: Date.now(),
    };

    const { aesKeyB64, cipherKey } = generateWriteCipherSession();
    const payload = encryptPayload(DEVICE_MODEL, aesKeyB64);

    const body = {
      cards: [
        {
          cardId: updatedCard.cardId,
          clientUpdateTime: updatedCard.updateTime,
          collectionId: updatedCard.collectionId,
          targetState: updatedCard.targetState,
          type: updatedCard.type,
          title: updatedCard.title,
          content: updatedCard.content,
          summary: updatedCard.summary,
          tags: updatedCard.tags,
          events: updatedCard.events,
        },
      ],
      payload,
      cipherKey,
    };

    const targetUrl = `${NOTHING_BASE_URL}/storage/card/v1/update`;
    const res = await nothingFetch(targetUrl, {
      method: 'POST',
      headers: generateNothingAuthHeaders(token),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || data?.code !== '00000') {
      const errorMsg = data?.msg || `Failed to update card (HTTP ${res.status})`;
      return { success: false, error: errorMsg };
    }

    // Update in local IndexedDB
    await updateDbCard(updatedCard.cardId, updatedCard);

    return { success: true };
  } catch (err: any) {
    console.error('Error updating card:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Trashes or restores a card
 */
export async function setCardTrashState(
  token: string,
  card: Card,
  isTrash: boolean
): Promise<{ success: boolean; error?: string }> {
  return updateCloudCard(token, {
    ...card,
    targetState: isTrash ? 1 : 0,
  });
}
