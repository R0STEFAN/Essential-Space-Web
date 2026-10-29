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
      aiType: 1,
      promptType: params.promptType,
      promptVersion: 1,
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

    let d = json.data;
    if (typeof d === 'string') {
      try {
        d = JSON.parse(d);
      } catch {
        // string content
      }
    }

    if (d?.choices && Array.isArray(d.choices) && d.choices[0]?.message?.content) {
      try {
        const innerContent = d.choices[0].message.content;
        const innerObj = typeof innerContent === 'string' ? JSON.parse(innerContent) : innerContent;
        d = { ...d, ...innerObj };
      } catch (err) {
        console.warn('Failed to parse inner choices message content:', err);
      }
    }

    if (!d || d.error) {
      console.warn('Nothing AI returned error payload:', d);
      return null;
    }

    // Normalize tags
    const rawTags = d.hashtags || d.tags || [];
    let tags = Array.isArray(rawTags)
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
          isPotentialReminder: Boolean(ev.is_potential_reminder),
        }))
      : [];

    // Normalize bullet points
    let bulletPoints: string[] = [];
    const bulletPointsTitle = d.bullet_points_title || d.bulletPoint?.title || 'Key Points';
    if (Array.isArray(d.bulletPoint?.bulletPointItem)) {
      bulletPoints = d.bulletPoint.bulletPointItem;
    } else if (Array.isArray(d.bullet_points)) {
      bulletPoints = d.bullet_points;
    } else if (Array.isArray(d.bulletPoints)) {
      bulletPoints = d.bulletPoints;
    } else if (typeof d.bullet_points === 'string') {
      bulletPoints = d.bullet_points.split('\n').filter(Boolean);
    }

    // Normalize info extract
    let infoExtract: Array<{ title: string; value: string }> | undefined;
    if (Array.isArray(d.info_extract)) {
      infoExtract = d.info_extract;
    } else if (Array.isArray(d.infoExtract)) {
      infoExtract = d.infoExtract;
    } else if (d.informationExtract && d.informationExtract.title && d.informationExtract.extractedInformation) {
      infoExtract = [
        {
          title: d.informationExtract.title,
          value: d.informationExtract.extractedInformation,
        },
      ];
    }

    return {
      title: d.title || d.card_title,
      summary: d.summary || d.card_summary,
      bulletPoints,
      bulletPointsTitle,
      infoExtract,
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
  imageS3FileKey?: string;
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

    const imgEvents = params.imageS3FileKey
      ? [
          {
            timePoint: '00:00',
            content: {
              region: 'europe-west3',
              gcsKey: params.imageS3FileKey,
            },
          },
        ]
      : [];

    const body = {
      s3Region: 'europe-west3',
      s3FileKey: params.s3FileKey,
      storageType: 'GCS',
      userContent: params.userText || '',
      clickEvents: [],
      imgEvents,
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

    let d = json.data;
    if (typeof d === 'string') {
      try {
        d = JSON.parse(d);
      } catch {
        // string
      }
    }

    if (d?.choices && Array.isArray(d.choices) && d.choices[0]?.message?.content) {
      try {
        const innerContent = d.choices[0].message.content;
        const innerObj = typeof innerContent === 'string' ? JSON.parse(innerContent) : innerContent;
        d = { ...d, ...innerObj };
      } catch (err) {
        console.warn('Failed to parse audio inner choices message content:', err);
      }
    }

    if (!d || d.error) {
      console.warn('Nothing Audio AI returned error payload:', d);
      return null;
    }

    // Normalize tags
    const rawTags = d.hashtags || d.tags || [];
    let tags = Array.isArray(rawTags)
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
          isPotentialReminder: Boolean(ev.is_potential_reminder),
        }))
      : [];

    // Normalize bullet points
    let bulletPoints: string[] = [];
    const bulletPointsTitle = d.bullet_points_title || d.bulletPoint?.title || 'Audio Summary';
    if (Array.isArray(d.bulletPoint?.bulletPointItem)) {
      bulletPoints = d.bulletPoint.bulletPointItem;
    } else if (Array.isArray(d.bullet_points)) {
      bulletPoints = d.bullet_points;
    } else if (Array.isArray(d.bulletPoints)) {
      bulletPoints = d.bulletPoints;
    } else if (typeof d.bullet_points === 'string') {
      bulletPoints = d.bullet_points.split('\n').filter(Boolean);
    }

    // Normalize info extract
    let infoExtract: Array<{ title: string; value: string }> | undefined;
    if (Array.isArray(d.info_extract)) {
      infoExtract = d.info_extract;
    } else if (Array.isArray(d.infoExtract)) {
      infoExtract = d.infoExtract;
    } else if (d.informationExtract && d.informationExtract.title && d.informationExtract.extractedInformation) {
      infoExtract = [
        {
          title: d.informationExtract.title,
          value: d.informationExtract.extractedInformation,
        },
      ];
    }

    return {
      title: d.title || d.card_title || 'Voice Note',
      summary: d.summary || d.card_summary,
      transcript: d.transcript || d.asr_text,
      bulletPoints,
      bulletPointsTitle,
      infoExtract,
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
  cachedImageUrl?: string;
  imageGcsKey?: string;
  collectionId?: string;
  collectionIds?: string[];
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
    siteName?: string;
    favicon?: string;
    preview?: string;
  };
  audio?: {
    audioUri?: string;
    transcript?: string;
    duration?: number;
  };
  audioGcsKey?: string;
  captureFrom?: string;
}): Promise<{ success: boolean; card?: Card; error?: string }> {
  try {
    const cardId = generateUuid();
    const now = Date.now();
    const targetCaptureFrom =
      params.captureFrom ||
      (params.type === 'LINK' ? 'share_sheet' : (params.type === 'AUDIO' ? 'recording' : 'note'));
    const targetCollectionIds = (params.collectionIds && params.collectionIds.length > 0)
      ? params.collectionIds
      : (params.collectionId ? [params.collectionId] : []);

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
      title: params.title || (params.type === 'LINK' ? (params.linkMeta?.title || params.linkUrl) : 'New Note'),
      content: params.content || '',
      summary: params.summary || (params.type === 'LINK' ? params.linkMeta?.description : params.content) || undefined,
      imageUrl: params.imageUrl || params.linkMeta?.preview,
      cachedImageUrl: params.cachedImageUrl,
      collectionId: targetCollectionIds[0] || params.collectionId,
      collectionIds: targetCollectionIds,
      captureFrom: targetCaptureFrom,
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
            siteName: params.linkMeta?.siteName,
            favicon: params.linkMeta?.favicon,
            preview: params.linkMeta?.preview || params.imageUrl,
          }
        : undefined,
      audio: params.audio || (params.content && params.type === 'AUDIO' ? { transcript: params.content, duration: 45, speakerName: 'Speaker' } : undefined),
    };

    // Build room database bundle for Nothing Phone CloudSyncWorker compatibility
    const cardResources: any[] = [];
    if (params.imageGcsKey) {
      cardResources.push({
        card_resource_id: generateUuid(),
        raw_type: 'IMAGE',
        data: '',
        mime_type: 'image/webp',
        is_primary: true,
        metadata: JSON.stringify({ size: 0 }),
        create_time: now,
        update_time: now,
        remote_gcsKey: params.imageGcsKey,
        remote_region: 'europe-west3',
      });
    }
    if (params.audioGcsKey) {
      cardResources.push({
        card_resource_id: generateUuid(),
        raw_type: 'AUDIO',
        data: '',
        mime_type: 'audio/wav',
        is_primary: !params.imageGcsKey,
        metadata: JSON.stringify({ duration: params.audio?.duration || 0 }),
        create_time: now,
        update_time: now,
        remote_gcsKey: params.audioGcsKey,
        remote_region: 'europe-west3',
      });
    }
    // Preserves user's saved link in card_resources (matching Nothing Android Room schema: raw_type 'LINK')
    if (params.linkUrl) {
      cardResources.push({
        card_resource_id: generateUuid(),
        raw_type: 'LINK',
        data: params.linkUrl,
        mime_type: 'text/plain',
        is_primary: true,
        metadata: JSON.stringify({
          fav_icon: params.linkMeta?.favicon || '',
          type: 'website',
          title: params.linkMeta?.title || params.title || '',
          description: params.linkMeta?.description || params.summary || '',
          domain:
            params.linkMeta?.domain ||
            (() => {
              try {
                return new URL(params.linkUrl).hostname.replace(/^www\./, '');
              } catch {
                return '';
              }
            })(),
          site_name: params.linkMeta?.siteName || '',
          preview: params.linkMeta?.preview || params.imageUrl || '',
        }),
        create_time: now,
        update_time: now,
      });
    }
    // Preserves user's written note/text in card_resources (matching Nothing Android Room schema: raw_type 'TEXT')
    if (params.content && params.content.trim()) {
      cardResources.push({
        card_resource_id: generateUuid(),
        raw_type: 'TEXT',
        data: params.content.trim(),
        mime_type: 'text/plain',
        is_primary: !params.linkUrl,
        create_time: now,
        update_time: now,
      });
    }

    // Compute official Nothing Phone Room database resource_mask bitfield
    // IMAGE=1, AUDIO=2, RECORDING=4, ATTACHMENT_IMAGE=8, ATTACHMENT_TEXT=16, NOTE_AUDIO=32, NOTE_TEXT=64, TEXT=128, CLIPPED_TEXT=256, LINK=512
    let resourceMask = 0;
    for (const r of cardResources) {
      switch (r.raw_type) {
        case 'IMAGE':
          resourceMask |= 1;
          break;
        case 'AUDIO':
          resourceMask |= 2;
          break;
        case 'RECORDING':
          resourceMask |= 4;
          break;
        case 'ATTACHMENT_IMAGE':
          resourceMask |= 8;
          break;
        case 'ATTACHMENT_TEXT':
          resourceMask |= 16;
          break;
        case 'NOTE_AUDIO':
          resourceMask |= 32;
          break;
        case 'NOTE_TEXT':
          resourceMask |= 64;
          break;
        case 'TEXT':
          resourceMask |= 128;
          break;
        case 'CLIPPED_TEXT':
          resourceMask |= 256;
          break;
        case 'LINK':
          resourceMask |= 512;
          break;
      }
    }

    // Prevent Android Room NullPointerException: IMAGE and AUDIO cards MUST have matching resources
    if (newCard.type === 'IMAGE' && !params.imageGcsKey) {
      newCard.type = 'TEXT';
    }
    if (newCard.type === 'AUDIO' && !params.audioGcsKey) {
      newCard.type = 'TEXT';
    }
    if (newCard.type === 'LINK' && !params.linkUrl) {
      newCard.type = 'TEXT';
    }

    const cardAnalysis: any[] = [];
    if (params.bulletPoints && params.bulletPoints.length > 0) {
      cardAnalysis.push({
        card_analysis_id: generateUuid(),
        raw_type: 'BULLET_POINTS',
        metadata: JSON.stringify({
          title: params.bulletPointsTitle || 'Key Points',
          bulletPointItem: params.bulletPoints.join('\n'),
        }),
        create_time: now,
        update_time: now,
      });
    }
    if (params.infoExtract && params.infoExtract.length > 0) {
      for (const item of params.infoExtract) {
        cardAnalysis.push({
          card_analysis_id: generateUuid(),
          raw_type: 'INFO_EXTRACT',
          metadata: JSON.stringify({
            title: item.title,
            extractedInformation: item.value,
          }),
          create_time: now,
          update_time: now,
        });
      }
    }

    const cardEvents: any[] = eventsWithId.map(ev => ({
      type: 2,
      title: ev.title,
      content: ev.content || '',
      check: ev.check === 1,
      is_potential_reminder: ev.isPotentialReminder ? 1 : 0,
      time: ev.time || now,
      update_time: now,
      special_key: ev.eventId,
      start_time: -1,
      end_time: -1,
    }));

    const clientRequestResponse = JSON.stringify({
      cards: {
        card_id: cardId,
        title: newCard.title,
        summary: newCard.summary || newCard.content || '',
        type: newCard.type,
        create_time: now,
        update_time: now,
        resource_mask: resourceMask,
        capture_from: targetCaptureFrom,
      },
      card_resources: cardResources.map((r: any) => ({
        ...r,
        data: typeof r.data === 'string' ? r.data : '',
      })),
      card_analysis: cardAnalysis,
      card_events: cardEvents,
      card_collection_cross_ref: targetCollectionIds.map(colId => ({
        collection_id: colId,
        create_time: now,
      })),
    });

    const files: any[] = [];
    if (params.imageGcsKey) {
      files.push({ region: 'europe-west3', gcsKey: params.imageGcsKey });
    }
    if (params.audioGcsKey) {
      files.push({ region: 'europe-west3', gcsKey: params.audioGcsKey });
    }

    // Encrypt write payload
    const { aesKeyB64, cipherKey } = generateWriteCipherSession();
    const payload = encryptPayload(DEVICE_MODEL, aesKeyB64);
    const itemPayload = encryptPayload('0', aesKeyB64);

    const body = {
      clientVersion: 1,
      payload,
      cipherKey,
      cards: [
        {
          cardId: newCard.cardId,
          collectionIds: targetCollectionIds,
          categoryId: null,
          client_request_response: clientRequestResponse,
          files,
          clientCreateTime: now,
          clientUpdateTime: now,
          payload: itemPayload,
          cipherKey,
        },
      ],
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
    newCard.rawClientRequestResponse = clientRequestResponse;
    await saveDbCards([newCard]);

    return { success: true, card: newCard };
  } catch (err: any) {
    console.error('Error creating card:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Updates one or multiple Cards in Nothing Cloud and local DB
 */
export async function updateCloudCards(
  token: string,
  cardsToUpdate: Card[]
): Promise<{ success: boolean; error?: string }> {
  if (cardsToUpdate.length === 0) return { success: true };
  try {
    const now = Date.now();
    const updatedCards: Card[] = cardsToUpdate.map(c => ({
      ...c,
      updateTime: now,
    }));

    const { aesKeyB64, cipherKey } = generateWriteCipherSession();
    const payload = encryptPayload(DEVICE_MODEL, aesKeyB64);
    const itemPayload = encryptPayload('0', aesKeyB64);

    const body = {
      clientVersion: cardsToUpdate[0]?.clientVersion || 2,
      payload,
      cipherKey,
      cards: updatedCards.map(c => {
        const colIds = (c.collectionIds && c.collectionIds.length > 0)
          ? c.collectionIds
          : (c.collectionId ? [c.collectionId] : []);
        let cr: any = null;
        if (c.rawClientRequestResponse) {
          try {
            cr = JSON.parse(c.rawClientRequestResponse);
          } catch {
            cr = null;
          }
        }

        if (cr && typeof cr === 'object') {
          if (!cr.cards) cr.cards = {};
          cr.cards.card_id = c.cardId;
          if (c.title) cr.cards.title = c.title;
          if (c.summary || c.content) cr.cards.summary = c.summary || c.content;
          cr.cards.update_time = now;
          cr.cards.target_state = c.targetState ?? cr.cards.target_state ?? 0;
          if (c.captureFrom) {
            cr.cards.capture_from = c.captureFrom;
          } else if (!cr.cards.capture_from) {
            cr.cards.capture_from = c.type === 'LINK' ? 'share_sheet' : (c.type === 'AUDIO' ? 'recording' : 'note');
          }

          if (Array.isArray(cr.card_resources)) {
            cr.card_resources = cr.card_resources.map((r: any) => ({
              ...r,
              data: typeof r.data === 'string' ? r.data : '',
            }));

            // Ensure LINK resource is present for LINK cards
            if (c.type === 'LINK' && c.link?.url) {
              const hasLink = cr.card_resources.some((r: any) => r.raw_type === 'LINK');
              if (!hasLink) {
                cr.card_resources.push({
                  card_resource_id: generateUuid(),
                  raw_type: 'LINK',
                  data: c.link.url,
                  mime_type: 'text/plain',
                  is_primary: true,
                  metadata: JSON.stringify({
                    fav_icon: c.link.favicon || '',
                    type: 'website',
                    title: c.link.title || c.title || '',
                    description: c.link.description || c.summary || '',
                    domain: c.link.domain || '',
                    site_name: c.link.siteName || '',
                    preview: c.link.preview || c.imageUrl || '',
                  }),
                  create_time: c.createTime || now,
                  update_time: now,
                });
              }
              if (cr.cards) {
                cr.cards.resource_mask = (cr.cards.resource_mask || 0) | 512;
                cr.cards.type = 'LINK';
                if (!cr.cards.capture_from) cr.cards.capture_from = 'share_sheet';
              }
            }
          }

          // Update checklist items if present
          if (Array.isArray(cr.card_events) && c.events) {
            cr.card_events = cr.card_events.map((ev: any) => {
              const match = c.events?.find(
                (e: any) => e.eventId === (ev.special_key || ev.card_event_id)
              );
              if (match) {
                return {
                  ...ev,
                  check: match.check === 1,
                  update_time: now,
                };
              }
              return ev;
            });
          } else if (c.events && c.events.length > 0) {
            cr.card_events = c.events.map(ev => ({
              type: 2,
              title: ev.title,
              content: ev.content || '',
              check: ev.check === 1,
              is_potential_reminder: ev.isPotentialReminder ? 1 : 0,
              time: ev.time || now,
              update_time: now,
              special_key: ev.eventId,
              start_time: -1,
              end_time: -1,
            }));
          }

          // Update collection reference
          cr.card_collection_cross_ref = colIds.map(id => ({
            collection_id: id,
            create_time: now,
          }));
          if (cr.cards) {
            cr.cards.collection_id = colIds[0] || null;
          }
        } else {
          // Construct baseline client_request_response
          let resourceMask = 0;
          const baselineResources: any[] = [];
          if (c.type === 'LINK' && c.link?.url) {
            baselineResources.push({
              card_resource_id: generateUuid(),
              raw_type: 'LINK',
              data: c.link.url,
              mime_type: 'text/plain',
              is_primary: true,
              metadata: JSON.stringify({
                fav_icon: c.link.favicon || '',
                type: 'website',
                title: c.link.title || c.title || '',
                description: c.link.description || c.summary || '',
                domain: c.link.domain || '',
                site_name: c.link.siteName || '',
                preview: c.link.preview || c.imageUrl || '',
              }),
              create_time: c.createTime || now,
              update_time: now,
            });
            resourceMask |= 512;
          }
          if (c.content && c.content.trim()) {
            baselineResources.push({
              card_resource_id: generateUuid(),
              raw_type: 'TEXT',
              data: c.content.trim(),
              mime_type: 'text/plain',
              is_primary: baselineResources.length === 0,
              create_time: c.createTime || now,
              update_time: now,
            });
            resourceMask |= 128;
          }

          cr = {
            cards: {
              card_id: c.cardId,
              title: c.title,
              summary: c.summary || c.content || '',
              type: c.type,
              create_time: c.createTime || now,
              update_time: now,
              resource_mask: resourceMask,
              capture_from: c.captureFrom || (c.type === 'LINK' ? 'share_sheet' : (c.type === 'AUDIO' ? 'recording' : 'note')),
              target_state: c.targetState || 0,
            },
            card_resources: baselineResources,
            card_analysis: [],
            card_events: (c.events || []).map(ev => ({
              type: 2,
              title: ev.title,
              content: ev.content || '',
              check: ev.check === 1,
              is_potential_reminder: ev.isPotentialReminder ? 1 : 0,
              time: ev.time || now,
              update_time: now,
              special_key: ev.eventId,
              start_time: -1,
              end_time: -1,
            })),
            card_collection_cross_ref: colIds.map(id => ({
              collection_id: id,
              create_time: now,
            })),
          };
        }

        const clientRequestResponse = JSON.stringify(cr);

        return {
          cardId: c.cardId,
          collectionIds: colIds,
          client_request_response: clientRequestResponse,
          files: Array.isArray(c.files) ? c.files : [],
          clientUpdateTime: now,
          payload: itemPayload,
          cipherKey,
        };
      }),
    };

    const targetUrl = `${NOTHING_BASE_URL}/storage/card/v1/update`;
    const res = await nothingFetch(targetUrl, {
      method: 'POST',
      headers: generateNothingAuthHeaders(token),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || data?.code !== '00000') {
      const errorMsg = data?.msg || `Failed to update cards (HTTP ${res.status})`;
      return { success: false, error: errorMsg };
    }

    // Inspect individual card responses for SERVER_CODE_CLIENT_DATA_TOO_OLD (300007)
    if (Array.isArray(data?.data)) {
      for (const item of data.data) {
        if (item.code === '300007' && item.client_request_response) {
          console.log(`[Nothing Cloud] Conflict 300007 for card ${item.cardId}, resolving with server state...`);
          try {
            const serverCr =
              typeof item.client_request_response === 'string'
                ? JSON.parse(item.client_request_response)
                : item.client_request_response;

            const targetCard = updatedCards.find(c => c.cardId === item.cardId);
            if (targetCard) {
              const bumpedTime = Math.max(Date.now(), (item.clientUpdateTime || 0) + 1000);

              if (serverCr.cards) {
                serverCr.cards.update_time = bumpedTime;
                if (targetCard.title) serverCr.cards.title = targetCard.title;
                if (targetCard.summary || targetCard.content) {
                  serverCr.cards.summary = targetCard.summary || targetCard.content;
                }
                serverCr.cards.target_state =
                  targetCard.targetState ?? serverCr.cards.target_state ?? 0;
              }

              if (Array.isArray(serverCr.card_events) && targetCard.events) {
                for (const ev of serverCr.card_events) {
                  const localEv = targetCard.events.find(
                    (e: any) => e.eventId === (ev.special_key || ev.card_event_id)
                  );
                  if (localEv) {
                    ev.check = localEv.check === 1;
                    ev.update_time = bumpedTime;
                  }
                }
              }

              const conflictColIds = (targetCard.collectionIds && targetCard.collectionIds.length > 0)
                ? targetCard.collectionIds
                : (targetCard.collectionId ? [targetCard.collectionId] : []);
              serverCr.card_collection_cross_ref = conflictColIds.map(id => ({
                collection_id: id,
                create_time: bumpedTime,
              }));
              if (serverCr.cards) {
                serverCr.cards.collection_id = conflictColIds[0] || null;
              }

              targetCard.rawClientRequestResponse = JSON.stringify(serverCr);
              targetCard.updateTime = bumpedTime;

              const retryBody = {
                clientVersion: item.clientVersion || targetCard.clientVersion || 2,
                payload,
                cipherKey,
                cards: [
                  {
                    cardId: item.cardId,
                    collectionIds: conflictColIds,
                    client_request_response: JSON.stringify(serverCr),
                    files: item.files || targetCard.files || [],
                    clientUpdateTime: bumpedTime,
                    payload: itemPayload,
                    cipherKey,
                  },
                ],
              };

              const retryRes = await nothingFetch(targetUrl, {
                method: 'POST',
                headers: generateNothingAuthHeaders(token),
                body: JSON.stringify(retryBody),
              });
              const retryData = await retryRes.json().catch(() => null);
              console.log(
                `[Nothing Cloud] Conflict retry for card ${item.cardId} returned code:`,
                retryData?.code,
                retryData?.data?.[0]?.code
              );
            }
          } catch (conflictErr) {
            console.error('Failed to resolve 300007 conflict:', conflictErr);
          }
        }
      }
    }

    // Update in local IndexedDB
    for (const card of updatedCards) {
      await updateDbCard(card.cardId, card);
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error updating cards:', err);
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
  return updateCloudCards(token, [card]);
}

/**
 * Trashes or restores a card
 */
export async function setCardTrashState(
  token: string,
  card: Card,
  isTrash: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = Date.now();
    const { aesKeyB64, cipherKey } = generateWriteCipherSession();
    const payload = encryptPayload(DEVICE_MODEL, aesKeyB64);

    const body = isTrash
      ? {
          payload,
          cipherKey,
          cards: [
            {
              cardId: card.cardId,
              clientUpdateTime: now,
            },
          ],
        }
      : {
          payload,
          cipherKey,
          cardIds: [card.cardId],
        };

    const endpoint = isTrash ? 'storage/card/v1/delete' : 'storage/restore/v1/restore';
    const targetUrl = `${NOTHING_BASE_URL}/${endpoint}`;
    const res = await nothingFetch(targetUrl, {
      method: 'POST',
      headers: generateNothingAuthHeaders(token),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || data?.code !== '00000') {
      const errorMsg = data?.msg || `Failed to change card trash state (HTTP ${res.status})`;
      return { success: false, error: errorMsg };
    }

    const updatedCard: Card = {
      ...card,
      targetState: isTrash ? 1 : 0,
      updateTime: now,
    };
    await updateDbCard(card.cardId, updatedCard);

    return { success: true };
  } catch (err: any) {
    console.error('Error changing card trash state:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Bulk moves cards to trash in Nothing Cloud
 */
export async function bulkDeleteCloudCards(
  token: string,
  cardIds: string[]
): Promise<{ success: boolean; error?: string }> {
  if (cardIds.length === 0) return { success: true };
  try {
    const now = Date.now();
    const { aesKeyB64, cipherKey } = generateWriteCipherSession();
    const payload = encryptPayload(DEVICE_MODEL, aesKeyB64);

    const body = {
      payload,
      cipherKey,
      cardIds,
      cards: cardIds.map(id => ({
        cardId: id,
        clientUpdateTime: now,
      })),
    };

    const targetUrl = `${NOTHING_BASE_URL}/storage/card/v1/delete`;
    const res = await nothingFetch(targetUrl, {
      method: 'POST',
      headers: generateNothingAuthHeaders(token),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || data?.code !== '00000') {
      const errorMsg = data?.msg || `Failed to bulk delete cards (HTTP ${res.status})`;
      return { success: false, error: errorMsg };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error bulk deleting cards:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Bulk restores cards from trash in Nothing Cloud
 */
export async function bulkRestoreCloudCards(
  token: string,
  cardIds: string[]
): Promise<{ success: boolean; error?: string }> {
  if (cardIds.length === 0) return { success: true };
  try {
    const { aesKeyB64, cipherKey } = generateWriteCipherSession();
    const payload = encryptPayload(DEVICE_MODEL, aesKeyB64);

    const body = {
      payload,
      cipherKey,
      cardIds,
    };

    const targetUrl = `${NOTHING_BASE_URL}/storage/restore/v1/restore`;
    const res = await nothingFetch(targetUrl, {
      method: 'POST',
      headers: generateNothingAuthHeaders(token),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || data?.code !== '00000') {
      const errorMsg = data?.msg || `Failed to bulk restore cards (HTTP ${res.status})`;
      return { success: false, error: errorMsg };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error bulk restoring cards:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Permanently hard-deletes cards from trash in Nothing Cloud
 */
export async function bulkHardDeleteCloudCards(
  token: string,
  cardIds: string[]
): Promise<{ success: boolean; error?: string }> {
  if (cardIds.length === 0) return { success: true };
  try {
    const { aesKeyB64, cipherKey } = generateWriteCipherSession();
    const payload = encryptPayload(DEVICE_MODEL, aesKeyB64);

    const body = {
      payload,
      cipherKey,
      cardIds,
    };

    const targetUrl = `${NOTHING_BASE_URL}/storage/restore/v1/delete`;
    const res = await nothingFetch(targetUrl, {
      method: 'POST',
      headers: generateNothingAuthHeaders(token),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || data?.code !== '00000') {
      const errorMsg = data?.msg || `Failed to permanently delete cards (HTTP ${res.status})`;
      return { success: false, error: errorMsg };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error hard deleting cards:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Bulk updates collection membership in Nothing Cloud
 */
export async function bulkAssignCollectionCloudCards(
  token: string,
  cards: Card[],
  collectionIdsOrId?: string[] | string | null
): Promise<{ success: boolean; error?: string }> {
  if (cards.length === 0) return { success: true };
  try {
    const now = Date.now();
    const { aesKeyB64, cipherKey } = generateWriteCipherSession();
    const payload = encryptPayload(DEVICE_MODEL, aesKeyB64);
    const itemPayload = encryptPayload('0', aesKeyB64);

    const targetCollectionIds = Array.isArray(collectionIdsOrId)
      ? collectionIdsOrId.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
      : (collectionIdsOrId ? [collectionIdsOrId] : []);

    const body = {
      payload,
      cipherKey,
      cards: cards.map(c => {
        let cr: any = null;
        if (c.rawClientRequestResponse) {
          try {
            cr = JSON.parse(c.rawClientRequestResponse);
          } catch {
            cr = null;
          }
        }

        if (cr && typeof cr === 'object') {
          if (!cr.cards) cr.cards = {};
          cr.cards.card_id = c.cardId;
          cr.cards.update_time = now;
          cr.cards.collection_id = targetCollectionIds[0] || null;
          cr.card_collection_cross_ref = targetCollectionIds.map(id => ({
            collection_id: id,
            create_time: now,
          }));
        } else {
          cr = {
            cards: {
              card_id: c.cardId,
              title: c.title,
              summary: c.summary || c.content || '',
              type: c.type,
              create_time: c.createTime || now,
              update_time: now,
              target_state: c.targetState || 0,
              collection_id: targetCollectionIds[0] || null,
            },
            card_resources: [],
            card_analysis: [],
            card_events: (c.events || []).map(ev => ({
              type: 2,
              title: ev.title,
              content: ev.content || '',
              check: ev.check === 1,
              is_potential_reminder: ev.isPotentialReminder ? 1 : 0,
              time: ev.time || now,
              update_time: now,
              special_key: ev.eventId,
              start_time: -1,
              end_time: -1,
            })),
            card_collection_cross_ref: targetCollectionIds.map(id => ({
              collection_id: id,
              create_time: now,
            })),
          };
        }

        return {
          cardId: c.cardId,
          collectionIds: targetCollectionIds,
          client_request_response: JSON.stringify(cr),
          files: Array.isArray(c.files) ? c.files : [],
          clientUpdateTime: now,
          payload: itemPayload,
          cipherKey,
        };
      }),
    };

    const targetUrl = `${NOTHING_BASE_URL}/storage/card/v1/update`;
    const res = await nothingFetch(targetUrl, {
      method: 'POST',
      headers: generateNothingAuthHeaders(token),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || data?.code !== '00000') {
      const errorMsg = data?.msg || `Failed to update card collections (HTTP ${res.status})`;
      return { success: false, error: errorMsg };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error updating card collections:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}
