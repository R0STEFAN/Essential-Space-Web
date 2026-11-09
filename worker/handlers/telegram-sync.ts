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

  // Title
  if (card.title) {
    parts.push(`<b>${escapeHtml(card.title)}</b>`);
  }

  // Summary (Quote block)
  if (card.summary) {
    parts.push(`<blockquote>${escapeHtml(card.summary)}</blockquote>`);
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

  // Link URL
  if (card.link?.url) {
    parts.push(`🔗 <a href="${escapeHtml(card.link.url)}">${escapeHtml(card.link.title || card.link.url)}</a>`);
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

  // 2. Validate Bot Token & Chat ID
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return new Response(
      JSON.stringify({
        error: 'Telegram Bot credentials not configured in Cloudflare. Please set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.',
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

  const tgApiBase = `https://api.telegram.org/bot${botToken}`;
  const results: Array<{ cardId: string; status: 'published' | 'skipped' | 'error'; messageId?: number; error?: string }> = [];

  for (const card of cards) {
    if (!card.cardId) continue;
    const kvKey = `tg_sent_${card.cardId}`;

    // Check if already published in Cloudflare KV
    if (env.TELEGRAM_POSTS_KV) {
      try {
        const existing = await env.TELEGRAM_POSTS_KV.get(kvKey);
        if (existing) {
          results.push({ cardId: card.cardId, status: 'skipped' });
          continue;
        }
      } catch (kvErr) {
        console.warn(`[Telegram Sync] KV read error for ${kvKey}:`, kvErr);
      }
    }

    const postText = formatCardPost(card);

    try {
      let sendRes: Response;

      // Handle Card with Image
      if (card.imageUrl && /^https?:\/\//i.test(card.imageUrl)) {
        const caption = postText.slice(0, 1024);
        sendRes = await fetch(`${tgApiBase}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: card.imageUrl,
            caption,
            parse_mode: 'HTML',
          }),
        });

        // If caption was truncated, follow up with the rest of the text
        if (postText.length > 1024) {
          await fetch(`${tgApiBase}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: postText.slice(1024, 5120),
              parse_mode: 'HTML',
            }),
          });
        }
      } else if (card.audio?.audioUri && /^https?:\/\//i.test(card.audio.audioUri)) {
        // Handle Voice / Audio Card
        const caption = postText.slice(0, 1024);
        sendRes = await fetch(`${tgApiBase}/sendAudio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            audio: card.audio.audioUri,
            title: card.title || 'Voice Note',
            caption,
            parse_mode: 'HTML',
          }),
        });
      } else {
        // Handle Standard Text Note / Link Note
        sendRes = await fetch(`${tgApiBase}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: postText.slice(0, 4096),
            parse_mode: 'HTML',
            disable_web_page_preview: false,
          }),
        });
      }

      const resData: any = await sendRes.json().catch(() => ({}));

      if (!sendRes.ok || !resData.ok) {
        throw new Error(resData.description || `Telegram API error (${sendRes.status})`);
      }

      const messageId = resData.result?.message_id;

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
}
