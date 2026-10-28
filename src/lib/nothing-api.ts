import { createHash } from 'crypto';
import type { Card, CardType, Collection, NothingUser, SyncResult } from '@/types';
import { getUserAuth, saveUserAuth, saveUserCards, saveUserCollections, saveUserSyncMetadata } from './storage';
import { refreshNothingAccessToken } from './nothing-auth';

const NOTHING_BASE = process.env.NOTHING_API_URL || 'https://essential-space.nothingtech.link/essentialSpace';
const NOTHING_API_KEY = process.env.NOTHING_API_KEY || 'ZNtCkkSHqahusjfyouYxeaHUryeqKNaG';

function getNothingAuthHeaders(token: string) {
  const ts = Date.now().toString();
  const auth = createHash('md5')
    .update(NOTHING_API_KEY + ts)
    .digest('hex');

  return {
    'Authorization': `Bearer ${token}`,
    'timestamp': ts,
    'auth': auth,
    'Content-Type': 'application/json; charset=UTF-8',
    'User-Agent': 'okhttp/4.12.0',
  };
}

export async function authenticateNothingUser(tokenOrCredentials: {
  token?: string;
  refreshToken?: string;
  email?: string;
  password?: string;
}): Promise<NothingUser> {
  let token = tokenOrCredentials.token?.trim();
  let refreshToken = tokenOrCredentials.refreshToken?.trim();

  // 1. Sanitize token input (strip quotes, Bearer prefix, handle JSON object or multi-token strings)
  if (token) {
    token = token.replace(/^["']|["']$/g, '').trim();
    if (token.toLowerCase().startsWith('bearer ')) {
      token = token.slice(7).trim();
    }
    // Handle pasted JSON e.g. {"token":"...","refreshToken":"..."}
    if (token.startsWith('{') && token.endsWith('}')) {
      try {
        const parsed = JSON.parse(token);
        if (parsed.token || parsed.accessToken) token = (parsed.token || parsed.accessToken).trim();
        if (parsed.refreshToken) refreshToken = parsed.refreshToken.trim();
      } catch {
        // ignore parse error
      }
    } else if (token.includes('\n') || token.includes(' ')) {
      // Handle pasted two tokens (e.g. accessToken and refreshToken separated by space or newline)
      const parts = token.split(/[\s\r\n]+/).map(p => p.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      if (parts.length >= 2) {
        const jwtPart = parts.find(p => p.startsWith('eyJ'));
        const nonJwtPart = parts.find(p => !p.startsWith('eyJ'));
        if (jwtPart) token = jwtPart;
        if (nonJwtPart && !refreshToken) refreshToken = nonJwtPart;
      }
    }
  }

  if (refreshToken) {
    refreshToken = refreshToken.replace(/^["']|["']$/g, '').trim();
    if (refreshToken.toLowerCase().startsWith('bearer ')) {
      refreshToken = refreshToken.slice(7).trim();
    }
  }

  if (!token && refreshToken) {
    const refreshed = await refreshNothingAccessToken(refreshToken);
    if (refreshed?.accessToken) {
      token = refreshed.accessToken;
      refreshToken = refreshed.refreshToken || refreshToken;
    }
  }

  if (!token) {
    throw new Error('Please provide a Nothing Account access token or sign in with email and password.');
  }

  // If the pasted token is actually a refreshToken (not a JWT starting with eyJ), try exchanging it
  if (!token.startsWith('eyJ')) {
    const refreshed = await refreshNothingAccessToken(token);
    if (refreshed?.accessToken) {
      refreshToken = refreshed.refreshToken || token;
      token = refreshed.accessToken;
    }
  }

  let uuid = `nt_user_${Date.now()}`;
  let email = tokenOrCredentials.email?.trim() || 'user@nothing.tech';
  let userName = 'Nothing User';

  // Try parsing JWT payload to automatically extract user profile
  const parseJwtProfile = (jwtStr: string) => {
    try {
      const parts = jwtStr.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
        if (payload.uuid) uuid = payload.uuid;
        else if (payload.sub && String(payload.sub).includes('-')) uuid = payload.sub;
        else if (payload.sub) uuid = `sub_${payload.sub}`;
        if (payload.email) email = payload.email;
        if (payload.given_name || payload.family_name) {
          userName = [payload.given_name, payload.family_name].filter(Boolean).join(' ');
        }
      }
    } catch {
      // ignore
    }
  };

  parseJwtProfile(token);

  // Strictly verify token against Nothing Cloud card list endpoint (which validates active session JWT)
  let res: Response;
  try {
    res = await fetch(`${NOTHING_BASE}/storage/card/v1/list`, {
      method: 'POST',
      headers: getNothingAuthHeaders(token),
      body: JSON.stringify({ pageNo: 1, pageSize: 1 }),
      cache: 'no-store',
    });
  } catch (netErr: any) {
    throw new Error(
      `Unable to reach Nothing Cloud (${netErr?.message || 'Network error'}). Please check server internet connectivity.`
    );
  }

  let verifyJson: any = null;
  try {
    verifyJson = await res.clone().json();
  } catch {
    verifyJson = null;
  }

  const isAuthInvalid = (r: Response, j: any) =>
    r.status === 401 || r.status === 403 || (j && typeof j.ret === 'number' && j.ret !== 200);

  // If 401/invalid and we have a refreshToken, try refreshing automatically
  if (isAuthInvalid(res, verifyJson) && refreshToken) {
    const refreshed = await refreshNothingAccessToken(refreshToken);
    if (refreshed?.accessToken) {
      token = refreshed.accessToken;
      refreshToken = refreshed.refreshToken || refreshToken;
      parseJwtProfile(token);
      if (refreshed.idToken) parseJwtProfile(refreshed.idToken);
      try {
        res = await fetch(`${NOTHING_BASE}/storage/card/v1/list`, {
          method: 'POST',
          headers: getNothingAuthHeaders(token),
          body: JSON.stringify({ pageNo: 1, pageSize: 1 }),
          cache: 'no-store',
        });
        try {
          verifyJson = await res.clone().json();
        } catch {
          verifyJson = null;
        }
      } catch (retryErr: any) {
        throw new Error(
          `Unable to reach Nothing Cloud during token refresh: ${retryErr?.message || 'Network error'}`
        );
      }
    }
  }

  if (!res.ok || isAuthInvalid(res, verifyJson)) {
    const errBody = verifyJson?.errMsg || (await res.text().catch(() => ''));
    throw new Error(
      `Access token is expired or invalidated by Nothing Cloud (${errBody || res.status}). Please sign in again on account.nothing.tech.`
    );
  }

  // Preserve email/userName from existing saved profile if JWT only had uuid
  const existingAuth = await getUserAuth(uuid);
  if (existingAuth) {
    if (email === 'user@nothing.tech' && existingAuth.email) email = existingAuth.email;
    if (userName === 'Nothing User' && existingAuth.userName) userName = existingAuth.userName;
    if (!refreshToken && existingAuth.refreshToken) refreshToken = existingAuth.refreshToken;
  }

  const userObj: NothingUser = {
    uuid,
    email,
    userName,
    nickName: userName,
    token,
    refreshToken,
    country: 'EU',
  };

  await saveUserAuth(userObj);
  return userObj;
}

export async function syncUserData(user: NothingUser): Promise<SyncResult> {
  try {
    const storedAuth = await getUserAuth(user.uuid);
    let activeToken = storedAuth?.token || user.token;
    let activeRefreshToken = user.refreshToken || storedAuth?.refreshToken;

    // 1. Fetch real cards from Nothing Cloud API
    let response = await fetch(`${NOTHING_BASE}/storage/card/v1/list`, {
      method: 'POST',
      headers: getNothingAuthHeaders(activeToken),
      body: JSON.stringify({ pageNo: 1, pageSize: 100 }),
      cache: 'no-store',
    });
    let resJson: any = null;
    try {
      resJson = await response.clone().json();
    } catch {
      resJson = null;
    }

    const isTokenRejected = (r: Response, j: any) =>
      r.status === 401 || r.status === 403 || (j && typeof j.ret === 'number' && j.ret !== 200);

    // Automatic token refresh if 401/rejected and refreshToken is available
    if (isTokenRejected(response, resJson) && activeRefreshToken) {
      const refreshed = await refreshNothingAccessToken(activeRefreshToken);
      if (refreshed?.accessToken) {
        activeToken = refreshed.accessToken;
        activeRefreshToken = refreshed.refreshToken || activeRefreshToken;
        user.token = activeToken;
        user.refreshToken = activeRefreshToken;
        await saveUserAuth(user);
        response = await fetch(`${NOTHING_BASE}/storage/card/v1/list`, {
          method: 'POST',
          headers: getNothingAuthHeaders(activeToken),
          body: JSON.stringify({ pageNo: 1, pageSize: 100 }),
          cache: 'no-store',
        });
        try {
          resJson = await response.clone().json();
        } catch {
          resJson = null;
        }
      }
    }

    if (!response.ok || isTokenRejected(response, resJson)) {
      const errText = resJson?.errMsg || (await response.text());
      throw new Error(
        `AUTH_EXPIRED: Session token expired or was invalidated by Nothing Cloud (${errText || response.status}). Please sign in again.`
      );
    }

    if (!resJson) {
      resJson = await response.json();
    }
    const rawCardItems: any[] = [...(resJson?.data?.page_data || [])];

    // Fetch additional pages if user has more than 100 cards
    let pageNo = 2;
    let lastPageLen = (resJson?.data?.page_data || []).length;
    while (lastPageLen === 100 && pageNo <= 10) {
      const nextRes = await fetch(`${NOTHING_BASE}/storage/card/v1/list`, {
        method: 'POST',
        headers: getNothingAuthHeaders(activeToken),
        body: JSON.stringify({ pageNo, pageSize: 100 }),
        cache: 'no-store',
      });
      if (!nextRes.ok) break;
      const nextJson = await nextRes.json();
      const pageData: any[] = nextJson?.data?.page_data || [];
      rawCardItems.push(...pageData);
      lastPageLen = pageData.length;
      pageNo++;
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
        const fileRes = await fetch(`${NOTHING_BASE}/storage/card/v1/files`, {
          method: 'POST',
          headers: getNothingAuthHeaders(activeToken),
          body: JSON.stringify({ files: filesToSign }),
          cache: 'no-store',
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
      } catch (e) {
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

      // Check primary image resource
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

      // Check audio resource & Whisper transcription
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

      // Check for user-written text notes in card_resources (raw_type 'TEXT' / 'CLIPPED_TEXT') or card_input_extras
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

      // Check for link URL and metadata in resources or transcript
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

      // If transcript is just a URL on a LINK card without audio, don't treat it as a voice transcript
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

      // Analysis parsing (bullet points, summaries, key values, meeting topics, locations, freeform insights)
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
        targetState: 0,
        createTime: cardInfo.create_time || raw.clientCreateTime || Date.now(),
        updateTime: cardInfo.update_time || raw.clientUpdateTime || Date.now(),
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
                speakerName: speakers[0]?.speaker_id || 'Speaker',
              }
            : undefined,
      };
    });

    // 5. Fetch collections
    let mappedCollections: Collection[] = [];
    try {
      const collRes = await fetch(`${NOTHING_BASE}/storage/collection/v1/list`, {
        method: 'POST',
        headers: getNothingAuthHeaders(activeToken),
        body: JSON.stringify({}),
        cache: 'no-store',
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
      }
    } catch (collErr) {
      console.warn('Failed to fetch collections:', collErr);
    }

    // Attach collectionName to cards that belong to a collection
    if (mappedCollections.length > 0) {
      const collMap = new Map(mappedCollections.map(c => [c.collectionId, c.name]));
      for (const card of mappedCards) {
        if (card.collectionId && collMap.has(card.collectionId)) {
          card.collectionName = collMap.get(card.collectionId);
        }
      }
    }

    // 6. Save cards & metadata into persistent storage
    await saveUserCards(user.uuid, mappedCards);
    await saveUserCollections(user.uuid, mappedCollections);
    await saveUserSyncMetadata(user.uuid, {
      lastSyncTime: Date.now(),
      cardsCount: mappedCards.length,
    });

    return {
      success: true,
      cardsCount: mappedCards.length,
      collectionsCount: mappedCollections.length,
      lastSyncTime: Date.now(),
    };
  } catch (error: any) {
    console.error('Error during Nothing Cloud sync:', error);
    return {
      success: false,
      cardsCount: 0,
      collectionsCount: 0,
      lastSyncTime: 0,
      error: error?.message || 'Failed to sync with Nothing Cloud',
    };
  }
}
