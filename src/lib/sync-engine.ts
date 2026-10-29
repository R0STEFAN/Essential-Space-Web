import type { Card, CardType, Collection, NothingUser, SyncResult } from '@/types';
import { generateNothingAuthHeaders, NOTHING_BASE_URL } from './crypto';
import { nothingFetch } from './nothing-fetch';
import { db, saveDbCards, saveDbCollections, setDbMeta, getDbAuth } from './db';

/**
 * Universal Client-Side Sync Engine
 * Direct synchronization with Nothing Cloud storage APIs via Cloudflare edge proxy.
 * Saves results directly into IndexedDB (Dexie.js).
 */
export async function syncNothingCloud(user: NothingUser): Promise<SyncResult> {
  const activeToken = user.token;
  if (!activeToken) {
    throw new Error('NO_TOKEN: Please sign in with your Nothing account token.');
  }

  const headers = generateNothingAuthHeaders(activeToken);

  // 1a. Fetch active cards
  const rawCardItems: any[] = [];
  let pageNo = 1;
  let hasMore = true;

  while (hasMore && pageNo <= 10) {
    const res = await nothingFetch(`${NOTHING_BASE_URL}/storage/card/v1/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pageNo, pageSize: 100 }),
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error('AUTH_EXPIRED: Session token expired. Please sign in again.');
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to fetch cards from Nothing Cloud (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const items: any[] = data?.data?.page_data || [];
    rawCardItems.push(...items);

    if (items.length < 100) {
      hasMore = false;
    } else {
      pageNo++;
    }
  }

  // 1b. Fetch trash / bin cards from Nothing Cloud restore endpoint
  try {
    const restoreRes = await nothingFetch(`${NOTHING_BASE_URL}/storage/restore/v1/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pageNo: 1, pageSize: 100 }),
    });
    if (restoreRes.ok) {
      const restoreJson = await restoreRes.json();
      const trashItems: any[] = Array.isArray(restoreJson?.data)
        ? restoreJson.data
        : restoreJson?.data?.page_data || [];
      for (const item of trashItems) {
        rawCardItems.push({ ...item, _isTrash: true });
      }
    }
  } catch (restoreErr) {
    console.warn('Failed to fetch trash cards from Nothing Cloud:', restoreErr);
  }

  // 2. Collect all referenced files across cards (images, audios)
  const filesToSign: Array<{ region: string; gcsKey: string }> = [];
  const seenKeys = new Set<string>();
  for (const item of rawCardItems) {
    if (Array.isArray(item.files)) {
      for (const f of item.files) {
        if (f.gcsKey && !seenKeys.has(f.gcsKey)) {
          seenKeys.add(f.gcsKey);
          filesToSign.push({ region: f.region || 'europe-west3', gcsKey: f.gcsKey });
        }
      }
    }
  }

  // 3. Request signed GCS URLs for all media files in one batch call
  const signUrlMap = new Map<string, string>();
  if (filesToSign.length > 0) {
    try {
      const fileRes = await nothingFetch(`${NOTHING_BASE_URL}/storage/card/v1/files`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ files: filesToSign }),
      });

      if (fileRes.ok) {
        const fileData = await fileRes.json();
        if (Array.isArray(fileData.data)) {
          for (const item of fileData.data) {
            if (item.gcsKey && item.signUrl) {
              signUrlMap.set(item.gcsKey, item.signUrl);
            }
          }
        }
      }
    } catch (fileErr) {
      console.warn('Failed to resolve signed URLs for files:', fileErr);
    }
  }

  // 4. Transform and map raw card entities
  // Load existing cards from IndexedDB to preserve locally cached media and previews
  const existingDbCards = await db.cards.toArray().catch(() => []);
  const existingDbMap = new Map(existingDbCards.map(c => [c.cardId, c]));

  const isAudioKey = (key?: string) =>
    Boolean(
      key &&
        (/\.(aac|wav|m4a|mp3|ogg|flac|opus)$/i.test(key) || key.includes('/audioRequest/'))
    );
  const isImageKey = (key?: string) =>
    Boolean(
      key &&
        (/\.(webp|jpg|jpeg|png|gif|heic)$/i.test(key) ||
          (key.includes('/imageRequest/') && !isAudioKey(key)))
    );

  const mappedCards: Card[] = rawCardItems.map((raw, idx) => {
    const cardId = raw.cardId || `card_${idx}_${Date.now()}`;
    let inner: any = {};
    try {
      if (typeof raw.client_request_response === 'string') {
        inner = JSON.parse(raw.client_request_response);
      } else if (raw.client_request_response) {
        inner = raw.client_request_response;
      }
    } catch {
      inner = {};
    }

    const cardInfo = inner.cards || {};
    const resources: any[] = Array.isArray(inner.card_resources) ? inner.card_resources : [];
    const analysis: any[] = Array.isArray(inner.card_analysis) ? inner.card_analysis : [];
    const speakers: any[] = Array.isArray(inner.meeting_speakers) ? inner.meeting_speakers : [];
    const rawEvents: any[] = Array.isArray(inner.card_events) ? inner.card_events : [];
    const events = rawEvents
      .map((ev: any, evIdx: number) => ({
        eventId: ev.special_key || ev.card_event_id || `${cardId}_ev_${evIdx}`,
        cardId,
        title: String(ev.title || ''),
        content: ev.content ? String(ev.content) : undefined,
        check: ev.check === true || ev.check === 1 ? 1 : 0,
        time: typeof ev.time === 'number' && ev.time > 0 ? ev.time : undefined,
        isPotentialReminder: Boolean(ev.is_potential_reminder),
      }))
      .filter(ev => ev.title);
    const rawTags: any[] = Array.isArray(inner.card_hashtag_cross_ref)
      ? inner.card_hashtag_cross_ref
      : [];
    const tags: string[] = rawTags
      .map(t => (typeof t === 'string' ? t.trim() : (t?.hashtag || t?.name || '').trim()))
      .filter(Boolean);

    // Primary image resource
    let imageUrl: string | undefined;
    const imageRes = resources.find(
      r => r.raw_type === 'IMAGE' || r.mime_type?.includes('image') || isImageKey(r.remote_gcsKey)
    );
    if (imageRes?.remote_gcsKey && signUrlMap.has(imageRes.remote_gcsKey)) {
      imageUrl = signUrlMap.get(imageRes.remote_gcsKey);
    } else if (Array.isArray(raw.files)) {
      const imgFile = raw.files.find((f: any) => isImageKey(f.gcsKey));
      if (imgFile?.gcsKey && signUrlMap.has(imgFile.gcsKey)) {
        imageUrl = signUrlMap.get(imgFile.gcsKey);
      }
    }

    // Audio resource & Whisper transcription
    let audioUri: string | undefined;
    let transcript: string | undefined;
    let audioDurationSec = 45;
    let audioStartTime: number | undefined;
    let audioEndTime: number | undefined;
    let audioTimestampsRaw: string | undefined;
    let highlightTimestamps: number[] | undefined;

    const audioRes = resources.find(
      r =>
        r.raw_type === 'AUDIO' ||
        r.raw_type === 'RECORDING' ||
        r.mime_type?.includes('audio') ||
        isAudioKey(r.remote_gcsKey)
    );
    if (audioRes?.remote_gcsKey && signUrlMap.has(audioRes.remote_gcsKey)) {
      audioUri = signUrlMap.get(audioRes.remote_gcsKey);
    } else if (Array.isArray(raw.files)) {
      const audFile = raw.files.find((f: any) => isAudioKey(f.gcsKey));
      if (audFile?.gcsKey && signUrlMap.has(audFile.gcsKey)) {
        audioUri = signUrlMap.get(audFile.gcsKey);
      }
    }

    if (audioRes?.metadata) {
      try {
        const audMeta =
          typeof audioRes.metadata === 'string'
            ? JSON.parse(audioRes.metadata)
            : audioRes.metadata;
        if (typeof audMeta?.duration === 'number' && audMeta.duration > 0) {
          audioDurationSec =
            audMeta.duration > 500
              ? Math.max(1, Math.round(audMeta.duration / 1000))
              : audMeta.duration;
        }
        if (typeof audMeta?.start_time === 'number') audioStartTime = audMeta.start_time;
        if (typeof audMeta?.end_time === 'number') audioEndTime = audMeta.end_time;
        if (audMeta?.timestamps) {
          audioTimestampsRaw = String(audMeta.timestamps);
          const parsedMarks = audioTimestampsRaw
            .split(',')
            .map(s => Number(s.trim()))
            .filter(n => !isNaN(n) && n >= 0)
            .map(n => (n > 500 ? Math.round(n / 1000) : n));
          if (parsedMarks.length > 0) {
            highlightTimestamps = parsedMarks;
          }
        }
      } catch {}
    }

    const transcriptRes = resources.find(
      r => r.raw_type === 'TRANSCRIPTION' || (r.mime_type?.includes('text') && r.raw_type !== 'LINK' && r.raw_type !== 'URL')
    );
    if (transcriptRes?.data) {
      transcript = transcriptRes.data;
    }

    const textRes = resources.find(
      r => r.raw_type === 'TEXT' || r.raw_type === 'CLIPPED_TEXT' || r.raw_type === 'NOTE_TEXT'
    );
    const userText = textRes?.data || inner.card_input_extras?.[0]?.content || transcript;
    if (!transcript && userText) {
      transcript = userText;
    }

    const rawType = (cardInfo.type || '').toUpperCase();
    let cardType: CardType = 'TEXT';
    if (
      rawType.includes('AUDIO') ||
      rawType.includes('RECORD') ||
      rawType.includes('VOICE') ||
      (audioUri && !imageUrl)
    ) {
      cardType = 'AUDIO';
    } else if (rawType.includes('LINK') || rawType.includes('URL')) {
      cardType = 'LINK';
    } else if (rawType.includes('TODO')) {
      cardType = 'TODO';
    } else if (rawType.includes('IMAGE') || imageUrl) {
      cardType = 'IMAGE';
    }

    let linkUrl: string | undefined;
    let linkMeta: any = {};
    const linkRes = resources.find(
      r =>
        r.raw_type === 'URL' ||
        r.raw_type === 'LINK' ||
        (typeof r.data === 'string' && /^https?:\/\/\S+$/i.test(r.data.trim()))
    );
    if (linkRes?.data) {
      linkUrl = String(linkRes.data).trim();
      if (linkRes.metadata) {
        try {
          linkMeta =
            typeof linkRes.metadata === 'string'
              ? JSON.parse(linkRes.metadata)
              : linkRes.metadata || {};
        } catch {
          linkMeta = {};
        }
      }
    } else if (cardType === 'LINK' && transcript && /^https?:\/\/\S+$/i.test(transcript.trim())) {
      linkUrl = transcript.trim();
    }

    if (cardType === 'LINK' && !audioUri && transcript && /^https?:\/\/\S+$/i.test(transcript.trim())) {
      transcript = undefined;
    }

    let linkDomain: string | undefined = linkMeta.domain;
    if (!linkDomain && linkUrl) {
      try {
        linkDomain = new URL(linkUrl).hostname.replace(/^www\./, '');
      } catch {
        linkDomain = undefined;
      }
    }

    const linkPreview: string | undefined = linkMeta.preview || imageUrl;
    const linkFavicon: string | undefined = linkMeta.fav_icon || linkMeta.favicon;
    const linkSiteName: string | undefined = linkMeta.site_name;

    let bulletPointsTitle: string | undefined;
    const bulletPoints: string[] = [];
    const infoExtract: Array<{ title: string; value: string }> = [];
    const keyTopics: Array<{
      title: string;
      detailedSummary: string;
      timestampReference?: string;
    }> = [];
    const mainTopics: Array<{ title: string; content: string }> = [];
    let emotionalSummary: string | undefined;
    const locations: Array<{ locationName: string; locationUrl: string }> = [];
    const freeformInsights: Array<{
      title?: string;
      content?: string;
      nextActions?: Array<{ title: string; prompt: string }>;
    }> = [];

    for (const a of analysis) {
      let meta: any = {};
      try {
        meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : a.metadata || {};
      } catch {
        meta = {};
      }

      if (a.raw_type === 'BULLET_POINTS' && meta.bulletPointItem) {
        if (meta.title && !bulletPointsTitle) {
          bulletPointsTitle = String(meta.title);
        }
        const items = String(meta.bulletPointItem).split('\n').filter(Boolean);
        bulletPoints.push(...items);
      } else if (a.raw_type === 'INFO_EXTRACT' && meta.extractedInformation) {
        infoExtract.push({
          title: meta.title || 'Info',
          value: String(meta.extractedInformation),
        });
      } else if (a.raw_type === 'MEETING_KEY_TOPIC_ANALYSIS') {
        if (meta.title || meta.detailed_summary) {
          keyTopics.push({
            title: meta.title || 'Key Moment',
            detailedSummary: meta.detailed_summary || '',
            timestampReference: meta.timestamp_reference || undefined,
          });
        }
        if (!transcript && meta.detailed_summary) {
          transcript = meta.detailed_summary;
        }
      } else if (a.raw_type === 'MEETING_MAIN_TOPIC') {
        if (meta.title || meta.content) {
          mainTopics.push({
            title: meta.title || 'Topic',
            content: meta.content || '',
          });
        }
      } else if (a.raw_type === 'MEETING_EMOTIONAL_SUMMARY') {
        if (typeof a.metadata === 'string' && !a.metadata.trim().startsWith('{')) {
          emotionalSummary = a.metadata.trim();
        } else if (meta.summary || meta.content) {
          emotionalSummary = String(meta.summary || meta.content);
        }
      } else if (a.raw_type === 'LOCATION' && (meta.locationName || meta.location)) {
        locations.push({
          locationName: meta.locationName || 'Location',
          locationUrl: meta.location || '',
        });
      } else if (a.raw_type === 'FREEFORM' && (meta.title || meta.content)) {
        let nextActions: Array<{ title: string; prompt: string }> | undefined;
        if (meta.nextActionJson) {
          try {
            const parsedNext =
              typeof meta.nextActionJson === 'string'
                ? JSON.parse(meta.nextActionJson)
                : meta.nextActionJson;
            if (Array.isArray(parsedNext) && parsedNext.length > 0) {
              nextActions = parsedNext
                .map((na: any) => ({
                  title: String(na.title || ''),
                  prompt: String(na.prompt || ''),
                }))
                .filter((na: any) => na.title);
            }
          } catch {}
        }
        freeformInsights.push({
          title: meta.title || undefined,
          content: meta.content || undefined,
          nextActions,
        });
      }
    }

    const collectionId: string | undefined =
      raw.collectionId ||
      raw.collection_id ||
      cardInfo.collection_id ||
      cardInfo.collectionId ||
      (Array.isArray(inner.card_collection_cross_ref) &&
        (inner.card_collection_cross_ref[0]?.collection_id ||
          inner.card_collection_cross_ref[0]?.collectionId)) ||
      undefined;

    return {
      cardId,
      userId: user.uuid,
      collectionId,
      type: cardType,
      title: cardInfo.title || (cardType === 'AUDIO' ? 'Voice Note' : 'Untitled Note'),
      summary: cardInfo.summary || undefined,
      content: userText || cardInfo.summary || undefined,
      imageUrl: imageUrl || (cardType === 'LINK' ? linkPreview : undefined),
      cachedImageUrl: existingDbMap.get(cardId)?.cachedImageUrl,
      captureFrom: cardInfo.capture_from || undefined,
      tags,
      bulletPointsTitle,
      bulletPoints: bulletPoints.length > 0 ? bulletPoints : undefined,
      infoExtract: infoExtract.length > 0 ? infoExtract : undefined,
      keyTopics: keyTopics.length > 0 ? keyTopics : undefined,
      mainTopics: mainTopics.length > 0 ? mainTopics : undefined,
      emotionalSummary,
      locations: locations.length > 0 ? locations : undefined,
      freeformInsights: freeformInsights.length > 0 ? freeformInsights : undefined,
      speakers:
        speakers.length > 0
          ? speakers.map(s => ({ speakerId: s.speaker_id, description: s.description }))
          : undefined,
      targetState: raw._isTrash ? 1 : (cardInfo.target_state ?? 0),
      createTime: cardInfo.create_time || raw.clientCreateTime || raw.deleteAt || Date.now(),
      updateTime: raw.deleteAt || cardInfo.update_time || raw.clientUpdateTime || Date.now(),
      events: events.length > 0 ? events : undefined,
      link:
        cardType === 'LINK' || linkUrl
          ? {
              url: linkUrl || '',
              title: cardInfo.title || linkMeta.title || linkUrl || 'Saved Link',
              description: cardInfo.summary || linkMeta.description || undefined,
              domain: linkDomain,
              siteName: linkSiteName,
              favicon: linkFavicon,
              preview: linkPreview,
            }
          : undefined,
      audio:
        cardType === 'AUDIO' || audioUri || transcript
          ? {
              audioUri,
              transcript,
              duration: audioDurationSec,
              startTime: audioStartTime,
              endTime: audioEndTime,
              timestamps: audioTimestampsRaw,
              highlightTimestamps,
            }
          : undefined,
      clientVersion: raw.clientVersion || 2,
      rawClientRequestResponse:
        typeof raw.client_request_response === 'string'
          ? raw.client_request_response
          : JSON.stringify(raw.client_request_response || {}),
      files: Array.isArray(raw.files) ? raw.files : [],
    };
  });

  // 5. Fetch collections
  let mappedCollections: Collection[] = [];
  let collectionsFetched = false;
  try {
    const collRes = await nothingFetch(`${NOTHING_BASE_URL}/storage/collection/v1/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    if (collRes.ok) {
      const collData = await collRes.json();
      const rawColl = Array.isArray(collData.data) ? collData.data : [];
      mappedCollections = rawColl.map((rc: any) => ({
        collectionId: rc.collectionId || rc.collection_id,
        userId: user.uuid,
        name: rc.name || rc.collectionName || 'Collection',
        color: rc.color || '#FFFFFF',
        updateTime: rc.updateTime || Date.now(),
      }));
      collectionsFetched = true;
    }
  } catch (collErr) {
    console.warn('Failed to fetch collections:', collErr);
  }

  // Attach collectionName & collectionNames to cards
  if (mappedCollections.length > 0) {
    const collMap = new Map(mappedCollections.map(c => [c.collectionId, c.name]));
    for (const card of mappedCards) {
      if (card.collectionIds && card.collectionIds.length > 0) {
        card.collectionNames = card.collectionIds
          .map(id => collMap.get(id))
          .filter((n): n is string => Boolean(n));
        card.collectionName = card.collectionNames.join(', ');
      } else if (card.collectionId && collMap.has(card.collectionId)) {
        const colName = collMap.get(card.collectionId);
        if (colName) {
          card.collectionName = colName;
          card.collectionNames = [colName];
          card.collectionIds = [card.collectionId];
        }
      }
    }
  }

  // 6. Save directly to IndexedDB with reconciliation (purges deleted collections & cards)
  await saveDbCards(mappedCards, true);
  if (collectionsFetched) {
    await saveDbCollections(mappedCollections, true);
  }
  await setDbMeta('lastSyncTime', Date.now());
  await setDbMeta('cardsCount', mappedCards.length);

  return {
    success: true,
    cardsCount: mappedCards.length,
    collectionsCount: mappedCollections.length,
    lastSyncTime: Date.now(),
  };
}
