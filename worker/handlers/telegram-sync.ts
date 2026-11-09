import type { Env } from '../types';

interface TelegramSyncPayload {
  userId: string;
  cards: any[];
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

// In-memory cache to guarantee deduplication even if KV namespace is not yet bound
const publishedMemorySet = new Set<string>();

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

  // Content or transcript (if distinct from summary)
  if (card.content && card.content !== card.summary) {
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
      const kvKey = `tg_sent_${card.cardId}`;

      // In-memory deduplication check
      if (publishedMemorySet.has(card.cardId)) {
        results.push({ cardId: card.cardId, status: 'skipped' });
        continue;
      }

      // Check if already published in Cloudflare KV
      if (env.TELEGRAM_POSTS_KV) {
        try {
          const existing = await env.TELEGRAM_POSTS_KV.get(kvKey);
          if (existing) {
            publishedMemorySet.add(card.cardId);
            results.push({ cardId: card.cardId, status: 'skipped' });
            continue;
          }
        } catch (kvErr) {
          console.warn(`[Telegram Sync] KV read error for ${kvKey}:`, kvErr);
        }
      }

      const postText = formatCardPost(card);
      const previewImg = card.imageUrl || card.link?.preview;

      try {
        let sendRes: Response;

        // 1. Handle Card with Image / Link Preview Image
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

          // If full caption exceeded 1024 characters, follow up with the remainder
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
        } else if (card.audio?.audioUri && /^https?:\/\//i.test(card.audio.audioUri)) {
          // 2. Handle Voice / Audio Card
          const caption = postText.slice(0, 1024);
          sendRes = await fetch(`${tgApiBase}/sendAudio`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: targetChatId,
              audio: card.audio.audioUri,
              title: card.title || 'Voice Note',
              caption,
              parse_mode: 'HTML',
            }),
          });
        } else {
          // 3. Handle Standard Text / Link Note (with Telegram rich link preview)
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
        }

        const resData: any = await sendRes.json().catch(() => ({}));

        if (!sendRes.ok || !resData.ok) {
          throw new Error(resData.description || `Telegram API error (${sendRes.status})`);
        }

        const messageId = resData.result?.message_id;

        // Remember in memory
        publishedMemorySet.add(card.cardId);

        // Record in KV as published
        if (env.TELEGRAM_POSTS_KV) {
          try {
            await env.TELEGRAM_POSTS_KV.put(
              kvKey,
              JSON.stringify({
                messageId,
                publishedAt: Date.now(),
              })
            );
          } catch (kvPutErr) {
            console.warn(`[Telegram Sync] KV write error for ${kvKey}:`, kvPutErr);
          }
        }

        results.push({ cardId: card.cardId, status: 'published', messageId });
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
