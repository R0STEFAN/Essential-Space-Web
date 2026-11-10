import type { Env } from '../types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function resolveUrl(relativeOrAbsolute: string, baseUrl: string): string {
  try {
    return new URL(relativeOrAbsolute, baseUrl).href;
  } catch {
    return relativeOrAbsolute;
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractMeta(html: string, propertyOrNames: string[]): string | null {
  for (const name of propertyOrNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex1 = new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      'i'
    );
    const match1 = html.match(regex1);
    if (match1 && match1[1]) return decodeHtmlEntities(match1[1].trim());

    const regex2 = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`,
      'i'
    );
    const match2 = html.match(regex2);
    if (match2 && match2[1]) return decodeHtmlEntities(match2[1].trim());
  }
  return null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match && match[1] ? decodeHtmlEntities(match[1].trim()) : null;
}

function extractFavicon(html: string, baseUrl: string): string {
  const match =
    html.match(
      /<link[^>]+(?:rel=["'](?:shortcut icon|icon|apple-touch-icon)["'])[^>]+href=["']([^"']*)["']/i
    ) ||
    html.match(
      /<link[^>]+href=["']([^"']*)["'][^>]+(?:rel=["'](?:shortcut icon|icon|apple-touch-icon)["'])/i
    );
  if (match && match[1]) {
    return resolveUrl(match[1].trim(), baseUrl);
  }
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/favicon.ico`;
  } catch {
    return '';
  }
}

/**
 * Known platforms high-reliability OpenGraph generators
 */
function getDomainHeuristicPreview(targetUrl: string): { preview?: string; favicon?: string } {
  try {
    const u = new URL(targetUrl);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();

    // 1. GitHub Repos: https://github.com/owner/repo
    if (host === 'github.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && !['features', 'pricing', 'about', 'enterprise', 'topics', 'trending', 'collections'].includes(parts[0])) {
        return {
          preview: `https://opengraph.githubassets.com/1/${parts[0]}/${parts[1]}`,
          favicon: 'https://github.githubassets.com/favicons/favicon.svg',
        };
      }
      return { favicon: 'https://github.githubassets.com/favicons/favicon.svg' };
    }

    // 2. YouTube Video
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const v = u.searchParams.get('v');
      if (v) {
        return {
          preview: `https://i.ytimg.com/vi/${v}/hqdefault.jpg`,
          favicon: 'https://www.youtube.com/s/desktop/favicon.ico',
        };
      }
    }
    if (host === 'youtu.be') {
      const v = u.pathname.replace(/^\//, '').split('/')[0];
      if (v) {
        return {
          preview: `https://i.ytimg.com/vi/${v}/hqdefault.jpg`,
          favicon: 'https://www.youtube.com/s/desktop/favicon.ico',
        };
      }
    }
  } catch {}
  return {};
}

export async function handleLinkPreview(req: Request, _env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  const url = new URL(req.url);
  let targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing target URL (?url=)' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Auto-prepend https:// if protocol is missing
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid target URL' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const domain = parsedTarget.hostname.replace(/^www\./, '');
  const heuristics = getDomainHeuristicPreview(targetUrl);

  let title = domain;
  let description = '';
  let preview = heuristics.preview;
  let siteName = domain;
  let favicon = heuristics.favicon || `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  // 1. Direct HTML fetch & parse
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'uk,en-US;q=0.9,en;q=0.8',
      },
    });

    clearTimeout(timeout);

    if (res.ok) {
      // Read first ~256KB of HTML
      const reader = res.body?.getReader();
      let html = '';
      if (reader) {
        const decoder = new TextDecoder();
        let bytesRead = 0;
        while (bytesRead < 262144) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          bytesRead += value.length;
          html += decoder.decode(value, { stream: true });
          if (html.includes('</head>')) break;
        }
        reader.cancel().catch(() => {});
      } else {
        html = await res.text();
      }

      const extractedTitle =
        extractMeta(html, ['og:title', 'twitter:title']) ||
        extractTitle(html);
      if (extractedTitle) title = extractedTitle;

      const extractedDesc =
        extractMeta(html, ['og:description', 'twitter:description', 'description']);
      if (extractedDesc) description = extractedDesc;

      const rawPreview =
        extractMeta(html, ['og:image', 'twitter:image', 'twitter:image:src', 'image']);
      if (rawPreview) {
        preview = resolveUrl(rawPreview, targetUrl);
      }

      const extractedSite = extractMeta(html, ['og:site_name', 'twitter:site']);
      if (extractedSite) siteName = extractedSite;

      const extractedFav = extractFavicon(html, targetUrl);
      if (extractedFav) favicon = extractedFav;
    }
  } catch (directErr) {
    console.warn(`[LinkPreview] Direct HTML scrape failed for ${targetUrl}:`, directErr);
  }

  // 2. Server-side Microlink fallback if no preview or generic title
  if (!preview || !title || title === domain) {
    try {
      const mRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}`, {
        headers: { 'User-Agent': BROWSER_USER_AGENT },
      });
      if (mRes.ok) {
        const mData: any = await mRes.json().catch(() => ({}));
        if (mData?.status === 'success' && mData.data) {
          const d = mData.data;
          if (d.title && (!title || title === domain)) title = d.title;
          if (d.description && !description) description = d.description;
          if (d.image?.url && !preview) preview = d.image.url;
          if (d.logo?.url) favicon = d.logo.url;
          if (d.publisher && (!siteName || siteName === domain)) siteName = d.publisher;
        }
      }
    } catch (mErr) {
      console.warn(`[LinkPreview] Microlink fallback failed for ${targetUrl}:`, mErr);
    }
  }

  // 3. Final ensure preview image from heuristics
  if (!preview && heuristics.preview) {
    preview = heuristics.preview;
  }

  const result = {
    url: targetUrl,
    title: title || domain,
    description: description || '',
    preview,
    favicon: favicon || `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
    domain,
    siteName: siteName || domain,
    isFallback: !preview && title === domain,
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
