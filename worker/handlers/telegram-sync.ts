import type { Env } from '../types';

interface TelegramSyncPayload {
  userId: string;
  cards?: any[];
  alreadySentIds?: string[];
  unpublishCardIds?: string[];
  unassignedCardIds?: string[];
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

// In-memory cache to guarantee deduplication even across rapid concurrent requests
const publishedMemorySet = new Set<string>();

function sanitizeKvKey(key: string): string {
  if (!key) return '';
  return String(key)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-\.:]/g, '')
    .slice(0, 450);
}

function getCardFingerprint(card: any): string {
  const title = String(card.title || '').trim().toLowerCase();
  const summary = String(card.summary || card.content || '').slice(0, 60).trim().toLowerCase();
  const time = String(card.createTime || '');
  return `fp_${title}_${time}_${summary}`;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeHashtag(name: string): string {
  return name.trim().replace(/[\s\-\.\,\/]+/g, '_').replace(/[^\w\u0400-\u04FF_]/g, '');
}

function formatCardPost(card: any): string {
  const parts: string[] = [];

  // Domain detection for Link cards
  let domain = card.link?.domain || card.link?.siteName;
  if (!domain && card.link?.url) {
    try {
      domain = new URL(card.link.url).hostname.replace(/^www\./, '');
    } catch {}
  }

  // Title
  const mainTitle = card.title || card.link?.title;
  if (mainTitle) {
    parts.push(`<b>${escapeHtml(mainTitle)}</b>`);
  }

  // Domain badge (for Link cards)
  if (domain) {
    parts.push(`🌐 <i>${escapeHtml(domain)}</i>`);
  }

  // Summary (Styled Quote block)
  if (card.summary) {
    parts.push(`<blockquote>💡 <b>Summary:</b>\n${escapeHtml(card.summary)}</blockquote>`);
  }

  // Bullet points
  if (Array.isArray(card.bulletPoints) && card.bulletPoints.length > 0) {
    const bullets = card.bulletPoints.map((b: string) => `• ${escapeHtml(b)}`).join('\n');
    parts.push(bullets);
  }

  // Voice memo transcription (if present)
  const transcript =
    card.audio?.transcript ||
    (card.type === 'AUDIO' && card.content !== card.summary ? card.content : undefined);
  if (transcript && transcript !== card.summary) {
    parts.push(`🎙️ <b>Транскрипція:</b>\n<i>${escapeHtml(transcript)}</i>`);
  }

  // Content or additional notes (if distinct from summary & transcript)
  if (card.content && card.content !== card.summary && card.content !== transcript) {
    parts.push(escapeHtml(card.content));
  }

  // Direct Link Button/URL
  if (card.link?.url) {
    const linkTitle = card.link.title || domain || 'Open Link';
    parts.push(`🔗 <a href="${escapeHtml(card.link.url)}">${escapeHtml(linkTitle)}</a>`);
  }

  // Checklist events
  if (Array.isArray(card.events) && card.events.length > 0) {
    const eventLines = card.events.map((e: any) => {
      const mark = e.check === 1 ? '☑' : '◻';
      return `${mark} ${escapeHtml(e.title || 'Task')}`;
    });
    parts.push(eventLines.join('\n'));
  }

  // Hashtags from other collections and card tags
  const tags: string[] = [];
  if (Array.isArray(card.collectionNames)) {
    for (const cName of card.collectionNames) {
      const lower = cName.trim().toLowerCase();
      if (
        lower === 'for telegram' ||
        lower === 'for telegrm' ||
        lower === 'telegram' ||
        lower === 'для телеграм' ||
        lower === 'для телеграму' ||
        lower.startsWith('tg ') ||
        lower.endsWith(' tg')
      ) {
        continue;
      }
      const tag = sanitizeHashtag(cName);
      if (tag) tags.push(`#${tag}`);
    }
  }

  if (Array.isArray(card.tags)) {
    for (const t of card.tags) {
      const tag = sanitizeHashtag(String(t));
      if (tag && !tags.includes(`#${tag}`)) tags.push(`#${tag}`);
    }
  }

  if (tags.length > 0) {
    parts.push(tags.join(' '));
  }

  return parts.join('\n\n');
}

export async function handleTelegramSync(req: Request, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Diagnostic endpoint to check KV state & contents
  if (req.method === 'GET') {
    let kvKeys: string[] = [];
    let kvCount = 0;
    let kvError: string | null = null;
    if (env.TELEGRAM_POSTS_KV) {
      try {
        const listRes = await env.TELEGRAM_POSTS_KV.list({ limit: 100 });
        kvKeys = listRes.keys.map((k: any) => k.name);
        kvCount = kvKeys.length;
      } catch (err: any) {
        kvError = err?.message || String(err);
      }
    }
    return new Response(
      JSON.stringify(
        {
          status: 'ok',
          hasKV: Boolean(env.TELEGRAM_POSTS_KV),
          kvCount,
          kvKeys,
          kvError,
          memoryCacheSize: publishedMemorySet.size,
        },
        null,
        2
      ),
      {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    );
  }

  // Explicit DELETE endpoint: remove published record from KV to allow republishing
  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const cardId = url.searchParams.get('cardId');
    if (!cardId) {
      return new Response(JSON.stringify({ error: 'Missing cardId parameter' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const cleanId = sanitizeKvKey(cardId);
    const kvKey = `tg_sent_${cleanId}`;
    let deletedFpKey: string | null = null;

    publishedMemorySet.delete(cleanId);

    if (env.TELEGRAM_POSTS_KV) {
      try {
        const raw = await env.TELEGRAM_POSTS_KV.get(kvKey);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.fpKey) {
              deletedFpKey = parsed.fpKey;
              await env.TELEGRAM_POSTS_KV.delete(parsed.fpKey);
              publishedMemorySet.delete(parsed.fpKey);
            }
          } catch {}
        }
        await env.TELEGRAM_POSTS_KV.delete(kvKey);
      } catch (delErr: any) {
        console.warn(`[Telegram Sync] Failed to delete ${kvKey} from KV:`, delErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        forgottenCardId: cardId,
        forgottenFpKey: deletedFpKey,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    let body: TelegramSyncPayload;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { userId, cards } = body;

    // 1. Authorize: Check if userId matches configured allowed Nothing User ID
    if (env.TELEGRAM_ALLOWED_USER_ID && env.TELEGRAM_ALLOWED_USER_ID.trim()) {
      if (userId !== env.TELEGRAM_ALLOWED_USER_ID.trim()) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: unauthorized Nothing account.' }),
          { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 2. Validate Bot Token & Chat ID (support common aliases & case-insensitivity)
    const findEnv = (obj: any, ...candidates: string[]) => {
      if (!obj) return undefined;
      for (const c of candidates) {
        if (obj[c]) return String(obj[c]);
        for (const k of Object.keys(obj)) {
          if (k.toLowerCase() === c.toLowerCase() && obj[k]) {
            return String(obj[k]);
          }
        }
      }
      return undefined;
    };

    const botToken = findEnv(env, 'TELEGRAM_BOT_TOKEN', 'BOT_TOKEN', 'TELEGRAM_TOKEN', 'TG_BOT_TOKEN');
    const chatId = findEnv(env, 'TELEGRAM_CHAT_ID', 'CHAT_ID', 'TELEGRAM_CHANNEL_ID', 'TG_CHAT_ID');

    if (!botToken || !chatId) {
      const missing: string[] = [];
      if (!botToken) missing.push('TELEGRAM_BOT_TOKEN');
      if (!chatId) missing.push('TELEGRAM_CHAT_ID');
      console.error(`[Telegram Sync] Missing environment variables in Cloudflare: ${missing.join(', ')}`);
      return new Response(
        JSON.stringify({
          error: `Telegram Bot credentials missing in Cloudflare environment: ${missing.join(', ')}. Please add them under Worker Settings -> Variables and Secrets.`,
        }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Forget unassigned cards (removed from Telegram collection) so they can be republished if re-added
    const toForget: string[] = [
      ...(Array.isArray(body?.unpublishCardIds) ? body.unpublishCardIds : []),
      ...(Array.isArray(body?.unassignedCardIds) ? body.unassignedCardIds : []),
    ];

    if (toForget.length > 0 && env.TELEGRAM_POSTS_KV) {
      for (const rawId of toForget) {
        if (!rawId) continue;
        const cleanId = sanitizeKvKey(rawId);
        if (!cleanId) continue;
        const kvKey = `tg_sent_${cleanId}`;
        try {
          const raw = await env.TELEGRAM_POSTS_KV.get(kvKey);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed.fpKey) {
                await env.TELEGRAM_POSTS_KV.delete(parsed.fpKey);
                publishedMemorySet.delete(parsed.fpKey);
              }
            } catch {}
            await env.TELEGRAM_POSTS_KV.delete(kvKey);
            publishedMemorySet.delete(cleanId);
          }
        } catch (delErr) {
          console.warn(`[Telegram Sync] Error forgetting card ${cleanId}:`, delErr);
        }
      }
    }

    // 4. Pre-seed known sent IDs from client into memory and KV (cross-device sync)
    const alreadySentIds: string[] = Array.isArray(body?.alreadySentIds) ? body.alreadySentIds : [];
    if (alreadySentIds.length > 0) {
      for (const rawId of alreadySentIds) {
        if (typeof rawId === 'string' && rawId) {
          const cleanId = sanitizeKvKey(rawId);
          if (!cleanId) continue;
          publishedMemorySet.add(cleanId);
          if (env.TELEGRAM_POSTS_KV) {
            try {
              const existing = await env.TELEGRAM_POSTS_KV.get(`tg_sent_${cleanId}`);
              if (!existing) {
                await env.TELEGRAM_POSTS_KV.put(
                  `tg_sent_${cleanId}`,
                  JSON.stringify({ seeded: true, timestamp: Date.now() })
                );
              }
            } catch (kvErr) {
              console.warn('[Telegram Sync] KV seed error:', kvErr);
            }
          }
        }
      }
    }

    if (!Array.isArray(cards) || cards.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const tgApiBase = `https://api.telegram.org/bot${botToken.trim()}`;
    const targetChatId = chatId.trim();
    const results: Array<{ cardId: string; status: 'published' | 'skipped' | 'error'; messageId?: number; error?: string }> = [];

    for (const card of cards) {
      if (!card.cardId) continue;
      const cleanCardId = sanitizeKvKey(card.cardId);
      if (!cleanCardId) continue;
      const kvKey = `tg_sent_${cleanCardId}`;
      const rawFp = getCardFingerprint(card);
      const fpKey = rawFp ? `tg_fp_${sanitizeKvKey(rawFp)}` : '';

      // In-memory deduplication check (cardId + fingerprint)
      if (publishedMemorySet.has(cleanCardId) || (fpKey && publishedMemorySet.has(fpKey))) {
        results.push({ cardId: card.cardId, status: 'skipped' });
        continue;
      }

      // Check if already published in Cloudflare KV
      if (env.TELEGRAM_POSTS_KV) {
        try {
          const existing = await env.TELEGRAM_POSTS_KV.get(kvKey);
          const existingFp = existing || !fpKey ? null : await env.TELEGRAM_POSTS_KV.get(fpKey);
          if (existing || existingFp) {
            publishedMemorySet.add(cleanCardId);
            if (fpKey) publishedMemorySet.add(fpKey);
            results.push({ cardId: card.cardId, status: 'skipped' });
            continue;
          }
        } catch (kvErr) {
          console.warn(`[Telegram Sync] KV read error for ${kvKey}:`, kvErr);
        }
      }

      const postText = formatCardPost(card);
      const previewImg = card.imageUrl || card.link?.preview;

      // Attempt to download the audio recording if present (e.g. from Nothing Cloud GCS)
      let audioBlob: Blob | null = null;
      let audioFilename = 'voice_note.wav';
      if (card.audio?.audioUri && /^https?:\/\//i.test(card.audio.audioUri)) {
        try {
          const audioFetch = await fetch(card.audio.audioUri);
          if (audioFetch.ok) {
            const audioBuffer = await audioFetch.arrayBuffer();
            const mimeType = audioFetch.headers.get('content-type') || 'audio/wav';
            audioBlob = new Blob([audioBuffer], { type: mimeType });

            const ext = card.audio.audioUri.toLowerCase().includes('.mp3')
              ? 'mp3'
              : card.audio.audioUri.toLowerCase().includes('.m4a')
              ? 'm4a'
              : card.audio.audioUri.toLowerCase().includes('.ogg')
              ? 'ogg'
              : 'wav';
            const cleanTitle = sanitizeKvKey(card.title || 'voice_memo').slice(0, 30);
            audioFilename = `${cleanTitle || 'voice_memo'}.${ext}`;
          }
        } catch (audioDlErr) {
          console.warn(`[Telegram Sync] Could not fetch audio binary for ${card.cardId}:`, audioDlErr);
        }
      }

      try {
        let sendRes: Response;
        let sentMessageId: number | undefined;

        // CASE 1: Note has an Image (or Link Preview)
        if (previewImg && /^https?:\/\//i.test(previewImg)) {
          const caption = postText.slice(0, 1024);
          sendRes = await fetch(`${tgApiBase}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: targetChatId,
              photo: previewImg,
              caption,
              parse_mode: 'HTML',
            }),
          });
          const photoData: any = await sendRes.json().catch(() => ({}));
          if (!sendRes.ok || !photoData.ok) {
            throw new Error(photoData.description || `Telegram API error (${sendRes.status})`);
          }
          sentMessageId = photoData.result?.message_id;

          // If text exceeded 1024 chars, send remainder
          if (postText.length > 1024) {
            await fetch(`${tgApiBase}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: targetChatId,
                text: postText.slice(1024, 5120),
                parse_mode: 'HTML',
              }),
            });
          }

          // If note ALSO has an audio file, send it as a follow-up
          if (audioBlob) {
            try {
              const fd = new FormData();
              fd.append('chat_id', targetChatId);
              fd.append('audio', audioBlob, audioFilename);
              if (card.title) fd.append('title', card.title.slice(0, 64));
              if (card.audio?.duration) {
                fd.append('duration', String(Math.round(card.audio.duration)));
              }
              await fetch(`${tgApiBase}/sendAudio`, { method: 'POST', body: fd });
            } catch (extraAudioErr) {
              console.warn('[Telegram Sync] Follow-up audio sending error:', extraAudioErr);
            }
          }
        } else if (audioBlob) {
          // CASE 2: Note has an Audio recording (Voice Note / Audio File)
          try {
            const caption = postText.slice(0, 1024);
            const fd = new FormData();
            fd.append('chat_id', targetChatId);
            fd.append('audio', audioBlob, audioFilename);
            if (card.title) fd.append('title', card.title.slice(0, 64));
            fd.append('caption', caption);
            fd.append('parse_mode', 'HTML');
            if (card.audio?.duration) {
              fd.append('duration', String(Math.round(card.audio.duration)));
            }

            sendRes = await fetch(`${tgApiBase}/sendAudio`, {
              method: 'POST',
              body: fd,
            });
            const audioData: any = await sendRes.json().catch(() => ({}));
            if (!sendRes.ok || !audioData.ok) {
              throw new Error(audioData.description || `sendAudio failed (${sendRes.status})`);
            }
            sentMessageId = audioData.result?.message_id;

            // If text exceeded 1024 chars, send remainder
            if (postText.length > 1024) {
              await fetch(`${tgApiBase}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: targetChatId,
                  text: postText.slice(1024, 5120),
                  parse_mode: 'HTML',
                }),
              });
            }
          } catch (audioSendErr: any) {
            console.warn('[Telegram Sync] sendAudio failed, falling back to text message:', audioSendErr?.message || audioSendErr);
            // Fallback: send as text message with full transcription
            sendRes = await fetch(`${tgApiBase}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: targetChatId,
                text: postText.slice(0, 4096),
                parse_mode: 'HTML',
              }),
            });
            const textData: any = await sendRes.json().catch(() => ({}));
            if (!sendRes.ok || !textData.ok) {
              throw new Error(textData.description || `Telegram API error (${sendRes.status})`);
            }
            sentMessageId = textData.result?.message_id;
          }
        } else {
          // CASE 3: Standard Text / Link Note
          sendRes = await fetch(`${tgApiBase}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: targetChatId,
              text: postText.slice(0, 4096),
              parse_mode: 'HTML',
              link_preview_options: {
                is_disabled: false,
                prefer_large_media: true,
                show_above_text: false,
              },
            }),
          });
          const msgData: any = await sendRes.json().catch(() => ({}));
          if (!sendRes.ok || !msgData.ok) {
            throw new Error(msgData.description || `Telegram API error (${sendRes.status})`);
          }
          sentMessageId = msgData.result?.message_id;
        }

        // Remember in memory
        publishedMemorySet.add(cleanCardId);
        if (fpKey) publishedMemorySet.add(fpKey);

        // Record in KV as published (both by cardId and content fingerprint)
        if (env.TELEGRAM_POSTS_KV) {
          const metaStr = JSON.stringify({
            messageId: sentMessageId,
            title: card.title,
            publishedAt: Date.now(),
            fpKey: fpKey || undefined,
          });
          try {
            await env.TELEGRAM_POSTS_KV.put(kvKey, metaStr);
          } catch (kvPutErr: any) {
            console.warn(`[Telegram Sync] KV write error for ${kvKey}:`, kvPutErr?.message || kvPutErr);
          }
          if (fpKey) {
            try {
              await env.TELEGRAM_POSTS_KV.put(fpKey, metaStr);
            } catch (kvFpErr: any) {
              console.warn(`[Telegram Sync] KV write error for ${fpKey}:`, kvFpErr?.message || kvFpErr);
            }
          }
        }

        results.push({ cardId: card.cardId, status: 'published', messageId: sentMessageId });
      } catch (sendErr: any) {
        console.error(`[Telegram Sync] Failed to send card ${card.cardId}:`, sendErr);
        results.push({ cardId: card.cardId, status: 'error', error: sendErr?.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (fatalErr: any) {
    console.error('[Telegram Sync] Fatal error in handler:', fatalErr);
    return new Response(
      JSON.stringify({
        error: fatalErr?.message || 'Internal Server Error in Telegram Sync',
        stack: fatalErr?.stack,
      }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    );
  }
}
