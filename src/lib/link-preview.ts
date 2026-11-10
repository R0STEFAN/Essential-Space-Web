import type { CardLink } from '@/types';

/**
 * Normalizes input URL string ensuring it has http:// or https:// protocol
 */
export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Extracts hostname domain from a URL without 'www.' prefix
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/**
 * Fast platform-specific OpenGraph image heuristics
 */
function getPlatformPreviewHeuristic(url: string): { preview?: string; favicon?: string } {
  try {
    const u = new URL(normalizeUrl(url));
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();

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

/**
 * Fetches rich OpenGraph metadata for a URL (title, description, preview image, favicon, domain, siteName)
 * Cascading hierarchy: Edge Cloudflare Worker (/api/link-preview) -> Client Microlink -> Heuristics -> Domain fallback
 */
export async function fetchLinkPreview(rawUrl: string): Promise<CardLink> {
  const url = normalizeUrl(rawUrl);
  const domain = extractDomain(url) || url;
  const platform = getPlatformPreviewHeuristic(url);
  const defaultFavicon = platform.favicon || `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

  // Baseline fallback
  const fallback: CardLink = {
    url,
    title: domain,
    description: url,
    domain,
    siteName: domain,
    favicon: defaultFavicon,
    preview: platform.preview,
  };

  if (!url || !/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(url)) {
    return fallback;
  }

  // 1. Try our own edge API endpoint
  try {
    const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (res.ok) {
      const data = await res.json();
      const hasRealTitle = Boolean(data?.title && data.title !== domain && data.title !== url);
      const hasPreview = Boolean(data?.preview);

      // Only accept if it actually resolved metadata (not a bare fallback)
      if (hasRealTitle || hasPreview) {
        return {
          url,
          title: data.title || domain,
          description: data.description || '',
          preview: data.preview || platform.preview,
          favicon: data.favicon || defaultFavicon,
          domain: data.domain || domain,
          siteName: data.siteName || domain,
        };
      }
    }
  } catch (err) {
    console.warn('[LinkPreview] Local endpoint failed, trying client fallback...', err);
  }

  // 2. Try Microlink public metadata API directly from client browser
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const mRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (mRes.ok) {
      const json = await mRes.json();
      if (json?.status === 'success' && json.data) {
        const d = json.data;
        return {
          url,
          title: d.title || domain,
          description: d.description || '',
          preview: d.image?.url || platform.preview,
          favicon: d.logo?.url || defaultFavicon,
          domain,
          siteName: d.publisher || domain,
        };
      }
    }
  } catch (mErr) {
    console.warn('[LinkPreview] Microlink client fallback error:', mErr);
  }

  return fallback;
}
